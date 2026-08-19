import './footer.css'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const footerLinks = [
  { label: 'LinkedIn', href: '#' },
  { label: 'GitHub', href: '#' },
  { label: 'Instagram', href: '#' },
]

const footerCopy = {
  name: 'LUME',
  note: 'Disponível para projetos selecionados',
}

function linkAttrs(href: string) {
  const external = href.startsWith('http')
  return external
    ? `href="${href}" target="_blank" rel="noopener noreferrer"`
    : `href="${href}"`
}

const markup = `
  <div class="footer-inner">
    <div class="footer-top">
      <p class="footer-copy">© ${new Date().getFullYear()} ${footerCopy.name}</p>
      <nav class="footer-socials" aria-label="Redes sociais">
        ${footerLinks
          .map(
            (item) => `
          <a class="footer-link" ${linkAttrs(item.href)}>${item.label}</a>`,
          )
          .join('')}
      </nav>
    </div>
    <p class="footer-note">${footerCopy.note}</p>
  </div>
`

function initFooterMotion(footer: HTMLElement): () => void {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduced) return () => {}

  const ctx = gsap.context(() => {
    gsap
      .timeline({
        defaults: { ease: 'power2.out' },
        scrollTrigger: {
          trigger: footer,
          start: 'top 92%',
          once: true,
        },
      })
      .from('.footer-copy', { y: 8, autoAlpha: 0, duration: 0.45 })
      .from(
        '.footer-link',
        { y: 8, autoAlpha: 0, duration: 0.4, stagger: 0.06 },
        '-=0.28',
      )
      .from('.footer-note', { y: 6, autoAlpha: 0, duration: 0.4 }, '-=0.22')
  }, footer)

  return () => ctx.revert()
}

export function mountFooter(container: HTMLElement): () => void {
  const footer = document.createElement('footer')
  footer.className = 'site-footer'
  footer.innerHTML = markup
  container.appendChild(footer)

  const destroyMotion = initFooterMotion(footer)
  ScrollTrigger.refresh()

  return () => {
    destroyMotion()
    footer.remove()
  }
}
