import './hero.css'
import gsap from 'gsap'
import { initMotion } from './motion'
import { initIntro } from './intro'

const markup = `
  <div class="grain" aria-hidden="true"></div>
  <header class="nav" data-nav>
    <div class="nav-shell">
      <div class="nav-bar">
        <a class="nav-logo" href="#hero">LUME</a>
        <button
          class="nav-toggle"
          type="button"
          aria-expanded="false"
          aria-controls="site-menu"
        >
          <span class="nav-dots" aria-hidden="true"><i></i><i></i><i></i></span>
          <span class="nav-close" aria-hidden="true"></span>
          <span class="sr-only">Abrir menu</span>
        </button>
      </div>
      <div class="nav-menu" id="site-menu">
        <div class="nav-menu-inner">
          <ul>
            <li class="nav-item">
              <a href="#about">
                <span class="nav-link-text"><span class="nav-link-roll" data-text="Sobre mim">Sobre mim</span></span>
                <span class="nav-link-index" aria-hidden="true">01</span>
              </a>
            </li>
            <li class="nav-item">
              <a href="#services">
                <span class="nav-link-text"><span class="nav-link-roll" data-text="Serviços">Serviços</span></span>
                <span class="nav-link-index" aria-hidden="true">02</span>
              </a>
            </li>
            <li class="nav-item">
              <a href="#projects">
                <span class="nav-link-text"><span class="nav-link-roll" data-text="Projetos">Projetos</span></span>
                <span class="nav-link-index" aria-hidden="true">03</span>
              </a>
            </li>
            <li class="nav-item">
              <a href="#contact">
                <span class="nav-link-text"><span class="nav-link-roll" data-text="Contato">Contato</span></span>
                <span class="nav-link-index" aria-hidden="true">04</span>
              </a>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </header>
  <div class="hero-scroll" id="hero">
    <div id="preloader" aria-hidden="true">
      <div class="preloader-count">
        <span id="preloader-number">000</span><span class="preloader-percent">%</span>
      </div>
      <div class="preloader-bar"><span id="preloader-bar-fill"></span></div>
    </div>
    <h1 class="visually-hidden">LUME Agência</h1>
    <canvas id="scene" aria-hidden="true"></canvas>
    <div id="wordmark-proxy" aria-hidden="true">
      <span class="wp-char">L</span><span class="wp-char">U</span><span class="wp-char">M</span><span class="wp-char">E</span>
    </div>
    <p class="hero-agency" data-agency>Agência</p>
  </div>
`

function bindNav(root: HTMLElement): () => void {
  const nav = root.querySelector<HTMLElement>('[data-nav]')
  const toggle = root.querySelector<HTMLButtonElement>('.nav-toggle')
  const label = toggle?.querySelector('.sr-only')
  const items = Array.from(root.querySelectorAll<HTMLElement>('.nav-item'))
  if (!nav || !toggle || !label) return () => {}

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let itemsTween: gsap.core.Tween | null = null

  const setOpen = (open: boolean) => {
    if (nav.classList.contains('is-open') === open) return
    nav.classList.toggle('is-open', open)
    toggle.setAttribute('aria-expanded', String(open))
    label.textContent = open ? 'Fechar menu' : 'Abrir menu'

    if (reduced || items.length === 0) return

    itemsTween?.kill()
    if (open) {
      itemsTween = gsap.fromTo(
        items,
        {
          rotateX: -78,
          y: -10,
          autoAlpha: 0,
          transformOrigin: '50% 0%',
        },
        {
          rotateX: 0,
          y: 0,
          autoAlpha: 1,
          duration: 0.55,
          ease: 'power3.out',
          stagger: 0.07,
          delay: 0.08,
          overwrite: 'auto',
        },
      )
    } else {
      itemsTween = gsap.to(items, {
        rotateX: -50,
        y: -6,
        autoAlpha: 0,
        transformOrigin: '50% 0%',
        duration: 0.2,
        ease: 'power2.in',
        stagger: { each: 0.03, from: 'end' },
        overwrite: 'auto',
      })
    }
  }

  const onToggle = () => setOpen(!nav.classList.contains('is-open'))
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') setOpen(false)
  }
  const onDocClick = (event: MouseEvent) => {
    if (
      nav.classList.contains('is-open') &&
      !nav.contains(event.target as Node)
    ) {
      setOpen(false)
    }
  }
  const onLinkClick = () => setOpen(false)
  const links = Array.from(nav.querySelectorAll<HTMLAnchorElement>('.nav-menu a'))

  toggle.addEventListener('click', onToggle)
  document.addEventListener('keydown', onKey)
  document.addEventListener('click', onDocClick)
  for (const link of links) link.addEventListener('click', onLinkClick)

  return () => {
    itemsTween?.kill()
    toggle.removeEventListener('click', onToggle)
    document.removeEventListener('keydown', onKey)
    document.removeEventListener('click', onDocClick)
    for (const link of links) link.removeEventListener('click', onLinkClick)
  }
}

export function mountHero(container: HTMLElement): () => void {
  container.insertAdjacentHTML('beforeend', markup)
  const unbindNav = bindNav(container)
  const motion = initMotion(container)
  const destroyIntro = initIntro(container, { onReady: motion.resume })
  void import('./engine.js').then(({ startEngine }) => {
    startEngine()
  })

  return () => {
    destroyIntro()
    motion.destroy()
    unbindNav()
  }
}
