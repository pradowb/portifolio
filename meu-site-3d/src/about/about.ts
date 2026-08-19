import './about.css'
import '../fluid-cursor/fluid-cursor.css'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { startFluidCursor } from '../fluid-cursor/fluid-cursor.js'

gsap.registerPlugin(ScrollTrigger)

const STATEMENT =
  'Simplicidade é resultado de profundidade. Criamos produtos digitais onde estratégia, design e tecnologia se encontram para transformar complexidade em experiências claras e eficientes.'

const statementWords = STATEMENT.split(' ')
  .map((word) => `<span class="statement-word">${word}</span>`)
  .join(' ')

const markup = `
  <canvas class="fluid-cursor" aria-hidden="true"></canvas>
  <div class="about-inner">
    <h2 class="about-title">Olá</h2>
    <figure class="about-photo">
      <img
        src="/images/IMG_5333.jpg"
        alt="Retrato de Ale"
        width="400"
        height="456"
      />
    </figure>
    <p class="about-intro">
      Me chamo Alexandre, sou desenvolvedor de software e fundador da
      agência, onde transformo ideias em produtos digitais funcionais,
      rápidos e escaláveis. Meu trabalho une tecnologia, design e
      estratégia para criar soluções simples, eficientes e preparadas
      para crescer.
    </p>
    <div class="about-description">
      <p>
        Sou desenvolvedor de software com foco em criar experiências web
        modernas, escaláveis e orientadas à conversão.
      </p>
      <p>
        Ao longo dos anos, desenhei e lancei produtos digitais usados no
        mundo real, ajudando ideias a saírem do papel mais rápido.
      </p>
    </div>
  </div>
  <div class="about-statement">
    <p class="statement-text">${statementWords}</p>
  </div>
`

function initAboutMotion(section: HTMLElement): () => void {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduced) return () => {}

  const ctx = gsap.context(() => {
    const reveal = gsap.timeline({
      defaults: { ease: 'power2.out' },
      scrollTrigger: {
        trigger: section,
        start: 'top 72%',
        once: true,
      },
    })

    reveal
      .from('.about-title', { y: 24, autoAlpha: 0, duration: 0.6 })
      .from('.about-photo', { y: 28, autoAlpha: 0, duration: 0.7 }, '-=0.4')
      .from('.about-intro', { y: 18, autoAlpha: 0, duration: 0.55 }, '-=0.38')
      .from(
        '.about-description p',
        { y: 18, autoAlpha: 0, duration: 0.55, stagger: 0.12 },
        '-=0.3',
      )

    // Manifesto: words fill from faint gray to ink, tied to scroll progress
    gsap.fromTo(
      '.statement-word',
      { opacity: 0.14 },
      {
        opacity: 1,
        ease: 'none',
        stagger: 0.05,
        scrollTrigger: {
          trigger: '.about-statement',
          start: 'top 82%',
          end: 'bottom 42%',
          scrub: true,
        },
      },
    )
  }, section)

  return () => ctx.revert()
}

export function mountAbout(app: HTMLElement): () => void {
  const section = document.createElement('section')
  section.className = 'about-section has-fluid-cursor'
  section.id = 'about'
  section.setAttribute('aria-label', 'Sobre')
  section.innerHTML = markup
  app.appendChild(section)

  const destroyMotion = initAboutMotion(section)
  const canvas = section.querySelector<HTMLCanvasElement>('.fluid-cursor')
  const destroyFluid = canvas ? startFluidCursor(canvas, section) : () => {}
  ScrollTrigger.refresh()

  return () => {
    destroyFluid()
    destroyMotion()
    section.remove()
  }
}
