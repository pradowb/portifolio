import './avatar.css'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const markup = `
  <div class="avatar-rail">
    <div class="avatar-sticky">
      <div class="avatar-card" data-avatar>
        <div class="avatar-face avatar-face-back" aria-hidden="true">
          <img src="/images/IMG_5333.jpg" alt="" width="400" height="456" />
        </div>
        <div class="avatar-face avatar-face-front">
          <img
            src="/images/IMG_5333.jpg"
            alt="Retrato de Ale"
            width="400"
            height="456"
          />
        </div>
      </div>
    </div>
  </div>
`

function initAvatarMotion(story: HTMLElement, card: HTMLElement): () => void {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduced) {
    gsap.set(card, { rotationY: 180 })
    return () => {}
  }

  const heroScroll = story.querySelector<HTMLElement>('.hero-scroll')

  const ctx = gsap.context(() => {
    // Entrance: small, low and monochrome — like the video's opening frame
    gsap.from(card, {
      autoAlpha: 0,
      duration: 0.8,
      ease: 'power2.out',
      delay: 0.55,
    })

    if (heroScroll) {
      // Grow across the hero scroll, flipping the card mid-way:
      // the b&w back face spins on the Y axis and reveals the red front,
      // settling full-size and dead-center for the About screen.
      gsap
        .timeline({
          defaults: { ease: 'none' },
          scrollTrigger: {
            trigger: heroScroll,
            start: 'top top',
            end: 'bottom bottom',
            scrub: true,
          },
        })
        // One continuous glide to center — no velocity seams between segments
        .fromTo(
          card,
          { scale: 0.52, y: '26vh', rotationY: 0, rotationX: 0 },
          { scale: 1, y: '-6vh', duration: 0.75, ease: 'power1.out' },
          0,
        )
        // Flip happens mid-glide, wobbling slightly in X and settling flat
        .to(card, { rotationY: 180, duration: 0.34, ease: 'power1.inOut' }, 0.24)
        .to(card, { rotationX: -6, duration: 0.17, ease: 'sine.in' }, 0.24)
        .to(card, { rotationX: 0, duration: 0.17, ease: 'sine.out' }, 0.41)
        // Idle tail: the card rests while About finishes covering the hero
        .to({}, { duration: 0.25 }, 0.75)
    }

  }, story)

  return () => ctx.revert()
}

export function mountAvatar(story: HTMLElement): () => void {
  story.insertAdjacentHTML('beforeend', markup)
  const rail = story.querySelector<HTMLElement>('.avatar-rail')!
  const card = story.querySelector<HTMLElement>('[data-avatar]')!

  for (const img of card.querySelectorAll('img')) {
    img.addEventListener(
      'error',
      () => img.closest('.avatar-face')?.classList.add('is-placeholder'),
      { once: true },
    )
  }

  // The rail ends with the hero pin: the photo releases exactly when the
  // About finishes arriving, then scrolls in parallel with its text.
  const heroScroll = story.querySelector<HTMLElement>('.hero-scroll')
  const sizeRail = () => {
    if (heroScroll) {
      rail.style.height = `${heroScroll.offsetHeight}px`
    }
  }

  sizeRail()
  window.addEventListener('resize', sizeRail)
  window.addEventListener('load', sizeRail, { once: true })
  ScrollTrigger.addEventListener('refreshInit', sizeRail)

  const destroyMotion = initAvatarMotion(story, card)
  ScrollTrigger.refresh()

  return () => {
    destroyMotion()
    window.removeEventListener('resize', sizeRail)
    window.removeEventListener('load', sizeRail)
    ScrollTrigger.removeEventListener('refreshInit', sizeRail)
    rail.remove()
  }
}
