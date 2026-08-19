import './projects.css'
import '../fluid-cursor/fluid-cursor.css'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { startFluidCursor } from '../fluid-cursor/fluid-cursor.js'

gsap.registerPlugin(ScrollTrigger)

interface Project {
  id: number
  title: string
  category: string
  year: string
  video: string
  cover: string
  gallery: string[]
  href: string
  aspect?: string
  fit?: 'contain' | 'cover'
  position?: string
  frameBg?: string
}

const projects: Project[] = [
  {
    id: 1,
    title: 'Lumen',
    category: 'Desenvolvimento frontend',
    year: '2026',
    video: '/videos/projects/project-01.mp4',
    cover: '/images/projects/project-01/cover.png',
    gallery: [
      '/images/projects/project-01/detail-01.png',
      '/images/projects/project-01/detail-02.png',
    ],
    href: '#',
    aspect: '2848 / 1510',
    fit: 'contain',
  },
  {
    id: 2,
    title: 'Navalha BarberShop',
    category: 'Desenvolvimento frontend',
    year: '2026',
    video: '/videos/projects/project-02.mp4',
    cover: '/images/projects/project-02/cover.png',
    gallery: [
      '/images/projects/project-02/detail-01.png',
      '/images/projects/project-02/detail-02.png',
    ],
    href: '#',
    aspect: '2848 / 1566',
    fit: 'cover',
    position: 'center 38%',
    frameBg: '#0a0a0a',
  },
]

const CLIP_VISIBLE = 'inset(0% 0% 0% 0%)'
const CLIP_FROM = [
  'inset(100% 0% 0% 0%)',
  'inset(0% 0% 100% 0%)',
  'inset(0% 100% 0% 0%)',
]

const CHAPTER_VH = 160
const CHAPTER_VH_NARROW = 140

