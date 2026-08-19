import gsap from 'gsap'

type IntroOptions = {
  onReady: () => void
}

function fitWordmarkProxy(proxy: HTMLElement, hero: HTMLElement) {
  const style =
    (window as Window & { LUME_WORDMARK_STYLE?: { widthFrac: number } })
      .LUME_WORDMARK_STYLE || { widthFrac: 0.7 }
  const containerWidth = hero.getBoundingClientRect().width
  const targetWidth = containerWidth * style.widthFrac

  const chars = proxy.querySelectorAll('.wp-char')
  if (!chars.length) return

  proxy.style.fontSize = '100px'
  const first = chars[0].getBoundingClientRect()
  const last = chars[chars.length - 1].getBoundingClientRect()
  const measured = last.right - first.left || 1
  proxy.style.fontSize = `${Math.max(8, 100 * (targetWidth / measured))}px`
}

function revealFallback(root: HTMLElement, onReady: () => void) {
  const pre = root.querySelector<HTMLElement>('#preloader')
  const proxy = root.querySelector<HTMLElement>('#wordmark-proxy')
  const scene = root.querySelector<HTMLElement>('#scene')
  const nav = root.querySelector<HTMLElement>('[data-nav]')
  const agency = root.querySelector<HTMLElement>('[data-agency]')
  if (pre) pre.style.display = 'none'
  if (proxy) proxy.style.display = 'none'
  if (scene) scene.style.opacity = '1'
  if (agency) gsap.set(agency, { autoAlpha: 1 })
  if (nav) gsap.set(nav, { autoAlpha: 1, y: 0 })
  onReady()
}

export function initIntro(root: HTMLElement, options: IntroOptions): () => void {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const pre = root.querySelector<HTMLElement>('#preloader')
  const numEl = root.querySelector<HTMLElement>('#preloader-number')
  const barEl = root.querySelector<HTMLElement>('#preloader-bar-fill')
  const proxy = root.querySelector<HTMLElement>('#wordmark-proxy')
  const scene = root.querySelector<HTMLElement>('#scene')
  const hero = root.querySelector<HTMLElement>('#hero')
  const nav = root.querySelector<HTMLElement>('[data-nav]')
  const agency = root.querySelector<HTMLElement>('[data-agency]')

  const tweens: Array<gsap.core.Tween | gsap.core.Timeline> = []
  let resizeTimer = 0

  const finish = () => {
    for (const tw of tweens) tw.kill()
    window.clearTimeout(resizeTimer)
    window.removeEventListener('resize', onResize)
  }

  const onResize = () => {
    window.clearTimeout(resizeTimer)
    resizeTimer = window.setTimeout(() => {
      if (proxy && proxy.style.display !== 'none' && hero) {
        fitWordmarkProxy(proxy, hero)
      }
    }, 200)
  }

  if (!pre || !numEl || !proxy || !scene || !hero) {
    revealFallback(root, options.onReady)
    return finish
  }

  document.documentElement.classList.add('is-preloading')
  if (nav) gsap.set(nav, { autoAlpha: 0, y: 18 })

  const runPreloader = (onDone: () => void) => {
    const hide = () => {
      const tw = gsap.to(pre, {
        autoAlpha: 0,
        duration: reduced ? 0.3 : 0.8,
        ease: 'power2.out',
        onComplete: () => {
          pre.style.display = 'none'
          onDone()
        },
      })
      tweens.push(tw)
    }

    if (reduced) {
      numEl.textContent = '100'
      if (barEl) barEl.style.width = '100%'
      hide()
      return
    }

    const counter = { val: 0 }
    const tl = gsap.timeline({ onComplete: hide })
    tl.to(counter, {
      val: 100,
      duration: 1.6,
      ease: 'power1.inOut',
      onUpdate: () => {
        const v = Math.floor(counter.val)
        numEl.textContent = String(v).padStart(3, '0')
        if (barEl) barEl.style.width = `${v}%`
      },
    }).to({}, { duration: 0.2 })
    tweens.push(tl)
  }

  const crossfadeProxyToCanvas = (instant: boolean) => {
    const duration = instant ? 0.3 : 0.6
    const delay = instant ? 0 : 0.15
    tweens.push(
      gsap.to(scene, { opacity: 1, duration, delay, ease: 'power2.inOut' }),
    )
    if (agency) {
      tweens.push(
        gsap.to(agency, { autoAlpha: 1, duration, delay, ease: 'power2.inOut' }),
      )
    }
    tweens.push(
      gsap.to(proxy, {
        opacity: 0,
        duration,
        delay,
        ease: 'power2.inOut',
        onComplete: () => {
          proxy.style.display = 'none'
          document.documentElement.classList.remove('is-preloading')
          if (nav) {
            tweens.push(
              gsap.to(nav, { autoAlpha: 1, y: 0, duration: 0.48, ease: 'power2.out' }),
            )
          }
          options.onReady()
        },
      }),
    )
  }

  const fontsReady =
    document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()

  runPreloader(() => {
    void fontsReady.then(() => {
      fitWordmarkProxy(proxy, hero)
      gsap.set(proxy, { autoAlpha: 1 })
      const chars = proxy.querySelectorAll('.wp-char')

      if (reduced) {
        gsap.set(chars, { opacity: 1, y: 0, clipPath: 'none' })
        crossfadeProxyToCanvas(true)
        return
      }

      gsap.set(chars, { opacity: 0, y: 26, clipPath: 'inset(0% 0 100% 0)' })
      const tl = gsap.timeline({
        onComplete: () => crossfadeProxyToCanvas(false),
      })
      tl.to(chars, {
        opacity: 1,
        y: 0,
        clipPath: 'inset(0% 0 0% 0)',
        duration: 0.7,
        ease: 'power3.out',
        stagger: 0.11,
      })
      tweens.push(tl)
    })
  })

  window.addEventListener('resize', onResize)

  return finish
}
