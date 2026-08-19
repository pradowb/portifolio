'use strict';

/* =========================================================================
   LUME. — reveal de tinta fluida sobre wordmark 3D em relevo falso
   WebGL2 puro, sem bibliotecas. Um único canvas.
   ========================================================================= */

const CFG = {
  // simulação de fluido (Stam / stable fluids)
  SIM_RES: 128,
  DYE_RES: 1024,
  PRESSURE_ITERATIONS: 20,
  PRESSURE: 0.8,
  CURL: 12,
  DENSITY_DISSIPATION: 2.6,
  VELOCITY_DISSIPATION: 1.4,
  SPLAT_RADIUS: 0.0015,
  SPLAT_FORCE: 2600,
  SPLAT_SPACING: 0.006,
  MASK_LO: 0.10,
  MASK_HI: 0.34,

  // ritmo
  IDLE_TIMEOUT: 2600, // ms sem input até começar o drift ocioso
  DT_MAX: 1 / 30,

  // material 3D — jornada de tratamento dental (ver MATERIALS abaixo):
  // Beat 1 Esmalte natural -> Beat 2 Clareamento -> Beat 3 Faceta de porcelana ->
  // Beat 4 Verniz de última geração (único momento com o ciano de marca) ->
  // Beat 5 Sorriso iluminado -> fecha o loop de volta ao Beat 1
  MATERIAL_BEAT_MS: 2500, // duração de cada beat do morph
  NORMAL_STRENGTH: 5.2, // força do relevo falso (dx,dy -> normal)
  BEVEL_BLUR_PASSES: 5, // pares horizontal+vertical
  CURSOR_LIGHT_INFLUENCE: 0.30,
  LIGHT_LERP: 0.06,

  // tipografia / layout
  WORDMARK_WIDTH_FRAC: 0.70,
  LETTER_SPACING_EM: -0.03,
  FONT_STACK: '"Archivo Black", "Helvetica Neue", Arial, sans-serif',
  WORDMARK_TEX_MAX: 2048,

  DPR_MAX: 2,
};

// Exposto só pra leitura — usado por animations.js pra estilizar o proxy DOM
// do reveal inicial da wordmark (ver seção 2 do módulo de scroll). Não afeta
// nada aqui: a wordmark real continua sendo desenhada no canvas offscreen.
window.LUME_WORDMARK_STYLE = {
  fontStack: CFG.FONT_STACK,
  letterSpacingEm: CFG.LETTER_SPACING_EM,
  widthFrac: CFG.WORDMARK_WIDTH_FRAC,
};

const MATERIALS = [
  { // Beat 1 — "Esmalte natural": ponto de partida, dente saudável comum
    name: 'esmalte-natural',
    baseColor: [0.949, 0.929, 0.882], // #F2EDE1
    specColor: [1.0, 1.0, 1.0],
    shininess: 32.0,
    fresnelColor: [1.0, 0.973, 0.910], // #FFF8E8
    fresnelPower: 4.5, // rim bem sutil, só nas bordas mais finas
    emissiveBoost: 0.0,
  },
  { // Beat 2 — "Clareamento": branco clareando, brilho interno leve
    name: 'clareamento',
    baseColor: [0.980, 0.980, 0.965], // #FAFAF6
    specColor: [1.0, 1.0, 1.0],
    shininess: 48.0,
    fresnelColor: [1.0, 1.0, 1.0], // #FFFFFF
    fresnelPower: 2.5,
    emissiveBoost: 0.08,
  },
  { // Beat 3 — "Faceta de porcelana": acabamento premium, espelhado, polido
    name: 'faceta-porcelana',
    baseColor: [1.0, 1.0, 1.0], // #FFFFFF
    specColor: [1.0, 1.0, 1.0],
    shininess: 96.0,
    fresnelColor: [0.910, 0.965, 1.0], // #E8F6FF
    fresnelPower: 1.8, // médio-baixo
    emissiveBoost: 0.05,
  },
  { // Beat 4 — "Verniz de última geração": único beat com o ciano de marca —
    // reflexo de verniz a laser restrito a specular/fresnel, nunca no baseColor
    // (evita leitura de metal/titânio/sci-fi)
    name: 'verniz-laser',
    baseColor: [1.0, 1.0, 1.0], // #FFFFFF, quase transparente
    specColor: [0.0, 0.898, 1.0], // #00E5FF
    shininess: 150.0,
    fresnelColor: [0.0, 0.898, 1.0], // #00E5FF
    fresnelPower: 5.0, // alto — só nas bordas finas
    emissiveBoost: 0.10,
  },
  { // Beat 5 — "Sorriso iluminado": resultado hero, radiante e quente,
    // fecha o loop de volta ao Beat 1 (manutenção contínua do sorriso)
    name: 'sorriso-iluminado',
    baseColor: [1.0, 0.992, 0.969], // #FFFDF7
    specColor: [1.0, 0.953, 0.839], // #FFF3D6
    shininess: 64.0,
    fresnelColor: [1.0, 0.937, 0.816], // #FFEFD0
    fresnelPower: 2.2,
    emissiveBoost: 0.25,
  },
];

const REDUCE_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ========================================================================= */

let canvas

export function startEngine() {
  canvas = document.getElementById('scene')
  if (!canvas) {
    console.warn('[LUME] Missing #scene canvas')
    return
  }
  boot()
}

async function boot() {
  await loadFonts();

  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
  });

  if (!gl) {
    console.warn('[LUME] WebGL2 indisponível — usando fallback Canvas2D (sem morph de material).');
    startCanvas2DFallback();
    return;
  }

  const caps = probeCapabilities(gl);

  if (!caps.simSupported) {
    console.warn('[LUME] Texturas flutuantes renderizáveis indisponíveis (EXT_color_buffer_float) — usando reveal radial simplificado em WebGL2, sem morph de material.');
    startWebGLRadialFallback(gl);
    return;
  }

  startFluidExperience(gl, caps);
}