function renderProject(project: Project, index: number): string {
  const preload = index === 0 ? 'auto' : 'none'
  const coverLoading = index === 0 ? 'eager' : 'lazy'
  const details = project.gallery
    .map(
      (src, gi) => `
        <div class="project-detail" data-detail>
          <img
            src="${src}"
            alt="${project.title} — detalhe ${gi + 1}"
            loading="lazy"
          />
        </div>`,
    )
    .join('')

  return `
    <article
      class="project-slide"
      data-slide
      data-slot="${index % 2 === 0 ? 'left' : 'right'}"
      data-fit="${project.fit ?? 'contain'}"
      style="--project-aspect: ${project.aspect ?? '2848 / 1510'}; --project-pos: ${project.position ?? 'center'}; --project-frame-bg: ${project.frameBg ?? 'var(--bg)'};"
    >
      <a class="project-link" href="${project.href}">
        <div class="project-layout">
          <div class="project-device">
            <img
              class="project-laptop"
              src="/images/projects/laptop-frame.png?v=4"
              alt=""
              width="1024"
              height="682"
            />
            <div class="project-screen">
              <div class="project-clip" data-video-clip>
                <video
                  data-video
                  src="${project.video}"
                  poster="${project.cover}"
                  muted
                  loop
                  playsinline
                  webkit-playsinline
                  preload="${preload}"
                  aria-label="Prévia de ${project.title}"
                ></video>
                <img
                  class="project-cover"
                  data-cover
                  src="${project.cover}"
                  alt="${project.title} — ${project.category}"
                  loading="${coverLoading}"
                />
              </div>
              ${details}
            </div>
          </div>
          <div class="project-info">
            <h3 class="project-name" data-title></h3>
            <p class="project-meta" data-meta>
              <span>${project.category}</span>
              <span>${project.year}</span>
            </p>
          </div>
        </div>
      </a>
    </article>`
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

function bindVideoPlayback(section: HTMLElement): {
  playIndex: (index: number) => void
  destroy: () => void
} {
  const videos = Array.from(section.querySelectorAll<HTMLVideoElement>('[data-video]'))
  const scroll = section.querySelector<HTMLElement>('[data-projects-scroll]')
  const cleanups: Array<() => void> = []

  const startHero = (video: HTMLVideoElement) => {
    const slide = video.closest('[data-slide]')
    video.currentTime = 0
    video.play().catch(() => slide?.classList.add('is-fallback'))
  }

  const playIndex = (index: number) => {
    videos.forEach((video, i) => {
      if (i === index) startHero(video)
      else video.pause()
    })
  }

  for (const video of videos) {
    const slide = video.closest('[data-slide]')
    video.addEventListener('playing', () => slide?.classList.add('is-playing'))
    video.addEventListener(
      'error',
      () => slide?.classList.add('is-fallback'),
      { once: true },
    )
  }

  if (scroll) {
    const st = ScrollTrigger.create({
      trigger: scroll,
      start: 'top 85%',
      end: 'bottom bottom',
      onEnter: () => playIndex(0),
      onEnterBack: () => playIndex(0),
      onLeave: () => videos.forEach((video) => video.pause()),
      onLeaveBack: () => videos.forEach((video) => video.pause()),
    })
    cleanups.push(() => st.kill())
  }

  return {
    playIndex,
    destroy() {
      for (const fn of cleanups) fn()
      for (const video of videos) video.pause()
    },
  }
}

function initProjectsMotion(
  section: HTMLElement,
  playIndex: (index: number) => void,
): () => void {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduced) {
    section.classList.add('is-static')
    return () => {}
  }

  const scroll = section.querySelector<HTMLElement>('[data-projects-scroll]')!
  const stage = section.querySelector<HTMLElement>('[data-projects-stage]')!
  const slides = Array.from(section.querySelectorAll<HTMLElement>('[data-slide]'))
  const current = section.querySelector<HTMLElement>('[data-progress-current]')!
  const cleanups: Array<() => void> = []

  const sizeScroll = () => {
    const vh = window.innerWidth <= 1024 ? CHAPTER_VH_NARROW : CHAPTER_VH
    scroll.style.height = `${projects.length * vh}vh`
  }
  sizeScroll()
  window.addEventListener('resize', sizeScroll)
  cleanups.push(() => window.removeEventListener('resize', sizeScroll))

  const ctx = gsap.context(() => {
    gsap.from('.projects-title', {
      y: 24,
      autoAlpha: 0,
      duration: 0.6,
      ease: 'power2.out',
      scrollTrigger: { trigger: '.projects-head', start: 'top 78%', once: true },
    })

    let activeIndex = -1
    const tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: scroll,
        start: 'top top',
        end: 'bottom bottom',
        scrub: true,
        onUpdate(self) {
          const index = Math.min(
            projects.length - 1,
            Math.floor(self.progress * projects.length),
          )
          if (index !== activeIndex) {
            activeIndex = index
            current.textContent = String(index + 1).padStart(2, '0')
            playIndex(index)
          }
        },
      },
    })

    slides.forEach((slide, i) => {
      const layout = slide.querySelector<HTMLElement>('.project-layout')!
      const videoClip = slide.querySelector<HTMLElement>('[data-video-clip]')!
      const details = Array.from(slide.querySelectorAll<HTMLElement>('[data-detail]'))
      const chars = slide.querySelectorAll<HTMLElement>('.char')
      const meta = slide.querySelector<HTMLElement>('[data-meta]')!
      const title = slide.querySelector<HTMLElement>('[data-title]')!
      const isLast = i === slides.length - 1
      const narrow = window.innerWidth <= 1024
      const slot = i % 2 === 0 ? 'left' : 'right'
      const restX = '0vw'
      const enterX = narrow ? '0vw' : slot === 'left' ? '-10vw' : '10vw'
      const exitX = enterX

      gsap.set(details, { autoAlpha: 0 })
      gsap.set(videoClip, { clipPath: CLIP_VISIBLE, scale: 1 })
      gsap.set(layout, { x: restX, y: 0 })

      if (i === 0) {
        gsap.set(slide, { autoAlpha: 1 })
      } else {
        gsap.set(slide, { autoAlpha: 0 })
        tl.fromTo(
          slide,
          { autoAlpha: 0 },
          { autoAlpha: 1, duration: 0.12, ease: 'power2.out' },
          i,
        )
        tl.fromTo(
          layout,
          { x: enterX, y: '6vh' },
          { x: restX, y: '0vh', duration: 0.16, ease: 'power2.out' },
          i,
        )
      }

      tl.fromTo(
        chars,
        { autoAlpha: 0, y: 28, filter: 'blur(8px)' },
        {
          autoAlpha: 1,
          y: 0,
          filter: 'blur(0px)',
          duration: 0.12,
          stagger: 0.014,
          ease: 'power2.out',
        },
        i + 0.04,
      )

      tl.fromTo(
        meta,
        { autoAlpha: 0, y: 10 },
        { autoAlpha: 1, y: 0, duration: 0.08, ease: 'power2.out' },
        i + 0.12,
      )

      details.forEach((detail, gi) => {
        const start = i + 0.36 + gi * 0.22
        tl.fromTo(
          detail,
          {
            autoAlpha: 0,
            clipPath: CLIP_FROM[(gi + 1) % CLIP_FROM.length],
          },
          {
            autoAlpha: 1,
            clipPath: CLIP_VISIBLE,
            duration: 0.14,
            ease: 'power2.out',
          },
          start,
        )
      })

      tl.fromTo(title, { y: 0 }, { y: -8, duration: 0.68 }, i + 0.28)
      tl.fromTo(meta, { y: 0 }, { y: -6, duration: 0.64 }, i + 0.32)

      if (!isLast) {
        tl.to(
          layout,
          { x: exitX, y: '-8vh', duration: 0.22, ease: 'power1.in' },
          i + 0.84,
        )
        tl.to(
          slide,
          { autoAlpha: 0, duration: 0.18, ease: 'power1.in' },
          i + 0.88,
        )
      }
    })

    gsap.from('.projects-progress', {
      autoAlpha: 0,
      duration: 0.5,
      ease: 'power2.out',
      scrollTrigger: { trigger: scroll, start: 'top 60%', once: true },
    })
  }, section)

  cleanups.push(() => ctx.revert())

  const finePointer = window.matchMedia('(pointer: fine)').matches
  if (finePointer) {
    const xTo = gsap.quickTo(stage, 'x', { duration: 0.9, ease: 'power3' })
    const yTo = gsap.quickTo(stage, 'y', { duration: 0.9, ease: 'power3' })
    const onMove = (event: MouseEvent) => {
      const rect = scroll.getBoundingClientRect()
      const inView = rect.top <= 0 && rect.bottom >= window.innerHeight
      if (!inView) return
      xTo((event.clientX / window.innerWidth - 0.5) * 12)
      yTo((event.clientY / window.innerHeight - 0.5) * 8)
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    cleanups.push(() => window.removeEventListener('mousemove', onMove))
  }

  return () => {
    for (const fn of cleanups.reverse()) fn()
  }
}

