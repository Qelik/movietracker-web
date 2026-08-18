/** Watchlist: what you mean to watch, ordered by how much you mean it. */
import * as api from '../api.js'
import { chipRow, field, input, posterCard, select } from '../components.js'
import { add, busy, button, clear, confirmModal, el, empty, modal, spinner, toast } from '../dom.js'
import { plural, today } from '../format.js'
import * as library from '../library.js'
import { on } from '../store.js'
import { openTitle } from '../title.js'
import type { WatchlistItem } from '../types.js'

type Filter = 'all' | 'movie' | 'tv' | 'next'

const PRIORITIES = ['Someday', 'High', 'Next up']

let filter: Filter = 'all'

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
          { value: 'tv' as Filter, label: 'Shows' },
          { value: 'next' as Filter, label: 'Next up' },
        ],
        filter,
        (value) => {
          filter = value
          draw()
        },
      ),
    )
    void load(body, draw)
  }

  draw()
  return on('library', () => void load(body, draw))
}

async function load(body: HTMLElement, redraw: () => void): Promise<void> {
  clear(body)
  body.append(spinner('Loading your watchlist'))

  try {
    const items = await library.getWatchlist()
    const shown = items.filter((item) => {
      if (filter === 'all') return true
      if (filter === 'next') return item.priority === 2
      return item.mediaType === filter
    })

    clear(body)
    if (shown.length === 0) {
      body.append(
        empty(
          items.length === 0
            ? 'Your watchlist is empty. Find something on Discover and add it.'
            : 'Nothing under that filter.',
        ),
      )
      return
    }

    body.append(
      el('p', { class: 'muted count', text: plural(shown.length, 'title') }),
      el('div', { class: 'poster-grid' }, shown.map((item) => card(item, redraw))),
    )
  } catch (error) {
    clear(body)
    body.append(el('p', { class: 'error-note', text: message(error) }))
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong'
}

function card(item: WatchlistItem, redraw: () => void): HTMLElement {
  const movie = item.movie
  const holder = el('div', { class: 'wl-card' })

  if (movie) {
    holder.append(posterCard(movie, openTitle, item.priority === 2 ? 'Next up' : null))
  } else {
    holder.append(el('div', { class: 'poster-card' }, [el('span', { text: `#${item.tmdbId}` })]))
  }

  const log = button('Log', () =>
    void busy(log, async () => {
      if (item.mediaType === 'tv') {
        // A show needs an episode, which the sheet asks for.
        openTitle({ mediaType: item.mediaType, tmdbId: item.tmdbId, title: movie?.title })
        return
      }
      try {
        await api.logViewing({ mediaType: 'movie', tmdbId: item.tmdbId, watchedOn: today() })
        await api.removeFromWatchlist(item.mediaType, item.tmdbId)
        library.invalidate(['diary', 'watchlist'])
        toast(`Logged ${movie?.title ?? 'it'} and cleared it from your watchlist`)
        redraw()
      } catch (error) {
        toast(message(error), 'error')
      }
    }),
  'ghost small')

  const edit = button('Edit', () => openEdit(item, redraw), 'ghost small')

  const remove = button('Remove', () =>
    void busy(remove, async () => {
      if (!(await confirmModal({
        title: 'Remove from watchlist',
        message: `Take ${movie?.title ?? 'this title'} off your watchlist?`,
        confirmLabel: 'Remove',
        destructive: true,
      }))) {
        return
      }
      try {
        await api.removeFromWatchlist(item.mediaType, item.tmdbId)
        library.invalidate(['watchlist'])
        redraw()
      } catch (error) {
        toast(message(error), 'error')
      }
    }),
  'ghost small danger')

  add(
    holder,
    item.note ? el('p', { class: 'wl-note', text: item.note }) : null,
    el('div', { class: 'row-actions' }, [log, edit, remove]),
  )
  return holder
}

function openEdit(item: WatchlistItem, redraw: () => void): void {
  const note = input('text', { value: item.note ?? '', maxlength: 500, placeholder: 'Why this one?' })
  const priority = select(
    PRIORITIES.map((label, index) => ({ value: String(index), label })),
    String(item.priority),
  )

  const save = button('Save', () =>
    void busy(save, async () => {
      try {
        await api.updateWatchlist(item.mediaType, item.tmdbId, {
          note: note.value.trim() || null,
          priority: Number(priority.value),
        })
        library.invalidate(['watchlist'])
        redraw()
        close()
      } catch (error) {
        toast(message(error), 'error')
      }
    }),
  'primary')

  const close = modal({
    title: item.movie?.title ?? 'Watchlist item',
    body: el('div', { class: 'form' }, [field('Note', note), field('Priority', priority)]),
    actions: [button('Cancel', () => close()), save],
  })
}
