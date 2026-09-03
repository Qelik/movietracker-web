/**
 * Diary: what you watched, newest first, in month groups — and, under "Coming
 * up", the same screen pointed the other way.
 *
 * The calendar lives here rather than in a tab of its own because it is the
 * same question about the same dates: what have I seen, and what is about to
 * arrive. Two tabs would have put them on opposite sides of the app.
 *
 * Paged in the client rather than the server — /v1/diary answers with the whole
 * range, and the mirror in the iOS app does the same. A month at a time is the
 * unit people actually scroll.
 */
import * as api from '../api.js'
import { chipRow, field, input } from '../components.js'
import { busy, button, clear, confirmModal, el, empty, modal, spinner, toast } from '../dom.js'
import { entryTitle, formatDay, formatMonth, plural, posterUrl, starsFor, today } from '../format.js'
import * as library from '../library.js'
import { on } from '../store.js'
import { openTitle } from '../title.js'
import type { CalendarDay, CalendarEntry, DiaryEntry, Rating } from '../types.js'

type Filter = 'all' | 'movie' | 'tv' | 'coming'

const PAGE = 60
/** How far ahead "Coming up" looks. Two months covers a season of television. */
const CALENDAR_DAYS = 60
let filter: Filter = 'all'
let shownCount = PAGE

export function mount(root: HTMLElement): () => void {
  const controls = el('div', { class: 'stack' })
  const body = el('div')
  root.append(controls, body)

  const draw = () => {
    clear(controls)
    controls.append(
      chipRow(
        [
          { value: 'all' as Filter, label: 'Everything' },
          { value: 'movie' as Filter, label: 'Films' },
          { value: 'tv' as Filter, label: 'Episodes' },
          { value: 'coming' as Filter, label: 'Coming up' },
        ],
        filter,
        (value) => {
          filter = value
          shownCount = PAGE
          draw()
        },
      ),
    )
    if (filter === 'coming') void loadCalendar(body)
    else void load(body, draw)
  }

  draw()
  return on('library', () => {
    if (filter === 'coming') void loadCalendar(body)
    else void load(body, draw)
  })
}

/**
 * "Coming up": watchlisted films yet to be released and unaired episodes of
 * shows you have started, grouped by day.
 *
 * The grouping is the server's, not repeated here: it already had to decide
 * what shares a day in order to know what to notify about.
 */
async function loadCalendar(body: HTMLElement): Promise<void> {
  clear(body)
  body.append(spinner('Looking ahead'))

  let days: CalendarDay[]
  try {
    days = (await api.calendar(CALENDAR_DAYS)).calendar
  } catch (error) {
    clear(body)
    body.append(el('p', { class: 'error-note', text: message(error) }))
    return
  }

  clear(body)
  if (days.length === 0) {
    body.append(
      empty(
        'Nothing on the horizon. Watchlist an unreleased film, or start a show that is still running.',
      ),
    )
    return
  }

  for (const day of days) {
    body.append(
      el('section', { class: 'calendar-day' }, [
        el('h3', { class: 'calendar-date', text: formatDay(day.date) }),
        el('div', { class: 'calendar-rows' }, day.entries.map(calendarRow)),
      ]),
    )
  }
}

function calendarRow(entry: CalendarEntry): HTMLElement {
  const poster = posterUrl(entry.posterPath, 'w185')

  const detail =
    entry.kind === 'episode'
      ? [`S${entry.seasonNumber}E${entry.episodeNumber}`, entry.episodeName]
          .filter(Boolean)
          .join(' · ')
      : 'Released'

  const row = el('button', { class: 'credit-row', type: 'button' }, [
    poster
      ? el('img', { class: 'credit-poster', src: poster, alt: '', loading: 'lazy' })
      : el('div', { class: 'credit-poster placeholder', 'aria-hidden': 'true' }, [
          entry.kind === 'episode' ? '📺' : '🎬',
        ]),
    el('div', { class: 'credit-body' }, [
      el('span', { class: 'credit-title', text: entry.title }),
      el('span', { class: 'muted small', text: detail }),
    ]),
  ])

  row.addEventListener('click', () =>
    openTitle({ mediaType: entry.mediaType, tmdbId: entry.tmdbId, title: entry.title }),
  )
  return row
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong'
}

