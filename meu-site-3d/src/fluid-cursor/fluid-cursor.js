'use strict'

const CFG = {
  SIM_RES: 128,
  DYE_RES: 512,
  PRESSURE_ITERATIONS: 20,
  PRESSURE: 0.8,
  CURL: 12,
  DENSITY_DISSIPATION: 2.6,
  VELOCITY_DISSIPATION: 1.4,
  SPLAT_RADIUS: 0.0015,
  SPLAT_FORCE: 2600,
  SPLAT_SPACING: 0.006,
  MASK_LO: 0.1,
  MASK_HI: 0.34,
  IDLE_TIMEOUT: 2600,
  DT_MAX: 1 / 30,
  DPR_MAX: 2,
}

const REDUCE_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches

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
}`

const FRAG_HEADER = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
out vec4 fragColor;
`

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
}`

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
}`

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
}`

const CURL_SHADER = FRAG_HEADER + `
uniform sampler2D uVelocity;
void main () {
  float L = texture(uVelocity, vL).y;
  float R = texture(uVelocity, vR).y;
  float T = texture(uVelocity, vT).x;
  float B = texture(uVelocity, vB).x;
  float vorticity = R - L - T + B;
  fragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
}`

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
}`

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
}`

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
}`

const CLEAR_SHADER = FRAG_HEADER + `
uniform sampler2D uTexture;
uniform float value;
void main () {
  fragColor = value * texture(uTexture, vUv);
}`

const DISPLAY_SHADER = FRAG_HEADER + `
uniform sampler2D uDye;
uniform float maskLo;
uniform float maskHi;
void main () {
  float d = texture(uDye, vUv).r;
  float mask = smoothstep(maskLo, maskHi, d);
  vec3 paper = vec3(0.980, 0.969, 0.953);
  vec3 ink = vec3(0.067, 0.067, 0.067);
  fragColor = vec4(mix(paper, ink, mask * 0.38), 1.0);
}`

