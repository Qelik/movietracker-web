/**
 * Diary: what you watched, newest first, in month groups.
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
import type { DiaryEntry, Rating } from '../types.js'

type Filter = 'all' | 'movie' | 'tv'

const PAGE = 60
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
        ],
        filter,
        (value) => {
          filter = value
          shownCount = PAGE
          draw()
        },
      ),
    )
    void load(body, draw)
  }

  draw()
  return on('library', () => void load(body, draw))
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
