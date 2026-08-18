/**
 * Profile: statistics, your ratings, your tags, shared-list activity, and the
 * account itself. A sub-nav rather than five tabs, matching the app.
 */
import * as api from '../api.js'
import { APP_VERSION } from '../version.js'
import { barList, chipRow, field, input, posterCard, sectionHead } from '../components.js'
import { busy, button, clear, confirmModal, el, empty, modal, spinner, toast } from '../dom.js'
import { plural, scoreLabel, starsFor } from '../format.js'
import * as library from '../library.js'
import { emit, on } from '../store.js'
import { openTitle } from '../title.js'
import type { Stats } from '../types.js'

type Pane = 'stats' | 'ratings' | 'tags' | 'activity' | 'account'

let pane: Pane = 'stats'
let statsYear: number | null = null

export function mount(root: HTMLElement): () => void {
  const nav = el('div', { class: 'stack' })
  const body = el('div')
  root.append(nav, body)

  const draw = () => {
    clear(nav)
    nav.append(
      chipRow(
        [
          { value: 'stats' as Pane, label: 'Stats' },
          { value: 'ratings' as Pane, label: 'Ratings' },
          { value: 'tags' as Pane, label: 'Tags' },
          { value: 'activity' as Pane, label: 'Activity' },
          { value: 'account' as Pane, label: 'Account' },
        ],
        pane,
        (value) => {
          pane = value
          draw()
        },
      ),
    )
    clear(body)
    if (pane === 'stats') void renderStats(body, draw)
    else if (pane === 'ratings') void renderRatings(body)
    else if (pane === 'tags') void renderTags(body, draw)
    else if (pane === 'activity') void renderActivity(body, draw)
    else renderAccount(body)
  }

  draw()
  return on('library', () => {
    if (pane === 'stats' || pane === 'ratings' || pane === 'tags') draw()
  })
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong'
}

// MARK: Stats

async function renderStats(body: HTMLElement, redraw: () => void): Promise<void> {
  clear(body)
  body.append(spinner('Working out your numbers'))

  let stats: Stats
  try {
    stats = await api.stats(statsYear)
  } catch (error) {
    clear(body)
    body.append(el('p', { class: 'error-note', text: message(error) }))
    return
  }

  clear(body)

  const years: { value: number; label: string }[] = [
    { value: 0, label: 'All time' },
    ...stats.availableYears.map((year) => ({ value: year, label: String(year) })),
  ]
  body.append(
    chipRow(years, statsYear ?? 0, (value) => {
      statsYear = value === 0 ? null : value
      redraw()
    }, 'secondary'),
  )

  const totals = stats.selected
  body.append(
    el('div', { class: 'stats-strip' }, [
      stat(String(totals.films), 'Films'),
      stat(String(totals.shows), 'Shows'),
      stat(String(totals.episodes), 'Episodes'),
      stat(String(totals.viewings), 'Viewings'),
      stat(`${totals.hoursWatched}`, 'Hours'),
      stat(stats.averageRating === null ? '—' : stats.averageRating.toFixed(1), 'Average score'),
    ]),
  )

  if (totals.viewingsWithUnknownRuntime > 0) {
    body.append(
      el('p', {
        class: 'muted',
        text: `${plural(totals.viewingsWithUnknownRuntime, 'viewing')} had no runtime on TMDB and are not in the hours above.`,
      }),
    )
  }

  if (stats.monthlyViewings) {
    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    body.append(
      sectionHead('By month'),
      barList(
        stats.monthlyViewings.map((row) => ({
          label: names[row.month - 1] ?? String(row.month),
          value: row.viewings,
        })),
      ),
    )
  }

  if (stats.genres.length) {
    body.append(
      sectionHead('Genres', 'Share is of genre mentions, so a three-genre film counts in three.'),
      barList(
        stats.genres.slice(0, 10).map((genre) => ({
          label: genre.name,
          value: genre.viewings,
          caption: `${Math.round(genre.share * 100)}%`,
        })),
      ),
    )
  }

  if (stats.topDirectors.length) {
    body.append(
      sectionHead('Directors and creators'),
      barList(stats.topDirectors.map((row) => ({ label: row.name, value: row.viewings }))),
    )
  }

  if (stats.topActors.length) {
    body.append(
      sectionHead('Faces you keep seeing'),
      barList(stats.topActors.map((row) => ({ label: row.name, value: row.viewings }))),
    )
  }

  if (stats.decades.length) {
    body.append(
      sectionHead('Decades'),
      barList(stats.decades.map((row) => ({ label: `${row.decade}s`, value: row.viewings }))),
    )
  }

  if (stats.ratingDistribution.some((row) => row.count > 0)) {
    body.append(
      sectionHead('How you rate'),
      barList(
        stats.ratingDistribution.map((row) => ({
          label: starsFor(row.score),
          value: row.count,
        })),
      ),
    )
  }

  const runtime = stats.runtime
  if (runtime.averageMinutes !== null || runtime.longest || runtime.shortest) {
    body.append(
      sectionHead('Runtime'),
      el('div', { class: 'stats-strip' }, [
        stat(runtime.averageMinutes === null ? '—' : `${Math.round(runtime.averageMinutes)}m`, 'Average'),
        stat(runtime.longest ? `${runtime.longest.minutes}m` : '—', runtime.longest?.title ?? 'Longest'),
        stat(runtime.shortest ? `${runtime.shortest.minutes}m` : '—', runtime.shortest?.title ?? 'Shortest'),
      ]),
    )
  }

  if (stats.allTime.viewings === 0) {
    body.append(empty('Log something and this page fills in.'))
  }
}

