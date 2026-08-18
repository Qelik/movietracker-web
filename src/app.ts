/**
 * The shell: header, tabs, routing, and what happens when the session ends.
 *
 * Five tabs matching the iOS app, addressed by hash so the browser's back
 * button works and a tab survives a reload. Search takes over the Discover
 * pane rather than owning a tab of its own.
 */
import * as api from './api.js'
import { byId, clear, el, toast } from './dom.js'
import * as library from './library.js'
import { on } from './store.js'
import { APP_VERSION } from './version.js'
import { renderSignIn } from './views/auth.js'
import * as diary from './views/diary.js'
import * as discover from './views/discover.js'
import * as lists from './views/lists.js'
import * as profile from './views/profile.js'
import * as watchlist from './views/watchlist.js'

type Tab = 'discover' | 'diary' | 'watchlist' | 'lists' | 'profile'

interface TabDefinition {
  id: Tab
  label: string
  icon: string
  mount: (root: HTMLElement) => () => void
}

const TABS: TabDefinition[] = [
  { id: 'discover', label: 'Discover', icon: '✨', mount: discover.mount },
  { id: 'diary', label: 'Diary', icon: '🗓️', mount: diary.mount },
  { id: 'watchlist', label: 'Watchlist', icon: '🔖', mount: watchlist.mount },
  { id: 'lists', label: 'Lists', icon: '🍿', mount: lists.mount },
  { id: 'profile', label: 'Profile', icon: '👤', mount: profile.mount },
]

let currentTab: Tab = 'discover'
let teardown: (() => void) | null = null
let searchQuery = ''

function tabFromHash(): Tab {
  const raw = location.hash.replace(/^#\/?/, '')
  const found = TABS.find((tab) => tab.id === raw)
  return found?.id ?? 'discover'
}

function renderShell(): void {
  const app = byId('app')
  clear(app)
  app.append(
    header(),
    el('main', { id: 'view' }),
    nav(),
  )
  show(tabFromHash())
}

function header(): HTMLElement {
  const search = el('input', {
    class: 'search-input',
    type: 'search',
    id: 'search',
    placeholder: 'Search films and shows',
    'aria-label': 'Search films and shows',
  })
  search.value = searchQuery

  let timer: number | undefined
  search.addEventListener('input', () => {
    window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      searchQuery = search.value.trim()
      if (currentTab !== 'discover') {
        show('discover')
      } else {
        paint()
      }
    }, 320)
  })
  search.addEventListener('search', () => {
    if (search.value.trim() === '' && searchQuery !== '') {
      searchQuery = ''
      paint()
    }
  })

  window.addEventListener('mt:clear-search', () => {
    searchQuery = ''
    const box = document.getElementById('search') as HTMLInputElement | null
    if (box) box.value = ''
    paint()
  })

  const user = api.currentUser()

  return el('header', { class: 'app-header' }, [
    el('div', { class: 'brand' }, [
      el('span', { class: 'brand-mark', 'aria-hidden': 'true', text: '🎞️' }),
      el('div', {}, [
        el('h1', { text: 'MovieTracker' }),
        el('p', { class: 'tagline', text: user?.displayName ?? user?.handle ?? '' }),
      ]),
    ]),
    el('div', { class: 'header-tools' }, [search]),
  ])
}

function nav(): HTMLElement {
  const bar = el('nav', { class: 'bottom-nav', 'aria-label': 'Sections' })
  for (const tab of TABS) {
    const item = el('button', {
      class: `bn-item${tab.id === currentTab ? ' active' : ''}`,
      type: 'button',
      id: `nav-${tab.id}`,
      'aria-current': tab.id === currentTab ? 'page' : 'false',
    }, [
      el('span', { class: 'bn-ico', 'aria-hidden': 'true', text: tab.icon }),
      el('span', { class: 'bn-label', text: tab.label }),
      tab.id === 'lists' ? el('span', { class: 'badge', id: 'lists-badge', hidden: true }) : null,
    ])
    item.addEventListener('click', () => show(tab.id))
    bar.append(item)
  }
  return bar
}

function show(tab: Tab): void {
  currentTab = tab
  if (location.hash.replace(/^#\/?/, '') !== tab) location.hash = `#${tab}`
  for (const definition of TABS) {
    const item = document.getElementById(`nav-${definition.id}`)
    item?.classList.toggle('active', definition.id === tab)
    item?.setAttribute('aria-current', definition.id === tab ? 'page' : 'false')
  }
  paint()
}

function paint(): void {
  const view = byId('view')
  teardown?.()
  teardown = null
  clear(view)
  window.scrollTo({ top: 0 })

  const definition = TABS.find((tab) => tab.id === currentTab)
  if (!definition) return

  if (currentTab === 'discover' && searchQuery.length >= 2) {
    teardown = discover.mountSearch(view, searchQuery)
    return
  }

  view.append(el('h2', { class: 'view-title', text: definition.label }))
  teardown = definition.mount(view)
}

async function refreshBadge(): Promise<void> {
  const badge = document.getElementById('lists-badge')
  if (!badge) return
  try {
    const { unread } = await api.notifications(1)
    badge.textContent = unread > 99 ? '99+' : String(unread)
    badge.hidden = unread === 0
  } catch {
    // A badge is not worth a visible error.
  }
}

function signedOut(): void {
  library.forget()
  const app = byId('app')
  clear(app)
  renderSignIn(app, () => {
    renderShell()
    void afterSignIn()
  })
}

async function afterSignIn(): Promise<void> {
  try {
    await api.me()
  } catch (error) {
    // Being offline must not bounce a user holding valid tokens back to the
    // sign-in screen. The stored profile is good enough to render with.
    if (error instanceof api.ApiError && error.status === 0) {
      toast('Offline — showing what was already loaded.')
    }
  }
  void refreshBadge()
}

function boot(): void {
  api.whenSignedOut(() => {
    toast('Your session expired. Sign in again.', 'error')
    signedOut()
  })

  window.addEventListener('hashchange', () => {
    const next = tabFromHash()
    if (next !== currentTab) show(next)
  })

  on('notifications', () => void refreshBadge())
  on('profile', () => renderShell())

  if (api.isSignedIn()) {
    renderShell()
    void afterSignIn()
  } else {
    signedOut()
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      void navigator.serviceWorker.register('./sw.js').catch(() => {
        // No service worker means no offline shell, which is survivable.
      })
    })
  }

  console.info(`MovieTracker web ${APP_VERSION}`)
}

boot()