export function startFluidCursor(canvas, root) {
  if (REDUCE_MOTION || !canvas) return () => {}

  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
  })
  if (!gl) return () => {}

  const caps = probeCapabilities(gl)
  if (!caps.simSupported) return () => {}

  gl.clearColor(0, 0, 0, 0)

  const hasFloatLinear = caps.hasFloatLinear
  const filterMode = hasFloatLinear ? gl.LINEAR : gl.NEAREST
  const filteringKeywords = hasFloatLinear ? [] : ['MANUAL_FILTERING']
  const quadVAO = createQuadVAO(gl)

  const programs = {
    splat: createProgram(gl, VERTEX_SHADER, SPLAT_SHADER),
    advection: createProgram(gl, VERTEX_SHADER, ADVECTION_SHADER, filteringKeywords),
    divergence: createProgram(gl, VERTEX_SHADER, DIVERGENCE_SHADER),
    curl: createProgram(gl, VERTEX_SHADER, CURL_SHADER),
    vorticity: createProgram(gl, VERTEX_SHADER, VORTICITY_SHADER),
    pressure: createProgram(gl, VERTEX_SHADER, PRESSURE_SHADER),
    gradientSubtract: createProgram(gl, VERTEX_SHADER, GRADIENT_SUBTRACT_SHADER),
    clear: createProgram(gl, VERTEX_SHADER, CLEAR_SHADER),
    display: createProgram(gl, VERTEX_SHADER, DISPLAY_SHADER),
  }

  function drawQuad(program) {
    gl.useProgram(program.program)
    gl.bindVertexArray(quadVAO)
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0)
  }

  function createFBO(w, h, fmt, filter) {
    gl.activeTexture(gl.TEXTURE0)
    const texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, fmt.internalFormat, w, h, 0, fmt.format, fmt.type, null)
    const fbo = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
    gl.viewport(0, 0, w, h)
    gl.clear(gl.COLOR_BUFFER_BIT)
    return {
      texture,
      fbo,
      width: w,
      height: h,
      texelSizeX: 1 / w,
      texelSizeY: 1 / h,
      attach(id) {
        gl.activeTexture(gl.TEXTURE0 + id)
        gl.bindTexture(gl.TEXTURE_2D, texture)
        return id
      },
    }
  }

  function createDoubleFBO(w, h, fmt, filter) {
    let fbo1 = createFBO(w, h, fmt, filter)
    let fbo2 = createFBO(w, h, fmt, filter)
    return {
      width: w,
      height: h,
      texelSizeX: fbo1.texelSizeX,
      texelSizeY: fbo1.texelSizeY,
      get read() {
        return fbo1
      },
      get write() {
        return fbo2
      },
      swap() {
        const t = fbo1
        fbo1 = fbo2
        fbo2 = t
      },
    }
  }

  function getResolution(resolution) {
    let aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight
    if (aspectRatio < 1) aspectRatio = 1 / aspectRatio
    const min = Math.round(resolution)
    const max = Math.round(resolution * aspectRatio)
    if (gl.drawingBufferWidth > gl.drawingBufferHeight) return { width: max, height: min }
    return { width: min, height: max }
  }

  let dye
  let velocity
  let pressure
  let divergenceFBO
  let curlFBO

  function allocSimTargets() {
    const simRes = getResolution(CFG.SIM_RES)
    const dyeRes = getResolution(CFG.DYE_RES)
    dye = createDoubleFBO(dyeRes.width, dyeRes.height, caps.dyeFormat, filterMode)
    velocity = createDoubleFBO(simRes.width, simRes.height, caps.velocityFormat, filterMode)
    pressure = createDoubleFBO(simRes.width, simRes.height, caps.pressureFormat, gl.NEAREST)
    divergenceFBO = createFBO(simRes.width, simRes.height, caps.pressureFormat, gl.NEAREST)
    curlFBO = createFBO(simRes.width, simRes.height, caps.pressureFormat, gl.NEAREST)
  }

  const pointer = {
    x: 0.5,
    y: 0.5,
    lastMoveTime: performance.now(),
  }
  const pendingSplats = []

  function queueSplat(x, y, dx, dy) {
    pendingSplats.push({ x, y, dx, dy })
  }

  function splatFromSegment(x0, y0, x1, y1) {
    const dx = x1 - x0
    const dy = y1 - y0
    const dist = Math.hypot(dx, dy)
    const steps = Math.max(1, Math.floor(dist / CFG.SPLAT_SPACING))
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      queueSplat(x0 + dx * t, y0 + dy * t, dx, dy)
    }
  }

  function normPos(clientX, clientY) {
    const rect = canvas.getBoundingClientRect()
    const x = (clientX - rect.left) / Math.max(1, rect.width)
    const y = 1 - (clientY - rect.top) / Math.max(1, rect.height)
    return [x, y]
  }

  function onPointerMove(e) {
    if (!visible) return
    const [x, y] = normPos(e.clientX, e.clientY)
    pointer.lastMoveTime = performance.now()
    splatFromSegment(pointer.x, pointer.y, x, y)
    pointer.x = x
    pointer.y = y
  }

  let idleAngle = Math.random() * Math.PI * 2
  let idleX = 0.5
  let idleY = 0.5
  let idleInit = false

  function stepIdleDrift(dt) {
    const since = performance.now() - pointer.lastMoveTime
    if (since < CFG.IDLE_TIMEOUT) return
    if (!idleInit) {
      idleX = pointer.x
      idleY = pointer.y
      idleInit = true
    }
    const prevX = idleX
    const prevY = idleY
    idleAngle += dt * 0.6 + (Math.random() - 0.5) * 0.4
    idleX += Math.cos(idleAngle) * 0.09 * dt
    idleY += Math.sin(idleAngle * 0.8) * 0.09 * dt
    idleX = Math.min(0.88, Math.max(0.12, idleX))
    idleY = Math.min(0.85, Math.max(0.15, idleY))
    splatFromSegment(prevX, prevY, idleX, idleY)
  }

  function correctRadius(aspect, radius) {
    if (aspect > 1) return radius * aspect
    return radius
  }

  function applySplats() {
    if (pendingSplats.length === 0) return
    const aspect = gl.drawingBufferWidth / gl.drawingBufferHeight
    for (const s of pendingSplats) {
      gl.viewport(0, 0, velocity.width, velocity.height)
      gl.bindFramebuffer(gl.FRAMEBUFFER, velocity.write.fbo)
      programs.splat.bind()
      gl.uniform1i(programs.splat.uniforms.uTarget, velocity.read.attach(0))
      gl.uniform1f(programs.splat.uniforms.aspectRatio, aspect)
      gl.uniform2f(programs.splat.uniforms.point, s.x, s.y)
      gl.uniform3f(programs.splat.uniforms.color, s.dx * CFG.SPLAT_FORCE, s.dy * CFG.SPLAT_FORCE, 0)
      gl.uniform1f(programs.splat.uniforms.radius, correctRadius(aspect, CFG.SPLAT_RADIUS))
      drawQuad(programs.splat)
      velocity.swap()

      gl.viewport(0, 0, dye.width, dye.height)
      gl.bindFramebuffer(gl.FRAMEBUFFER, dye.write.fbo)
      programs.splat.bind()
      gl.uniform1i(programs.splat.uniforms.uTarget, dye.read.attach(0))
      gl.uniform1f(programs.splat.uniforms.aspectRatio, aspect)
      gl.uniform2f(programs.splat.uniforms.point, s.x, s.y)
      gl.uniform3f(programs.splat.uniforms.color, 1, 1, 1)
      gl.uniform1f(programs.splat.uniforms.radius, correctRadius(aspect, CFG.SPLAT_RADIUS))
      drawQuad(programs.splat)
      dye.swap()
    }
    pendingSplats.length = 0
  }

  function stepFluid(dt) {
    gl.disable(gl.BLEND)

    gl.viewport(0, 0, velocity.width, velocity.height)
    gl.bindFramebuffer(gl.FRAMEBUFFER, curlFBO.fbo)
    programs.curl.bind()
    gl.uniform2f(programs.curl.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY)
    gl.uniform1i(programs.curl.uniforms.uVelocity, velocity.read.attach(0))
    drawQuad(programs.curl)

    gl.bindFramebuffer(gl.FRAMEBUFFER, velocity.write.fbo)
    programs.vorticity.bind()
    gl.uniform2f(programs.vorticity.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY)
    gl.uniform1i(programs.vorticity.uniforms.uVelocity, velocity.read.attach(0))
    gl.uniform1i(programs.vorticity.uniforms.uCurl, curlFBO.attach(1))
    gl.uniform1f(programs.vorticity.uniforms.curl, CFG.CURL)
    gl.uniform1f(programs.vorticity.uniforms.dt, dt)
    drawQuad(programs.vorticity)
    velocity.swap()

    gl.bindFramebuffer(gl.FRAMEBUFFER, divergenceFBO.fbo)
    programs.divergence.bind()
    gl.uniform2f(programs.divergence.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY)
    gl.uniform1i(programs.divergence.uniforms.uVelocity, velocity.read.attach(0))
    drawQuad(programs.divergence)

    gl.bindFramebuffer(gl.FRAMEBUFFER, pressure.write.fbo)
    programs.clear.bind()
    gl.uniform2f(programs.clear.uniforms.texelSize, pressure.texelSizeX, pressure.texelSizeY)
    gl.uniform1i(programs.clear.uniforms.uTexture, pressure.read.attach(0))
    gl.uniform1f(programs.clear.uniforms.value, CFG.PRESSURE)
    drawQuad(programs.clear)
    pressure.swap()

    programs.pressure.bind()
    gl.uniform2f(programs.pressure.uniforms.texelSize, pressure.texelSizeX, pressure.texelSizeY)
    gl.uniform1i(programs.pressure.uniforms.uDivergence, divergenceFBO.attach(0))
    for (let i = 0; i < CFG.PRESSURE_ITERATIONS; i++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, pressure.write.fbo)
      gl.uniform1i(programs.pressure.uniforms.uPressure, pressure.read.attach(1))
      drawQuad(programs.pressure)
      pressure.swap()
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, velocity.write.fbo)
    programs.gradientSubtract.bind()
    gl.uniform2f(programs.gradientSubtract.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY)
    gl.uniform1i(programs.gradientSubtract.uniforms.uPressure, pressure.read.attach(0))
    gl.uniform1i(programs.gradientSubtract.uniforms.uVelocity, velocity.read.attach(1))
    drawQuad(programs.gradientSubtract)
    velocity.swap()

    gl.bindFramebuffer(gl.FRAMEBUFFER, velocity.write.fbo)
    programs.advection.bind()
    gl.uniform2f(programs.advection.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY)
    gl.uniform2f(programs.advection.uniforms.sourceTexelSize, velocity.texelSizeX, velocity.texelSizeY)
    gl.uniform1i(programs.advection.uniforms.uVelocity, velocity.read.attach(0))
    gl.uniform1i(programs.advection.uniforms.uSource, velocity.read.attach(0))
    gl.uniform1f(programs.advection.uniforms.dt, dt)
    gl.uniform1f(programs.advection.uniforms.dissipation, CFG.VELOCITY_DISSIPATION)
    drawQuad(programs.advection)
    velocity.swap()

    gl.viewport(0, 0, dye.width, dye.height)
    gl.bindFramebuffer(gl.FRAMEBUFFER, dye.write.fbo)
    gl.uniform2f(programs.advection.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY)
    gl.uniform2f(programs.advection.uniforms.sourceTexelSize, dye.texelSizeX, dye.texelSizeY)
    gl.uniform1i(programs.advection.uniforms.uVelocity, velocity.read.attach(0))
    gl.uniform1i(programs.advection.uniforms.uSource, dye.read.attach(1))
    gl.uniform1f(programs.advection.uniforms.dissipation, CFG.DENSITY_DISSIPATION)
    drawQuad(programs.advection)
    dye.swap()
  }

  function render() {
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    programs.display.bind()
    gl.uniform2f(programs.display.uniforms.texelSize, 1 / gl.drawingBufferWidth, 1 / gl.drawingBufferHeight)
    gl.uniform1i(programs.display.uniforms.uDye, dye.read.attach(0))
    gl.uniform1f(programs.display.uniforms.maskLo, CFG.MASK_LO)
    gl.uniform1f(programs.display.uniforms.maskHi, CFG.MASK_HI)
    drawQuad(programs.display)
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, CFG.DPR_MAX)
    const cssW = canvas.clientWidth
    const cssH = canvas.clientHeight
    const w = Math.max(1, Math.round(cssW * dpr))
    const h = Math.max(1, Math.round(cssH * dpr))
    if (canvas.width === w && canvas.height === h && dye) return
    canvas.width = w
    canvas.height = h
    gl.viewport(0, 0, w, h)
    allocSimTargets()
  }

  let visible = false
  let raf = 0
  let lastTime = performance.now()

  function frame() {
    raf = requestAnimationFrame(frame)
    if (!visible) return
    const now = performance.now()
    let dt = (now - lastTime) / 1000
    dt = Math.min(dt, CFG.DT_MAX)
    lastTime = now
    stepIdleDrift(dt)
    applySplats()
    stepFluid(dt)
    render()
  }

  const observer = new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting
      if (visible) lastTime = performance.now()
    },
    { rootMargin: '20% 0px' },
  )
  observer.observe(root)

  root.addEventListener('pointermove', onPointerMove, { passive: true })
  window.addEventListener('resize', resize)
  window.addEventListener('orientationchange', resize)
  resize()
  raf = requestAnimationFrame(frame)

  return () => {
    visible = false
    cancelAnimationFrame(raf)
    observer.disconnect()
    root.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('resize', resize)
    window.removeEventListener('orientationchange', resize)
  }
}