async function loadFonts() {
  const spec = '900 100px "Archivo Black"';
  try {
    if (document.fonts && document.fonts.load) {
      await document.fonts.load(spec);
      await document.fonts.ready;
    }
  } catch (e) {
    console.warn('[LUME] Falha ao carregar Archivo Black, seguindo com fallback de fonte.', e);
  }
}

/* =========================================================================
   Capacidades / probing de formatos flutuantes
   ========================================================================= */

function probeCapabilities(gl) {
  const hasColorBufferFloat = !!gl.getExtension('EXT_color_buffer_float');
  const hasFloatLinear = !!gl.getExtension('OES_texture_float_linear');

  let simSupported = false;
  let dyeFormat = null;
  let velocityFormat = null;
  let pressureFormat = null;

  if (hasColorBufferFloat) {
    const rgba16f = { internalFormat: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT };
    const rg16f = { internalFormat: gl.RG16F, format: gl.RG, type: gl.HALF_FLOAT };
    const r16f = { internalFormat: gl.R16F, format: gl.RED, type: gl.HALF_FLOAT };

    const okRGBA = supportRenderTextureFormat(gl, rgba16f);
    if (okRGBA) {
      dyeFormat = rgba16f;
      velocityFormat = supportRenderTextureFormat(gl, rg16f) ? rg16f : rgba16f;
      pressureFormat = supportRenderTextureFormat(gl, r16f) ? r16f : rgba16f;
      simSupported = true;
    }
  }

  return { simSupported, dyeFormat, velocityFormat, pressureFormat, hasFloatLinear };
}

function supportRenderTextureFormat(gl, fmt) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, fmt.internalFormat, 4, 4, 0, fmt.format, fmt.type, null);

  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(fbo);
  gl.deleteTexture(tex);
  return status === gl.FRAMEBUFFER_COMPLETE;
}

/* =========================================================================
   Shaders (GLSL ES 3.00)
   ========================================================================= */

const VERTEX_SHADER = `#version 300 es
precision highp float;
in vec2 aPosition;
out vec2 vUv;
out vec2 vL;
out vec2 vR;
out vec2 vT;
out vec2 vB;
uniform vec2 texelSize;
void main () {
  vUv = aPosition * 0.5 + 0.5;
  vL = vUv - vec2(texelSize.x, 0.0);
  vR = vUv + vec2(texelSize.x, 0.0);
  vT = vUv + vec2(0.0, texelSize.y);
  vB = vUv - vec2(0.0, texelSize.y);
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const FRAG_HEADER = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
out vec4 fragColor;
`;

const SPLAT_SHADER = FRAG_HEADER + `
uniform sampler2D uTarget;
uniform float aspectRatio;
uniform vec3 color;
uniform vec2 point;
uniform float radius;
void main () {
  vec2 p = vUv - point;
  p.x *= aspectRatio;
  vec3 splat = exp(-dot(p, p) / radius) * color;
  vec3 base = texture(uTarget, vUv).xyz;
  fragColor = vec4(base + splat, 1.0);
}`;

const ADVECTION_SHADER = FRAG_HEADER + `
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 texelSize;
uniform vec2 sourceTexelSize;
uniform float dt;
uniform float dissipation;

vec4 bilerp (sampler2D tex, vec2 uv, vec2 tsize) {
  vec2 st = uv / tsize - 0.5;
  vec2 iuv = floor(st);
  vec2 fuv = fract(st);
  vec4 a = texture(tex, (iuv + vec2(0.5, 0.5)) * tsize);
  vec4 b = texture(tex, (iuv + vec2(1.5, 0.5)) * tsize);
  vec4 c = texture(tex, (iuv + vec2(0.5, 1.5)) * tsize);
  vec4 d = texture(tex, (iuv + vec2(1.5, 1.5)) * tsize);
  return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
}

void main () {
#ifdef MANUAL_FILTERING
  vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;
  vec4 result = bilerp(uSource, coord, sourceTexelSize);
#else
  vec2 coord = vUv - dt * texture(uVelocity, vUv).xy * texelSize;
  vec4 result = texture(uSource, coord);
#endif
  float decay = 1.0 + dissipation * dt;
  fragColor = result / decay;
}`;

const DIVERGENCE_SHADER = FRAG_HEADER + `
uniform sampler2D uVelocity;
void main () {
  float L = texture(uVelocity, vL).x;
  float R = texture(uVelocity, vR).x;
  float T = texture(uVelocity, vT).y;
  float B = texture(uVelocity, vB).y;
  vec2 C = texture(uVelocity, vUv).xy;
  if (vL.x < 0.0) { L = -C.x; }
  if (vR.x > 1.0) { R = -C.x; }
  if (vT.y > 1.0) { T = -C.y; }
  if (vB.y < 0.0) { B = -C.y; }
  float div = 0.5 * (R - L + T - B);
  fragColor = vec4(div, 0.0, 0.0, 1.0);
}`;

const CURL_SHADER = FRAG_HEADER + `
uniform sampler2D uVelocity;
void main () {
  float L = texture(uVelocity, vL).y;
  float R = texture(uVelocity, vR).y;
  float T = texture(uVelocity, vT).x;
  float B = texture(uVelocity, vB).x;
  float vorticity = R - L - T + B;
  fragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
}`;

const VORTICITY_SHADER = FRAG_HEADER + `
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform float curl;
uniform float dt;
void main () {
  float L = texture(uCurl, vL).x;
  float R = texture(uCurl, vR).x;
  float T = texture(uCurl, vT).x;
  float B = texture(uCurl, vB).x;
  float C = texture(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 0.0001;
  force *= curl * C;
  force.y *= -1.0;
  vec2 vel = texture(uVelocity, vUv).xy;
  fragColor = vec4(vel + force * dt, 0.0, 1.0);
}`;

const PRESSURE_SHADER = FRAG_HEADER + `
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
void main () {
  float L = texture(uPressure, vL).x;
  float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x;
  float B = texture(uPressure, vB).x;
  float divergence = texture(uDivergence, vUv).x;
  float pressure = (L + R + B + T - divergence) * 0.25;
  fragColor = vec4(pressure, 0.0, 0.0, 1.0);
}`;