function stat(value: string, label: string): HTMLElement {
  return el('div', { class: 'stat' }, [
    el('div', { class: 'num', text: value }),
    el('div', { class: 'lbl', text: label }),
  ])
}

// MARK: Ratings

async function renderRatings(body: HTMLElement): Promise<void> {
  clear(body)
  body.append(spinner('Loading your ratings'))

  try {
    const ratings = await library.getRatings()
    clear(body)
    if (ratings.length === 0) {
      body.append(empty('Nothing rated yet.'))
      return
    }

    const sorted = [...ratings].sort((a, b) => b.score - a.score || (a.movie?.title ?? '').localeCompare(b.movie?.title ?? ''))
    body.append(el('p', { class: 'muted count', text: plural(sorted.length, 'rating') }))
    body.append(
      el(
        'div',
        { class: 'poster-grid' },
        sorted.map((rating) => {
          const movie = rating.movie
          if (!movie) {
            return el('div', { class: 'poster-card' }, [el('span', { text: `#${rating.tmdbId}` })])
          }
          return el('div', { class: 'rated-card' }, [
            posterCard(movie, openTitle, starsFor(rating.score)),
            rating.review ? el('p', { class: 'wl-note', text: rating.review }) : null,
            el('p', { class: 'muted small', text: scoreLabel(rating.score) }),
          ])
        }),
      ),
    )
  } catch (error) {
    clear(body)
    body.append(el('p', { class: 'error-note', text: message(error) }))
  }
}

// MARK: Tags

async function renderTags(body: HTMLElement, redraw: () => void): Promise<void> {
  clear(body)
  body.append(spinner('Loading your tags'))

  try {
    const tags = await library.getTags()
    clear(body)

    const name = input('text', { placeholder: 'New tag', maxlength: 40 })
    const add = button('Add tag', () =>
      void busy(add, async () => {
        const value = name.value.trim()
        if (!value) return
        try {
          await api.createTag(value)
          library.invalidate(['tags'])
          redraw()
        } catch (error) {
          toast(message(error), 'error')
        }
      }),
    'primary')

    body.append(el('div', { class: 'inline-form' }, [name, add]))

    if (tags.length === 0) {
      body.append(empty('No tags yet. Tags are yours alone — nobody else sees them.'))
      return
    }

    const rows = tags.map((tag) => {
      const rename = button('Rename', () => {
        const next = input('text', { value: tag.name, maxlength: 40 })
        const save = button('Save', () =>
          void busy(save, async () => {
            try {
              await api.renameTag(tag.id, next.value.trim())
              library.invalidate(['tags'])
              redraw()
              close()
            } catch (error) {
              toast(message(error), 'error')
            }
          }),
        'primary')
        const close = modal({
          title: 'Rename tag',
          body: el('div', { class: 'form' }, [field('Name', next)]),
          actions: [button('Cancel', () => close()), save],
        })
      }, 'ghost small')

      const remove = button('Delete', () =>
        void busy(remove, async () => {
          if (!(await confirmModal({
            title: 'Delete tag',
            message: `Delete “${tag.name}”? It comes off every title it is on.`,
            confirmLabel: 'Delete',
            destructive: true,
          }))) {
            return
          }
          try {
            await api.deleteTag(tag.id)
            library.invalidate(['tags'])
            redraw()
          } catch (error) {
            toast(message(error), 'error')
          }
        }),
      'ghost small danger')

      return el('div', { class: 'member-row' }, [
        el('strong', { text: tag.name }),
        el('span', { class: 'row-actions' }, [rename, remove]),
      ])
    })

    body.append(el('div', { class: 'stack' }, rows))
  } catch (error) {
    clear(body)
    body.append(el('p', { class: 'error-note', text: message(error) }))
  }
}