function probeCapabilities(gl) {
  const hasColorBufferFloat = !!gl.getExtension('EXT_color_buffer_float')
  const hasFloatLinear = !!gl.getExtension('OES_texture_float_linear')
  let simSupported = false
  let dyeFormat = null
  let velocityFormat = null
  let pressureFormat = null
  if (hasColorBufferFloat) {
    const rgba16f = { internalFormat: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT }
    const rg16f = { internalFormat: gl.RG16F, format: gl.RG, type: gl.HALF_FLOAT }
    const r16f = { internalFormat: gl.R16F, format: gl.RED, type: gl.HALF_FLOAT }
    if (supportRenderTextureFormat(gl, rgba16f)) {
      dyeFormat = rgba16f
      velocityFormat = supportRenderTextureFormat(gl, rg16f) ? rg16f : rgba16f
      pressureFormat = supportRenderTextureFormat(gl, r16f) ? r16f : rgba16f
      simSupported = true
    }
  }
  return { simSupported, dyeFormat, velocityFormat, pressureFormat, hasFloatLinear }
}

function supportRenderTextureFormat(gl, fmt) {
  const tex = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texImage2D(gl.TEXTURE_2D, 0, fmt.internalFormat, 4, 4, 0, fmt.format, fmt.type, null)
  const fbo = gl.createFramebuffer()
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  gl.deleteFramebuffer(fbo)
  gl.deleteTexture(tex)
  return status === gl.FRAMEBUFFER_COMPLETE
}

function createQuadVAO(gl) {
  const vao = gl.createVertexArray()
  gl.bindVertexArray(vao)
  const posBuffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  const idxBuffer = gl.createBuffer()
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuffer)
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW)
  gl.bindVertexArray(null)
  return vao
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type)
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error('Shader compile error: ' + info)
  }
  return shader
}

function injectKeywords(source, keywords) {
  if (!keywords || keywords.length === 0) return source
  const lines = source.split('\n')
  const versionLine = lines[0].startsWith('#version') ? lines.shift() : null
  const defines = keywords.map((k) => `#define ${k}`).join('\n')
  return (versionLine ? versionLine + '\n' : '') + defines + '\n' + lines.join('\n')
}

function createProgram(gl, vsSource, fsSource, keywords) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource)
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, injectKeywords(fsSource, keywords))
  const program = gl.createProgram()
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.bindAttribLocation(program, 0, 'aPosition')
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error('Program link error: ' + gl.getProgramInfoLog(program))
  }
  const uniforms = {}
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS)
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(program, i)
    const name = info.name.replace(/\[0\]$/, '')
    uniforms[name] = gl.getUniformLocation(program, info.name)
  }
  return {
    program,
    uniforms,
    bind() {
      gl.useProgram(program)
    },
  }
}