const GRADIENT_SUBTRACT_SHADER = FRAG_HEADER + `
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
void main () {
  float L = texture(uPressure, vL).x;
  float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x;
  float B = texture(uPressure, vB).x;
  vec2 vel = texture(uVelocity, vUv).xy;
  vel -= vec2(R - L, T - B) * 0.5;
  fragColor = vec4(vel, 0.0, 1.0);
}`;

const CLEAR_SHADER = FRAG_HEADER + `
uniform sampler2D uTexture;
uniform float value;
void main () {
  fragColor = value * texture(uTexture, vUv);
}`;

const COPY_SHADER = FRAG_HEADER + `
uniform sampler2D uTexture;
void main () {
  fragColor = texture(uTexture, vUv);
}`;

const BLUR_SHADER = FRAG_HEADER + `
uniform sampler2D uTexture;
uniform vec2 direction;
void main () {
  vec4 sum = texture(uTexture, vUv) * 0.2270270270;
  sum += texture(uTexture, vUv + direction * 1.0) * 0.1945945946;
  sum += texture(uTexture, vUv - direction * 1.0) * 0.1945945946;
  sum += texture(uTexture, vUv + direction * 2.0) * 0.1216216216;
  sum += texture(uTexture, vUv - direction * 2.0) * 0.1216216216;
  sum += texture(uTexture, vUv + direction * 3.0) * 0.0540540541;
  sum += texture(uTexture, vUv - direction * 3.0) * 0.0540540541;
  fragColor = sum;
}`;

const MATERIAL_SHADER = FRAG_HEADER + `
uniform sampler2D uHeight;
uniform float uStrength;
uniform vec3 uBaseColor;
uniform vec3 uSpecColor;
uniform float uShininess;
uniform vec3 uFresnelColor;
uniform float uFresnelPower;
uniform float uEmissiveBoost;
uniform vec2 uLightPos;

void main () {
  float hL = texture(uHeight, vL).r;
  float hR = texture(uHeight, vR).r;
  float hT = texture(uHeight, vT).r;
  float hB = texture(uHeight, vB).r;
  float dx = (hR - hL) * uStrength;
  float dy = (hT - hB) * uStrength;
  vec3 N = normalize(vec3(-dx, -dy, 1.0));

  vec3 lightDir = normalize(vec3(uLightPos, 0.72));
  vec3 viewDir = vec3(0.0, 0.0, 1.0);
  vec3 H = normalize(lightDir + viewDir);
  vec3 fillDir = normalize(vec3(-uLightPos * 0.6, 0.55));

  float diffuse = max(dot(N, lightDir), 0.0);
  float fill = max(dot(N, fillDir), 0.0) * 0.22;
  float specular = pow(max(dot(N, H), 0.0), uShininess);
  float fresnel = pow(1.0 - clamp(dot(N, viewDir), 0.0, 1.0), uFresnelPower);

  // leve variação de matiz pelo relevo, sem lavar cores saturadas (ex.: o ciano do Beat 4)
  vec3 fresnelTint = mix(uFresnelColor, uFresnelColor.gbr, (0.5 + 0.5 * N.x) * 0.18);

  vec3 color = uBaseColor * (0.32 + 0.68 * diffuse) + uBaseColor * fill;
  color += uSpecColor * specular;
  color += fresnelTint * fresnel;
  color += uBaseColor * uEmissiveBoost;

  float h = texture(uHeight, vUv).r;
  color *= mix(0.90, 1.0, h);

  // com baseColor perto do branco puro (Beats 3/4), a difusa já satura o canal
  // sozinha — sem isto, o specular/fresnel (ex.: o ciano do verniz) estoura
  // igualmente em R/G/B e o clamp final apaga a cor. Dividir pelo canal mais
  // alto preserva o matiz em vez de cortar pra branco.
  float peak = max(color.r, max(color.g, color.b));
  if (peak > 1.0) color /= peak;

  fragColor = vec4(color, 1.0);
}`;

const COMPOSITE_SHADER = FRAG_HEADER + `
uniform sampler2D uDye;
uniform sampler2D uPaper;
uniform sampler2D uMaterialScene;
uniform float maskLo;
uniform float maskHi;
void main () {
  float d = texture(uDye, vUv).r;
  float mask = smoothstep(maskLo, maskHi, d);
  vec3 paperColor = texture(uPaper, vUv).rgb;
  vec3 materialColor = texture(uMaterialScene, vUv).rgb;
  fragColor = vec4(mix(paperColor, materialColor, mask), 1.0);
}`;

/* =========================================================================
   Wordmark: fonte de verdade única (canvas 2D offscreen)
   Uma única passagem de layout alimenta a textura de papel E o height-field.
   ========================================================================= */

function buildWordmarkLayout(ctx, refSize) {
  ctx.font = `900 ${refSize}px ${CFG.FONT_STACK}`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  const letters = ['L', 'U', 'M', 'E'];
  const tracking = CFG.LETTER_SPACING_EM * refSize;

  let x = 0;
  let capHeight = 0;
  const glyphs = [];
  for (const ch of letters) {
    const m = ctx.measureText(ch);
    glyphs.push({ ch, x, width: m.width });
    capHeight = Math.max(capHeight, m.actualBoundingBoxAscent || refSize * 0.72);
    x += m.width + tracking;
  }

  const totalWidth = x - tracking;

  return { glyphs, capHeight, totalWidth, refSize, tracking };
}

