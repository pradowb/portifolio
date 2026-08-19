import './services.css'
import '../fluid-cursor/fluid-cursor.css'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { startFluidCursor } from '../fluid-cursor/fluid-cursor.js'

gsap.registerPlugin(ScrollTrigger)

interface Service {
  title: string
  description: string
}

const services: Service[] = [
  {
    title: 'Migração de sites',
    description: 'Webflow / Framer / HTML / CSS',
  },
  {
    title: 'Templates Framer',
    description: 'Design / Sistemas / Componentes',
  },
  {
    title: 'Desenvolvimento frontend',
    description: 'React / Next.js / UI interativa',
  },
  {
    title: 'Consultoria de produto',
    description: 'Produto / UX / Direção técnica',
  },
]

const markup = `
  <canvas class="fluid-cursor" aria-hidden="true"></canvas>
  <div class="services-inner">
    <h2 class="services-title" id="services-title">Serviços</h2>
    <div class="services-list">
      ${services
        .map(
          (service) => `
        <article class="service-item">
          <h3 class="service-name">${service.title}</h3>
          <p class="service-desc">${service.description}</p>
        </article>`,
        )
        .join('')}
    </div>
  </div>
`

function initServicesMotion(section: HTMLElement): () => void {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduced) return () => {}

  const ctx = gsap.context(() => {
    gsap
      .timeline({
        defaults: { ease: 'power2.out' },
        scrollTrigger: {
          trigger: section,
          start: 'top 72%',
          once: true,
        },
      })
      .from('.services-title', { y: 24, autoAlpha: 0, duration: 0.6 })
      .from(
        '.service-item',
        { y: 18, autoAlpha: 0, duration: 0.55, stagger: 0.12 },
        '-=0.3',
      )
  }, section)

  return () => ctx.revert()
}

export function mountServices(container: HTMLElement): () => void {
  const section = document.createElement('section')
  section.className = 'services-section has-fluid-cursor'
  section.id = 'services'
  section.setAttribute('aria-labelledby', 'services-title')
  section.innerHTML = markup
  container.appendChild(section)

  const destroyMotion = initServicesMotion(section)
  const canvas = section.querySelector<HTMLCanvasElement>('.fluid-cursor')
  const destroyFluid = canvas ? startFluidCursor(canvas, section) : () => {}
  ScrollTrigger.refresh()

  return () => {
    destroyFluid()
    destroyMotion()
    section.remove()
  }
}