async function load(body: HTMLElement, redraw: () => void): Promise<void> {
  clear(body)
  body.append(spinner('Loading your diary'))

  try {
    const [entries, ratings] = await Promise.all([library.getDiary(), library.getRatings()])
    const byTitle = new Map(ratings.map((rating) => [library.key(rating.mediaType, rating.tmdbId), rating]))
    const shown = entries.filter((entry) => filter === 'all' || entry.mediaType === filter)

    clear(body)
    if (shown.length === 0) {
      body.append(empty('Nothing logged yet. Watch something, then log it.'))
      return
    }

    const page = shown.slice(0, shownCount)
    body.append(el('p', { class: 'muted count', text: `${plural(shown.length, 'viewing')} logged` }))

    let currentMonth = ''
    let group: HTMLElement | null = null
    for (const entry of page) {
      const month = entry.watchedOn.slice(0, 7)
      if (month !== currentMonth) {
        currentMonth = month
        group = el('ul', { class: 'diary-list' })
        body.append(el('h3', { class: 'month-head', text: formatMonth(entry.watchedOn) }), group)
      }
      group?.append(row(entry, byTitle.get(library.key(entry.mediaType, entry.tmdbId)) ?? null, redraw))
    }

    if (page.length < shown.length) {
      const more = button(`Show ${Math.min(PAGE, shown.length - page.length)} more`, () => {
        shownCount += PAGE
        redraw()
      }, 'ghost')
      body.append(el('div', { class: 'centre' }, [more]))
    }
  } catch (error) {
    clear(body)
    body.append(el('p', { class: 'error-note', text: message(error) }))
  }
}

function row(entry: DiaryEntry, rating: Rating | null, redraw: () => void): HTMLElement {
  const poster = posterUrl(entry.movie?.posterPath ?? null, 'w185')

  const open = () =>
    openTitle({ mediaType: entry.mediaType, tmdbId: entry.tmdbId, title: entry.movie?.title })

  const thumb = el('button', { class: 'diary-thumb', type: 'button', 'aria-label': entryTitle(entry) }, [
    poster
      ? el('img', { src: poster, alt: '', loading: 'lazy' })
      : el('span', { 'aria-hidden': 'true', text: entry.mediaType === 'tv' ? '📺' : '🎬' }),
  ])
  thumb.addEventListener('click', open)

  const edit = button('Edit', () => openEdit(entry, redraw), 'ghost small')
  const remove = button('Delete', () =>
    void busy(remove, async () => {
      if (!(await confirmModal({
        title: 'Delete viewing',
        message: `Remove ${entryTitle(entry)} from ${formatDay(entry.watchedOn)}?`,
        confirmLabel: 'Delete',
        destructive: true,
      }))) {
        return
      }
      try {
        await api.deleteViewing(entry.id)
        library.invalidate(['diary'])
        redraw()
        toast('Viewing deleted')
      } catch (error) {
        toast(message(error), 'error')
      }
    }),
  'ghost small danger')

  const title = el('button', { class: 'link-button', type: 'button', text: entryTitle(entry) })
  title.addEventListener('click', open)

  return el('li', { class: 'diary-row' }, [
    thumb,
    el('div', { class: 'diary-main' }, [
      title,
      el('p', { class: 'muted' }, [
        formatDay(entry.watchedOn),
        entry.isRewatch ? el('span', { class: 'pill small', text: 'Rewatch' }) : null,
        rating ? el('span', { class: 'score', text: starsFor(rating.score) }) : null,
      ]),
    ]),
    el('div', { class: 'row-actions' }, [edit, remove]),
  ])
}

function openEdit(entry: DiaryEntry, redraw: () => void): void {
  const date = input('date', { value: entry.watchedOn, max: today() })
  const rewatch = input('checkbox')
  rewatch.checked = entry.isRewatch

  const save = button('Save', () =>
    void busy(save, async () => {
      try {
        await api.updateViewing(entry.id, { watchedOn: date.value, isRewatch: rewatch.checked })
        library.invalidate(['diary'])
        redraw()
        close()
        toast('Viewing updated')
      } catch (error) {
        toast(message(error), 'error')
      }
    }),
  'primary')

  const close = modal({
    title: entryTitle(entry),
    body: el('div', { class: 'form' }, [
      field('Watched on', date),
      el('label', { class: 'check' }, [rewatch, el('span', { text: 'This was a rewatch' })]),
    ]),
    actions: [button('Cancel', () => close()), save],
  })
}
