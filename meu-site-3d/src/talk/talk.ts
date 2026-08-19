import './talk.css'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const contact = {
  email: 'hello@lume.agency',
  invite:
    'Tem um projeto ou precisa de ajuda? Preencha o formulário e retornamos em breve.',
  socials: [
    { label: 'X', href: '#', icon: 'x' },
    { label: 'Instagram', href: '#', icon: 'instagram' },
    { label: 'LinkedIn', href: '#', icon: 'linkedin' },
    { label: 'YouTube', href: '#', icon: 'youtube' },
  ],
}

const icons: Record<string, string> = {
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.244 2H21.5l-7.5 8.57L22.5 22h-6.59l-5.16-6.74L5.2 22H1.94l8.03-9.17L1.5 2h6.76l4.66 6.18L18.244 2Zm-1.16 18.1h1.81L6.99 3.82H5.05L17.084 20.1Z"/></svg>',
  instagram:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 3h8a5 5 0 0 1 5 5v8a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V8a5 5 0 0 1 5-5Zm0 2a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3H8Zm9.2 1.3a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2ZM12 8.2A3.8 3.8 0 1 1 8.2 12 3.8 3.8 0 0 1 12 8.2Zm0 2a1.8 1.8 0 1 0 1.8 1.8A1.8 1.8 0 0 0 12 10.2Z"/></svg>',
  linkedin:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.5 9.5H4V20h2.5V9.5ZM5.25 4A1.75 1.75 0 1 0 7 5.75 1.75 1.75 0 0 0 5.25 4ZM20 20h-2.5v-5.6c0-1.9-.7-3.2-2.4-3.2-1.3 0-2.1.9-2.4 1.7-.1.3-.1.7-.1 1.1V20H10s.05-8.9 0-10.5h2.5v1.6c.4-.7 1.6-1.8 3.8-1.8 2.8 0 4.7 1.8 4.7 5.7V20Z"/></svg>',
  youtube:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M22.5 7.2a3.1 3.1 0 0 0-2.2-2.2C18.5 4.6 12 4.6 12 4.6s-6.5 0-8.3.4A3.1 3.1 0 0 0 1.5 7.2 32 32 0 0 0 1.1 12a32 32 0 0 0 .4 4.8 3.1 3.1 0 0 0 2.2 2.2c1.8.4 8.3.4 8.3.4s6.5 0 8.3-.4a3.1 3.1 0 0 0 2.2-2.2A32 32 0 0 0 22.9 12a32 32 0 0 0-.4-4.8ZM10 15.4V8.6L16 12Z"/></svg>',
}

function splitChars(el: HTMLElement, text: string) {
  el.setAttribute('aria-label', text)
  for (const ch of text) {
    const span = document.createElement('span')
    span.className = 'char'
    span.setAttribute('aria-hidden', 'true')
    span.textContent = ch === ' ' ? '\u00A0' : ch
    el.appendChild(span)
  }
}

const socials = contact.socials
  .map(
    (item) => `
      <a class="talk-social" href="${item.href}" aria-label="${item.label}">
        ${icons[item.icon]}
      </a>`,
  )
  .join('')

const markup = `
  <div class="talk-inner">
    <div class="talk-copy">
      <h2 class="talk-title" id="lets-talk-title" data-talk-title></h2>
      <p class="talk-invite">${contact.invite}</p>
      <nav class="talk-socials" aria-label="Redes sociais">
        ${socials}
      </nav>
    </div>
    <form class="talk-form" data-talk-form>
      <label class="talk-field">
        <span>Nome</span>
        <input type="text" name="name" autocomplete="name" placeholder="Digite seu nome" required />
      </label>
      <label class="talk-field">
        <span>E-mail</span>
        <input type="email" name="email" autocomplete="email" placeholder="Digite seu e-mail" required />
      </label>
      <label class="talk-field">
        <span>Seu projeto</span>
        <textarea name="message" rows="5" placeholder="Conte sobre o seu projeto" required></textarea>
      </label>
      <button class="talk-submit" type="submit">Enviar</button>
    </form>
  </div>
`

function initTalkMotion(section: HTMLElement): () => void {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduced) return () => {}

  const ctx = gsap.context(() => {
    const chars = section.querySelectorAll<HTMLElement>('.talk-title .char')

    const reveal = gsap.timeline({
      defaults: { ease: 'power2.out' },
      scrollTrigger: {
        trigger: section,
        start: 'top 72%',
        once: true,
      },
    })

    reveal
      .from(
        chars,
        {
          autoAlpha: 0,
          y: 40,
          filter: 'blur(10px)',
          duration: 0.7,
          stagger: 0.028,
          ease: 'power3.out',
        },
      )
      .from('.talk-invite', { y: 16, autoAlpha: 0, duration: 0.5 }, '-=0.35')
      .from('.talk-form', { y: 20, autoAlpha: 0, duration: 0.6 }, '-=0.4')
      .from(
        '.talk-social',
        { y: 10, autoAlpha: 0, duration: 0.4, stagger: 0.06 },
        '-=0.28',
      )
  }, section)

  return () => ctx.revert()
}

export function mountTalk(container: HTMLElement): () => void {
  const section = document.createElement('section')
  section.className = 'talk-section'
  section.id = 'contact'
  section.setAttribute('aria-labelledby', 'lets-talk-title')
  section.innerHTML = markup
  container.appendChild(section)

  const title = section.querySelector<HTMLElement>('[data-talk-title]')!
  splitChars(title, 'Vamos conversar.')

  const form = section.querySelector<HTMLFormElement>('[data-talk-form]')
  const onSubmit = (event: SubmitEvent) => {
    event.preventDefault()
    if (!form) return
    const data = new FormData(form)
    const name = String(data.get('name') ?? '').trim()
    const email = String(data.get('email') ?? '').trim()
    const message = String(data.get('message') ?? '').trim()
    const subject = encodeURIComponent(`Proposta de projeto — ${name || 'LUME'}`)
    const body = encodeURIComponent(
      `Nome: ${name}\nE-mail: ${email}\n\n${message}`,
    )
    window.location.href = `mailto:${contact.email}?subject=${subject}&body=${body}`
  }
  form?.addEventListener('submit', onSubmit)

  const destroyMotion = initTalkMotion(section)
  ScrollTrigger.refresh()

  return () => {
    form?.removeEventListener('submit', onSubmit)
    destroyMotion()
    section.remove()
  }
}
