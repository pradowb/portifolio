import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import 'lenis/dist/lenis.css'

gsap.registerPlugin(ScrollTrigger)

export type SiteMotion = {
  pause: () => void
  resume: () => void
  destroy: () => void
}

export function initMotion(_root: HTMLElement): SiteMotion {
  const lenis = new Lenis({
    lerp: 0.16,
    smoothWheel: true,
    autoRaf: false,
    anchors: true,
  })

  const onScroll = () => {
    ScrollTrigger.update()
  }
  lenis.on('scroll', onScroll)

  const ticker = (time: number) => {
    lenis.raf(time * 1000)
  }
  gsap.ticker.add(ticker)
  gsap.ticker.lagSmoothing(0)

  lenis.stop()

  return {
    pause() {
      lenis.stop()
      document.documentElement.classList.add('is-preloading')
    },
    resume() {
      document.documentElement.classList.remove('is-preloading')
      lenis.start()
    },
    destroy() {
      gsap.ticker.remove(ticker)
      lenis.off('scroll', onScroll)
      lenis.destroy()
      gsap.ticker.lagSmoothing(500, 33)
      document.documentElement.classList.remove('is-preloading')
    },
  }
}