// MARK: Activity

async function renderActivity(body: HTMLElement, redraw: () => void): Promise<void> {
  clear(body)
  body.append(spinner('Loading activity'))

  try {
    const { notifications, unread } = await api.notifications()
    clear(body)

    const markAll = button('Mark all read', () =>
      void busy(markAll, async () => {
        try {
          await api.markNotificationsRead()
          emit('notifications')
          redraw()
        } catch (error) {
          toast(message(error), 'error')
        }
      }),
    'ghost')

    body.append(sectionHead('Activity', unread ? `${unread} unread` : 'All caught up', markAll))

    if (notifications.length === 0) {
      body.append(empty('Nothing has happened on your shared lists yet.'))
      return
    }

    body.append(
      el(
        'div',
        { class: 'stack' },
        notifications.map((item) =>
          el('div', { class: `notice${item.readAt ? '' : ' unread'}` }, [
            el('p', { text: describeNotification(item) }),
            el('p', { class: 'muted small', text: new Date(item.createdAt).toLocaleString() }),
          ]),
        ),
      ),
    )
  } catch (error) {
    clear(body)
    body.append(el('p', { class: 'error-note', text: message(error) }))
  }
}

function describeNotification(item: {
  kind: string
  actor: { displayName: string | null; handle: string }
  listName: string | null
  titleName: string | null
}): string {
  const who = item.actor.displayName ?? `@${item.actor.handle}`
  const list = item.listName ?? 'a list'
  const title = item.titleName ?? 'something'
  switch (item.kind) {
    case 'list_item_added':
      return `${who} added ${title} to ${list}`
    case 'list_item_removed':
      return `${who} removed ${title} from ${list}`
    case 'list_member_added':
      return `${who} added you to ${list}`
    case 'list_item_voted':
      return `${who} voted on ${title} in ${list}`
    default:
      return `${who} did something on ${list}`
  }
}

// MARK: Account

function renderAccount(body: HTMLElement): void {
  clear(body)
  const user = api.currentUser()
  if (!user) return

  const displayName = input('text', { value: user.displayName ?? '', maxlength: 60 })
  const handle = input('text', { value: user.handle, maxlength: 30 })

  const save = button('Save profile', () =>
    void busy(save, async () => {
      try {
        await api.updateMe({
          displayName: displayName.value.trim(),
          handle: handle.value.trim().toLowerCase(),
        })
        emit('profile')
        toast('Profile saved')
      } catch (error) {
        toast(message(error), 'error')
      }
    }),
  'primary')

  const exportButton = button('Export library', () =>
    void busy(exportButton, async () => {
      try {
        const data = await api.exportLibrary()
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const link = el('a', { href: url, download: 'movietracker-library.json' })
        document.body.append(link)
        link.click()
        link.remove()
        URL.revokeObjectURL(url)
        toast('Library downloaded')
      } catch (error) {
        toast(message(error), 'error')
      }
    }),
  'ghost')

  const refreshApp = button('Refresh app files', () =>
    void busy(refreshApp, async () => {
      const keys = await caches.keys()
      await Promise.all(keys.map((key) => caches.delete(key)))
      const registrations = await navigator.serviceWorker?.getRegistrations()
      await Promise.all((registrations ?? []).map((registration) => registration.unregister()))
      location.reload()
    }),
  'ghost')

  const signOut = button('Sign out', () =>
    void busy(signOut, async () => {
      if (!(await confirmModal({
        title: 'Sign out',
        message: 'Sign out on this device? Your other devices stay signed in.',
        confirmLabel: 'Sign out',
      }))) {
        return
      }
      await api.logout()
      library.forget()
      location.reload()
    }),
  'ghost danger')

  body.append(
    el('div', { class: 'form' }, [
      field('Display name', displayName),
      field('Handle', handle, 'Lowercase letters, numbers and underscores. People invite you by this.'),
      el('p', { class: 'muted', text: user.email ? `Signed in as ${user.email}` : 'Signed in' }),
      el('div', { class: 'row-actions' }, [save]),
    ]),
    sectionHead('Your data'),
    el('div', { class: 'row-actions' }, [exportButton]),
    sectionHead('App'),
    el('p', { class: 'muted', text: `Version ${APP_VERSION} · API ${api.apiBase()}` }),
    el('div', { class: 'row-actions' }, [refreshApp, signOut]),
  )
}