function paintWordmark(ctx, w, h, bgStyle, fillStyle) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = bgStyle;
  ctx.fillRect(0, 0, w, h);

  // passo 1: mede no tamanho de referência
  const ref = 200;
  const probe = buildWordmarkLayout(ctx, ref);
  const targetWidth = w * CFG.WORDMARK_WIDTH_FRAC;
  const scale = targetWidth / probe.totalWidth;
  const fontSize = ref * scale;

  // passo 2: remede no tamanho final para precisão de subpixel
  const layout = buildWordmarkLayout(ctx, fontSize);
  const totalWidth = layout.totalWidth;
  const offsetX = (w - totalWidth) / 2;
  const baselineY = h / 2 + layout.capHeight / 2;

  ctx.font = `900 ${fontSize}px ${CFG.FONT_STACK}`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = fillStyle;

  for (const g of layout.glyphs) {
    ctx.fillText(g.ch, offsetX + g.x, baselineY);
  }

  return { offsetX, baselineY, totalWidth, layout, fontSize };
}

function buildWordmarkTextures(cssWidth, cssHeight) {
  const aspect = cssWidth / cssHeight;
  let texW = Math.min(CFG.WORDMARK_TEX_MAX, Math.round(cssWidth));
  let texH = Math.round(texW / aspect);

  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = texW;
  maskCanvas.height = texH;
  const maskCtx = maskCanvas.getContext('2d');

  const paperCanvas = document.createElement('canvas');
  paperCanvas.width = texW;
  paperCanvas.height = texH;
  const paperCtx = paperCanvas.getContext('2d');

  // única fonte de verdade: mesma geometria, duas paletas
  paintWordmark(maskCtx, texW, texH, '#000000', '#ffffff');
  paintWordmark(paperCtx, texW, texH, '#faf7f3', '#000000');

  return { maskCanvas, paperCanvas, texW, texH };
}

/* =========================================================================
   Experiência completa (WebGL2 + texturas flutuantes)
   ========================================================================= */

