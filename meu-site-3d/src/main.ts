import './style.css'
import { mountHero } from './hero/hero'
import { mountAbout } from './about/about'
import { mountServices } from './services/services'
import { mountProjects } from './projects/projects'
import { mountTalk } from './talk/talk'
import { mountFooter } from './footer/footer'

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) {
  throw new Error('Missing #app')
}

app.innerHTML = ''

const story = document.createElement('div')
story.className = 'story'
app.appendChild(story)

const destroyHero = mountHero(story)
const destroyAbout = mountAbout(story)
const destroyServices = mountServices(story)
const destroyProjects = mountProjects(story)
const destroyTalk = mountTalk(story)
const destroyFooter = mountFooter(app)

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    destroyFooter()
    destroyTalk()
    destroyProjects()
    destroyServices()
    destroyAbout()
    destroyHero()
    story.remove()
  })
}