export function mountProjects(container: HTMLElement): () => void {
  const total = String(projects.length).padStart(2, '0')
  const section = document.createElement('section')
  section.className = 'projects-section has-fluid-cursor'
  section.id = 'projects'
  section.setAttribute('aria-labelledby', 'projects-title')
  section.innerHTML = `
    <div class="projects-head">
      <h2 class="projects-title" id="projects-title">Projetos em destaque</h2>
    </div>
    <div class="projects-scroll" data-projects-scroll>
      <div class="projects-sticky">
        <canvas class="fluid-cursor" aria-hidden="true"></canvas>
        <div class="projects-stage" data-projects-stage>
          ${projects.map(renderProject).join('')}
        </div>
        <p class="projects-progress" aria-hidden="true">
          <span data-progress-current>01</span>&nbsp;/&nbsp;${total}
        </p>
      </div>
    </div>
  `
  container.appendChild(section)

  const titles = section.querySelectorAll<HTMLElement>('[data-title]')
  titles.forEach((el, i) => splitChars(el, projects[i].title))

  const video = bindVideoPlayback(section)
  const destroyMotion = initProjectsMotion(section, video.playIndex)
  const canvas = section.querySelector<HTMLCanvasElement>('.fluid-cursor')
  const sticky = section.querySelector<HTMLElement>('.projects-sticky')
  const destroyFluid =
    canvas && sticky ? startFluidCursor(canvas, sticky) : () => {}
  ScrollTrigger.refresh()

  return () => {
    destroyFluid()
    destroyMotion()
    video.destroy()
    section.remove()
  }
}