function startFluidExperience(gl, caps) {
  // zero é o valor neutro correto para velocidade/pressão/dye recém-alocados
  gl.clearColor(0, 0, 0, 0);

  const hasFloatLinear = caps.hasFloatLinear;
  const filterMode = hasFloatLinear ? gl.LINEAR : gl.NEAREST;
  const filteringKeywords = hasFloatLinear ? [] : ['MANUAL_FILTERING'];

  const quadVAO = createQuadVAO(gl);

  const programs = {
    splat: createProgram(gl, VERTEX_SHADER, SPLAT_SHADER),
    advection: createProgram(gl, VERTEX_SHADER, ADVECTION_SHADER, filteringKeywords),
    divergence: createProgram(gl, VERTEX_SHADER, DIVERGENCE_SHADER),
    curl: createProgram(gl, VERTEX_SHADER, CURL_SHADER),
    vorticity: createProgram(gl, VERTEX_SHADER, VORTICITY_SHADER),
    pressure: createProgram(gl, VERTEX_SHADER, PRESSURE_SHADER),
    gradientSubtract: createProgram(gl, VERTEX_SHADER, GRADIENT_SUBTRACT_SHADER),
    clear: createProgram(gl, VERTEX_SHADER, CLEAR_SHADER),
    copy: createProgram(gl, VERTEX_SHADER, COPY_SHADER),
    blur: createProgram(gl, VERTEX_SHADER, BLUR_SHADER),
    material: createProgram(gl, VERTEX_SHADER, MATERIAL_SHADER),
    composite: createProgram(gl, VERTEX_SHADER, COMPOSITE_SHADER),
  };

  function drawQuad(program) {
    gl.useProgram(program.program);
    gl.bindVertexArray(quadVAO);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  }

  function createFBO(w, h, fmt, filter) {
    gl.activeTexture(gl.TEXTURE0);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, fmt.internalFormat, w, h, 0, fmt.format, fmt.type, null);

    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT);

    return {
      texture, fbo, width: w, height: h,
      texelSizeX: 1 / w, texelSizeY: 1 / h,
      attach(id) {
        gl.activeTexture(gl.TEXTURE0 + id);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        return id;
      },
    };
  }

  function createDoubleFBO(w, h, fmt, filter) {
    let fbo1 = createFBO(w, h, fmt, filter);
    let fbo2 = createFBO(w, h, fmt, filter);
    return {
      width: w, height: h, texelSizeX: fbo1.texelSizeX, texelSizeY: fbo1.texelSizeY,
      get read() { return fbo1; },
      set read(v) { fbo1 = v; },
      get write() { return fbo2; },
      set write(v) { fbo2 = v; },
      swap() { const t = fbo1; fbo1 = fbo2; fbo2 = t; },
    };
  }

  function getResolution(resolution) {
    let aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;
    if (aspectRatio < 1) aspectRatio = 1.0 / aspectRatio;
    const min = Math.round(resolution);
    const max = Math.round(resolution * aspectRatio);
    if (gl.drawingBufferWidth > gl.drawingBufferHeight) return { width: max, height: min };
    return { width: min, height: max };
  }

  // ---- estado da simulação ----
  let dye, velocity, pressure, divergenceFBO, curlFBO;
  let heightPing, heightPong;
  let materialSceneFBO;
  let paperTex = null;

  function allocSimTargets() {
    const simRes = getResolution(CFG.SIM_RES);
    const dyeRes = getResolution(CFG.DYE_RES);

    dye = createDoubleFBO(dyeRes.width, dyeRes.height, caps.dyeFormat, filterMode);
    velocity = createDoubleFBO(simRes.width, simRes.height, caps.velocityFormat, filterMode);
    pressure = createDoubleFBO(simRes.width, simRes.height, caps.pressureFormat, gl.NEAREST);
    divergenceFBO = createFBO(simRes.width, simRes.height, caps.pressureFormat, gl.NEAREST);
    curlFBO = createFBO(simRes.width, simRes.height, caps.pressureFormat, gl.NEAREST);
  }

  function uploadWordmarkTextures(cssWidth, cssHeight) {
    const built = buildWordmarkTextures(cssWidth, cssHeight);

    if (paperTex) gl.deleteTexture(paperTex.texture);
    paperTex = uploadCanvasTexture(gl, built.paperCanvas, gl.RGBA8, gl.RGBA);

    const maskR8 = uploadCanvasTexture(gl, built.maskCanvas, gl.R8, gl.RED);

    // height-field: blur separável em ping-pong para arredondar bordas (bisel)
    const R8 = { internalFormat: gl.R8, format: gl.RED, type: gl.UNSIGNED_BYTE };
    heightPing = createFBO(built.texW, built.texH, R8, gl.LINEAR);
    heightPong = createFBO(built.texW, built.texH, R8, gl.LINEAR);

    // copia a máscara crua para heightPing
    gl.viewport(0, 0, built.texW, built.texH);
    gl.bindFramebuffer(gl.FRAMEBUFFER, heightPing.fbo);
    programs.copy.bind();
    gl.uniform1i(programs.copy.uniforms.uTexture, maskR8.attach(0));
    drawQuad(programs.copy);
    gl.deleteTexture(maskR8.texture);

    let src = heightPing, dst = heightPong;
    for (let i = 0; i < CFG.BEVEL_BLUR_PASSES; i++) {
      // horizontal
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
      gl.viewport(0, 0, dst.width, dst.height);
      programs.blur.bind();
      gl.uniform1i(programs.blur.uniforms.uTexture, src.attach(0));
      gl.uniform2f(programs.blur.uniforms.direction, src.texelSizeX, 0.0);
      drawQuad(programs.blur);
      [src, dst] = [dst, src];

      // vertical
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
      gl.viewport(0, 0, dst.width, dst.height);
      programs.blur.bind();
      gl.uniform1i(programs.blur.uniforms.uTexture, src.attach(0));
      gl.uniform2f(programs.blur.uniforms.direction, 0.0, src.texelSizeY);
      drawQuad(programs.blur);
      [src, dst] = [dst, src];
    }
    heightPing = src; // resultado final do relevo

    materialSceneFBO = createFBO(built.texW, built.texH, { internalFormat: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE }, gl.LINEAR);
  }

  // ---- programas: setar uniforms auxiliares ----
  for (const key in programs) {
    programs[key].bind = () => {
      gl.useProgram(programs[key].program);
    };
  }

  /* ---------------- pointer / input ---------------- */

  const pointer = {
    x: 0.5, y: 0.5, prevX: 0.5, prevY: 0.5,
    down: false, moved: false,
    lastMoveTime: performance.now(),
  };
  let smoothLight = [-0.35, 0.4];
  const DEFAULT_LIGHT = [-0.35, 0.4];

  const pendingSplats = [];

  function queueSplat(x, y, dx, dy) {
    pendingSplats.push({ x, y, dx, dy });
  }

  function splatFromSegment(x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0;
    const dist = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.floor(dist / CFG.SPLAT_SPACING));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      queueSplat(x0 + dx * t, y0 + dy * t, dx, dy);
    }
  }

  function normPos(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    const y = 1.0 - (clientY - rect.top) / rect.height;
    return [x, y];
  }

  function onPointerMove(e) {
    const [x, y] = normPos(e.clientX, e.clientY);
    pointer.lastMoveTime = performance.now();
    pointer.moved = true;
    splatFromSegment(pointer.x, pointer.y, x, y);
    pointer.prevX = pointer.x; pointer.prevY = pointer.y;
    pointer.x = x; pointer.y = y;
  }

  function onPointerDown(e) {
    const [x, y] = normPos(e.clientX, e.clientY);
    pointer.x = pointer.prevX = x;
    pointer.y = pointer.prevY = y;
    pointer.down = true;
    pointer.lastMoveTime = performance.now();
    queueSplat(x, y, (Math.random() - 0.5) * 0.02, (Math.random() - 0.5) * 0.02);
  }

  function onPointerUp() { pointer.down = false; }

  canvas.addEventListener('pointermove', onPointerMove, { passive: true });
  canvas.addEventListener('pointerdown', onPointerDown, { passive: true });
  window.addEventListener('pointerup', onPointerUp, { passive: true });
  canvas.addEventListener('pointerleave', () => { pointer.moved = false; }, { passive: true });

  // drift ocioso — baseado em tempo sem input, nunca em hover:none
  let idleAngle = Math.random() * Math.PI * 2;
  let idleX = 0.5, idleY = 0.5, idleInit = false;

  function stepIdleDrift(dt) {
    if (REDUCE_MOTION) return;
    const since = performance.now() - pointer.lastMoveTime;
    if (since < CFG.IDLE_TIMEOUT) return;
    if (!idleInit) { idleX = pointer.x; idleY = pointer.y; idleInit = true; }
    const prevX = idleX, prevY = idleY;
    idleAngle += dt * 0.6 + (Math.random() - 0.5) * 0.4;
    idleX += Math.cos(idleAngle) * 0.09 * dt;
    idleY += Math.sin(idleAngle * 0.8) * 0.09 * dt;
    idleX = Math.min(0.88, Math.max(0.12, idleX));
    idleY = Math.min(0.85, Math.max(0.15, idleY));
    splatFromSegment(prevX, prevY, idleX, idleY);
  }

  /* ---------------- material morph timer ---------------- */
  //
  // PONTO DE INTEGRAÇÃO COM SCROLL (não implementado aqui, ver animations.js):
  // animations.js expõe `LUME_ANIM.onScrollProgress(fn)` e
  // `LUME_ANIM.onScrollActiveChange(fn)`. Esta função (`materialTime`) é o
  // "timer ambiente" e continua sendo a fonte de verdade padrão do estágio.
  // Pra deixar o scroll assumir o controle quando a seção pinada estiver
  // ativa, o padrão seria algo como:
  //
  //   let scrollActive = false, scrollProgress = 0;
  //   window.LUME_ANIM && window.LUME_ANIM.onScrollActiveChange(v => scrollActive = v);
  //   window.LUME_ANIM && window.LUME_ANIM.onScrollProgress(p => scrollProgress = p);
  //
  //   function stepMaterialTimer(dtMs) {
  //     if (!REDUCE_MOTION && !scrollActive) materialTime += dtMs; // timer ambiente pausa
  //   }
  //   function currentMaterial() {
  //     const cycle = CFG.MATERIAL_BEAT_MS * MATERIALS.length;
  //     const t = scrollActive ? scrollProgress * cycle : (((materialTime % cycle) + cycle) % cycle);
  //     ...resto igual, usando `t` no lugar de recalcular a partir de materialTime
  //   }
  //
  // Ou seja: `scrollActive` decide qual fonte de `t` usar, e o timer ambiente
  // simplesmente para de acumular enquanto o scroll está no controle (pra
  // retomar de onde parou, sem salto, quando `onScrollActiveChange(false)`).
  // Isso é intencionalmente só um comentário — a troca real fica de fora
  // do escopo deste módulo.

  let materialTime = 0;
  function stepMaterialTimer(dtMs) {
    if (!REDUCE_MOTION) materialTime += dtMs;
  }
  function currentMaterial() {
    const n = MATERIALS.length;
    const cycle = CFG.MATERIAL_BEAT_MS * n;
    const t = ((materialTime % cycle) + cycle) % cycle;
    const idx = Math.floor(t / CFG.MATERIAL_BEAT_MS);
    const frac = (t - idx * CFG.MATERIAL_BEAT_MS) / CFG.MATERIAL_BEAT_MS;
    const a = MATERIALS[idx];
    const b = MATERIALS[(idx + 1) % n];
    return lerpMaterial(a, b, frac);
  }
  function lerpMaterial(a, b, t) {
    const lerp3 = (u, v) => [u[0] + (v[0] - u[0]) * t, u[1] + (v[1] - u[1]) * t, u[2] + (v[2] - u[2]) * t];
    return {
      baseColor: lerp3(a.baseColor, b.baseColor),
      specColor: lerp3(a.specColor, b.specColor),
      shininess: a.shininess + (b.shininess - a.shininess) * t,
      fresnelColor: lerp3(a.fresnelColor, b.fresnelColor),
      fresnelPower: a.fresnelPower + (b.fresnelPower - a.fresnelPower) * t,
      emissiveBoost: a.emissiveBoost + (b.emissiveBoost - a.emissiveBoost) * t,
    };
  }

  /* ---------------- simulação: passos ---------------- */

  function applySplats() {
    if (pendingSplats.length === 0) return;
    const aspect = gl.drawingBufferWidth / gl.drawingBufferHeight;

    for (const s of pendingSplats) {
      // velocidade
      gl.viewport(0, 0, velocity.width, velocity.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, velocity.write.fbo);
      programs.splat.bind();
      gl.uniform1i(programs.splat.uniforms.uTarget, velocity.read.attach(0));
      gl.uniform1f(programs.splat.uniforms.aspectRatio, aspect);
      gl.uniform2f(programs.splat.uniforms.point, s.x, s.y);
      gl.uniform3f(programs.splat.uniforms.color, s.dx * CFG.SPLAT_FORCE, s.dy * CFG.SPLAT_FORCE, 0.0);
      gl.uniform1f(programs.splat.uniforms.radius, correctRadius(aspect, CFG.SPLAT_RADIUS));
      drawQuad(programs.splat);
      velocity.swap();

      // dye
      gl.viewport(0, 0, dye.width, dye.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, dye.write.fbo);
      programs.splat.bind();
      gl.uniform1i(programs.splat.uniforms.uTarget, dye.read.attach(0));
      gl.uniform1f(programs.splat.uniforms.aspectRatio, aspect);
      gl.uniform2f(programs.splat.uniforms.point, s.x, s.y);
      gl.uniform3f(programs.splat.uniforms.color, 1.0, 1.0, 1.0);
      gl.uniform1f(programs.splat.uniforms.radius, correctRadius(aspect, CFG.SPLAT_RADIUS));
      drawQuad(programs.splat);
      dye.swap();
    }
    pendingSplats.length = 0;
  }

  function correctRadius(aspect, radius) {
    if (aspect > 1) return radius * aspect;
    return radius;
  }

  function stepFluid(dt) {
    gl.disable(gl.BLEND);

    // curl
    gl.viewport(0, 0, velocity.width, velocity.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, curlFBO.fbo);
    programs.curl.bind();
    gl.uniform2f(programs.curl.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(programs.curl.uniforms.uVelocity, velocity.read.attach(0));
    drawQuad(programs.curl);

    // vorticity confinement
    gl.bindFramebuffer(gl.FRAMEBUFFER, velocity.write.fbo);
    programs.vorticity.bind();
    gl.uniform2f(programs.vorticity.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(programs.vorticity.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(programs.vorticity.uniforms.uCurl, curlFBO.attach(1));
    gl.uniform1f(programs.vorticity.uniforms.curl, CFG.CURL);
    gl.uniform1f(programs.vorticity.uniforms.dt, dt);
    drawQuad(programs.vorticity);
    velocity.swap();

    // divergence
    gl.bindFramebuffer(gl.FRAMEBUFFER, divergenceFBO.fbo);
    programs.divergence.bind();
    gl.uniform2f(programs.divergence.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(programs.divergence.uniforms.uVelocity, velocity.read.attach(0));
    drawQuad(programs.divergence);

    // clear/dissipa pressão
    gl.bindFramebuffer(gl.FRAMEBUFFER, pressure.write.fbo);
    programs.clear.bind();
    gl.uniform2f(programs.clear.uniforms.texelSize, pressure.texelSizeX, pressure.texelSizeY);
    gl.uniform1i(programs.clear.uniforms.uTexture, pressure.read.attach(0));
    gl.uniform1f(programs.clear.uniforms.value, CFG.PRESSURE);
    drawQuad(programs.clear);
    pressure.swap();

    // jacobi
    programs.pressure.bind();
    gl.uniform2f(programs.pressure.uniforms.texelSize, pressure.texelSizeX, pressure.texelSizeY);
    gl.uniform1i(programs.pressure.uniforms.uDivergence, divergenceFBO.attach(0));
    for (let i = 0; i < CFG.PRESSURE_ITERATIONS; i++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, pressure.write.fbo);
      gl.uniform1i(programs.pressure.uniforms.uPressure, pressure.read.attach(1));
      drawQuad(programs.pressure);
      pressure.swap();
    }

    // subtrai gradiente
    gl.bindFramebuffer(gl.FRAMEBUFFER, velocity.write.fbo);
    programs.gradientSubtract.bind();
    gl.uniform2f(programs.gradientSubtract.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(programs.gradientSubtract.uniforms.uPressure, pressure.read.attach(0));
    gl.uniform1i(programs.gradientSubtract.uniforms.uVelocity, velocity.read.attach(1));
    drawQuad(programs.gradientSubtract);
    velocity.swap();

    // advecção da velocidade
    gl.bindFramebuffer(gl.FRAMEBUFFER, velocity.write.fbo);
    programs.advection.bind();
    gl.uniform2f(programs.advection.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform2f(programs.advection.uniforms.sourceTexelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(programs.advection.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(programs.advection.uniforms.uSource, velocity.read.attach(0));
    gl.uniform1f(programs.advection.uniforms.dt, dt);
    gl.uniform1f(programs.advection.uniforms.dissipation, CFG.VELOCITY_DISSIPATION);
    drawQuad(programs.advection);
    velocity.swap();

    // advecção do dye
    gl.viewport(0, 0, dye.width, dye.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, dye.write.fbo);
    gl.uniform2f(programs.advection.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform2f(programs.advection.uniforms.sourceTexelSize, dye.texelSizeX, dye.texelSizeY);
    gl.uniform1i(programs.advection.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(programs.advection.uniforms.uSource, dye.read.attach(1));
    gl.uniform1f(programs.advection.uniforms.dissipation, CFG.DENSITY_DISSIPATION);
    drawQuad(programs.advection);
    dye.swap();
  }

  function renderMaterialScene() {
    const mat = currentMaterial();
    const target = pointer.moved || pointer.down ? [pointer.x * 2 - 1, pointer.y * 2 - 1] : DEFAULT_LIGHT;
    smoothLight[0] += (DEFAULT_LIGHT[0] + (target[0] - DEFAULT_LIGHT[0]) * CFG.CURSOR_LIGHT_INFLUENCE - smoothLight[0]) * CFG.LIGHT_LERP;
    smoothLight[1] += (DEFAULT_LIGHT[1] + (target[1] - DEFAULT_LIGHT[1]) * CFG.CURSOR_LIGHT_INFLUENCE - smoothLight[1]) * CFG.LIGHT_LERP;

    gl.viewport(0, 0, materialSceneFBO.width, materialSceneFBO.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, materialSceneFBO.fbo);
    programs.material.bind();
    gl.uniform2f(programs.material.uniforms.texelSize, heightPing.texelSizeX, heightPing.texelSizeY);
    gl.uniform1i(programs.material.uniforms.uHeight, heightPing.attach(0));
    gl.uniform1f(programs.material.uniforms.uStrength, CFG.NORMAL_STRENGTH);
    gl.uniform3fv(programs.material.uniforms.uBaseColor, mat.baseColor);
    gl.uniform3fv(programs.material.uniforms.uSpecColor, mat.specColor);
    gl.uniform1f(programs.material.uniforms.uShininess, mat.shininess);
    gl.uniform3fv(programs.material.uniforms.uFresnelColor, mat.fresnelColor);
    gl.uniform1f(programs.material.uniforms.uFresnelPower, mat.fresnelPower);
    gl.uniform1f(programs.material.uniforms.uEmissiveBoost, mat.emissiveBoost);
    gl.uniform2f(programs.material.uniforms.uLightPos, smoothLight[0], smoothLight[1]);
    drawQuad(programs.material);
  }

  function renderComposite() {
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    programs.composite.bind();
    gl.uniform2f(programs.composite.uniforms.texelSize, 1 / gl.drawingBufferWidth, 1 / gl.drawingBufferHeight);
    gl.uniform1i(programs.composite.uniforms.uDye, dye.read.attach(0));
    gl.uniform1i(programs.composite.uniforms.uPaper, paperTex.attach(1));
    gl.uniform1i(programs.composite.uniforms.uMaterialScene, materialSceneFBO.attach(2));
    gl.uniform1f(programs.composite.uniforms.maskLo, CFG.MASK_LO);
    gl.uniform1f(programs.composite.uniforms.maskHi, CFG.MASK_HI);
    drawQuad(programs.composite);
  }

  /* ---------------- resize ---------------- */

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, CFG.DPR_MAX);
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width === w && canvas.height === h && paperTex) return;
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
    allocSimTargets();
    uploadWordmarkTextures(cssW, cssH);
  }

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  resize();

  /* ---------------- loop ---------------- */

  let lastTime = performance.now();
  function frame() {
    const now = performance.now();
    let dt = (now - lastTime) / 1000;
    dt = Math.min(dt, CFG.DT_MAX);
    const dtMs = now - lastTime;
    lastTime = now;

    stepIdleDrift(dt);
    stepMaterialTimer(dtMs);

    applySplats();
    stepFluid(dt);
    renderMaterialScene();
    renderComposite();

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/* =========================================================================
   Fallback 1: WebGL2 sem texturas flutuantes — reveal radial simples
   ========================================================================= */

function startWebGLRadialFallback(gl) {
  gl.clearColor(0.980, 0.969, 0.953, 1);
  const quadVAO = createQuadVAO(gl);

  const FALLBACK_FRAG = FRAG_HEADER + `
  uniform sampler2D uPaper;
  uniform vec2 uPoints[24];
  uniform float uRadii[24];
  uniform int uCount;
  uniform float aspectRatio;
  void main () {
    float reveal = 0.0;
    for (int i = 0; i < 24; i++) {
      if (i >= uCount) break;
      vec2 p = vUv - uPoints[i];
      p.x *= aspectRatio;
      float d = length(p);
      reveal = max(reveal, smoothstep(uRadii[i], uRadii[i] * 0.2, d));
    }
    vec3 paperColor = texture(uPaper, vUv).rgb;
    vec3 base = vec3(1.0);
    fragColor = vec4(mix(base, paperColor, reveal), 1.0);
  }`;

  const program = createProgram(gl, VERTEX_SHADER, FALLBACK_FRAG);
  let paperTex = null;

  function upload(cssW, cssH) {
    const built = buildWordmarkTextures(cssW, cssH);
    if (paperTex) gl.deleteTexture(paperTex.texture);
    paperTex = uploadCanvasTexture(gl, built.paperCanvas, gl.RGBA8, gl.RGBA);
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, CFG.DPR_MAX);
    const cssW = canvas.clientWidth, cssH = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(cssW * dpr));
    canvas.height = Math.max(1, Math.round(cssH * dpr));
    gl.viewport(0, 0, canvas.width, canvas.height);
    upload(cssW, cssH);
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  resize();

  const trail = [];
  function normPos(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return [(clientX - rect.left) / rect.width, 1.0 - (clientY - rect.top) / rect.height];
  }
  canvas.addEventListener('pointermove', (e) => {
    const [x, y] = normPos(e.clientX, e.clientY);
    trail.push({ x, y, t: performance.now() });
    if (trail.length > 24) trail.shift();
  }, { passive: true });

  function frame() {
    const now = performance.now();
    while (trail.length && now - trail[0].t > 1400) trail.shift();

    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(program.program);
    gl.bindVertexArray(quadVAO);
    gl.uniform1i(program.uniforms.uPaper, paperTex.attach(0));
    gl.uniform1f(program.uniforms.aspectRatio, gl.drawingBufferWidth / gl.drawingBufferHeight);
    gl.uniform1i(program.uniforms.uCount, trail.length);
    const pts = new Float32Array(48);
    const radii = new Float32Array(24);
    for (let i = 0; i < trail.length; i++) {
      pts[i * 2] = trail[i].x;
      pts[i * 2 + 1] = trail[i].y;
      const age = (now - trail[i].t) / 1400;
      radii[i] = 0.05 + age * 0.08;
    }
    gl.uniform2fv(program.uniforms.uPoints, pts);
    gl.uniform1fv(program.uniforms.uRadii, radii);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/* =========================================================================
   Fallback 2: sem WebGL — Canvas2D com união de arcos opacos (sem blur/goo)
   ========================================================================= */

function startCanvas2DFallback() {
  const ctx = canvas.getContext('2d');
  let paperCanvas, maskCanvas, maskCtx, w, h, dpr;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, CFG.DPR_MAX);
    const cssW = canvas.clientWidth, cssH = canvas.clientHeight;
    w = Math.max(1, Math.round(cssW * dpr));
    h = Math.max(1, Math.round(cssH * dpr));
    canvas.width = w;
    canvas.height = h;

    const built = buildWordmarkTextures(cssW, cssH);
    paperCanvas = built.paperCanvas;

    maskCanvas = document.createElement('canvas');
    maskCanvas.width = w;
    maskCanvas.height = h;
    maskCtx = maskCanvas.getContext('2d');
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  resize();

  function normPos(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return [(clientX - rect.left) / rect.width * w, (clientY - rect.top) / rect.height * h];
  }

  let last = null;
  function stampArc(x, y) {
    const r = Math.max(w, h) * 0.05;
    maskCtx.beginPath();
    maskCtx.arc(x, y, r, 0, Math.PI * 2);
    maskCtx.fillStyle = '#fff';
    maskCtx.fill();
  }
  canvas.addEventListener('pointermove', (e) => {
    const [x, y] = normPos(e.clientX, e.clientY);
    if (last) {
      const dist = Math.hypot(x - last[0], y - last[1]);
      const steps = Math.max(1, Math.floor(dist / (w * 0.01)));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        stampArc(last[0] + (x - last[0]) * t, last[1] + (y - last[1]) * t);
      }
    } else {
      stampArc(x, y);
    }
    last = [x, y];
  }, { passive: true });
  canvas.addEventListener('pointerleave', () => { last = null; }, { passive: true });

  const tmp = document.createElement('canvas');
  function frame() {
    tmp.width = w; tmp.height = h;
    const tctx = tmp.getContext('2d');
    tctx.clearRect(0, 0, w, h);
    tctx.drawImage(maskCanvas, 0, 0);
    tctx.globalCompositeOperation = 'source-in';
    tctx.drawImage(paperCanvas, 0, 0, w, h);
    tctx.globalCompositeOperation = 'source-over';

    ctx.fillStyle = '#faf7f3';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(tmp, 0, 0);

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/* =========================================================================
   Utilidades WebGL genéricas
   ========================================================================= */

function createQuadVAO(gl) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const posBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const idxBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);

  gl.bindVertexArray(null);
  return vao;
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error('Shader compile error: ' + info + '\n' + source);
  }
  return shader;
}

function injectKeywords(source, keywords) {
  if (!keywords || keywords.length === 0) return source;
  const lines = source.split('\n');
  const versionLine = lines[0].startsWith('#version') ? lines.shift() : null;
  const defines = keywords.map((k) => `#define ${k}`).join('\n');
  return (versionLine ? versionLine + '\n' : '') + defines + '\n' + lines.join('\n');
}

function createProgram(gl, vsSource, fsSource, keywords) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, injectKeywords(fsSource, keywords));
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.bindAttribLocation(program, 0, 'aPosition');
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error('Program link error: ' + gl.getProgramInfoLog(program));
  }

  const uniforms = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(program, i);
    const name = info.name.replace(/\[0\]$/, '');
    uniforms[name] = gl.getUniformLocation(program, info.name);
  }

  return { program, uniforms, bind() { gl.useProgram(program); } };
}

function uploadCanvasTexture(gl, sourceCanvas, internalFormat, format) {
  gl.activeTexture(gl.TEXTURE0);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, format, gl.UNSIGNED_BYTE, sourceCanvas);
  return {
    texture,
    attach(id) {
      gl.activeTexture(gl.TEXTURE0 + id);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      return id;
    },
  };
}
