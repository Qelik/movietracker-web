/**
 * Discover: For You, Trending, Popular and genre browsing, plus search.
 *
 * Search is not a tab of its own — it takes over the results area from the
 * header's search box, the same way the iOS app presents it over whatever you
 * were looking at.
 */
import * as api from '../api.js'
import { chipRow, field, input, posterGrid, sectionHead, select } from '../components.js'
import { button, clear, el, empty, spinner, toast } from '../dom.js'
import { plural } from '../format.js'
import * as library from '../library.js'
import { on } from '../store.js'
import { openTitle } from '../title.js'
import type { BrowseFilters, BrowseResult, Genre, MovieSummary } from '../types.js'

type Rail = 'for-you' | 'trending' | 'popular' | 'genres' | 'browse'
type Media = 'all' | 'movie' | 'tv'

let rail: Rail = 'for-you'
let media: Media = 'all'
let genreId: number | null = null
let genreCache: Genre[] | null = null

/**
 * The browse filters, held across redraws so tightening one does not reset the
 * rest. Films by default: TMDB's runtime and release filters are film-shaped,
 * and a show's "runtime" is per episode and not comparable.
 */
const filters: BrowseFilters = {
  media: 'movie',
  genres: [],
  providers: [],
  fromYear: null,
  toYear: null,
  minRuntime: null,
  maxRuntime: null,
  minRating: null,
  sort: 'popular',
  hideWatched: false,
  page: 1,
}

export function mount(root: HTMLElement): () => void {
  const controls = el('div', { class: 'stack' })
  const results = el('div', { class: 'results' })
  root.append(controls, results)

  const draw = () => {
    clear(controls)
    controls.append(
      chipRow(
        [
          { value: 'for-you' as Rail, label: 'For you' },
          { value: 'trending' as Rail, label: 'Trending' },
          { value: 'popular' as Rail, label: 'Popular' },
          { value: 'genres' as Rail, label: 'Genres' },
          { value: 'browse' as Rail, label: 'Filter' },
        ],
        rail,
        (value) => {
          rail = value
          draw()
        },
      ),
      // "Everything" is not offered under Filter: TMDB's discover endpoint is
      // one medium at a time, and a tab that silently ignored the choice would
      // be worse than not offering it.
      rail === 'browse'
        ? chipRow(
            [
              { value: 'movie' as 'movie' | 'tv', label: 'Films' },
              { value: 'tv' as 'movie' | 'tv', label: 'Shows' },
            ],
            filters.media,
            (value) => {
              filters.media = value
              filters.page = 1
              draw()
            },
            'secondary',
          )
        : chipRow(
            [
              { value: 'all' as Media, label: 'Everything' },
              { value: 'movie' as Media, label: 'Films' },
              { value: 'tv' as Media, label: 'Shows' },
            ],
            media,
            (value) => {
              media = value
              draw()
            },
            'secondary',
          ),
    )
    if (rail === 'genres') controls.append(genrePicker(draw))
    if (rail === 'browse') controls.append(filterPanel(draw))
    void load(results)
  }

  draw()
  return on('library', () => void load(results))
}

function genrePicker(redraw: () => void): HTMLElement {
  const holder = el('div', { class: 'chip-row wrap' })

  const paint = (genres: Genre[]) => {
    clear(holder)
    holder.append(
      chipRow(
        genres.map((genre) => ({ value: genre.id, label: genre.name })),
        genreId ?? genres[0]?.id ?? 0,
        (value) => {
          genreId = value
          redraw()
        },
        'wrap',
      ),
    )
  }

  if (genreCache) {
    paint(genreCache)
  } else {
    holder.append(spinner('Loading genres'))
    void api
      .genres()
      .then((genres) => {
        genreCache = genres
        genreId ??= genres[0]?.id ?? null
        paint(genres)
        redraw()
      })
      .catch((error: unknown) => {
        clear(holder)
        holder.append(el('p', { class: 'error-note', text: message(error) }))
      })
  }

  return holder
}

/**
 * The filter panel: genre, decade, runtime, rating, order.
 *
 * Rebuilt on every draw rather than kept alive and mutated. The panel is a
 * dozen small controls whose visibility depends on the medium, and re-reading
 * them from one object is far easier to keep honest than synchronising each
 * one by hand.
 */
function filterPanel(redraw: () => void): HTMLElement {
  const panel = el('details', { class: 'filter-panel', open: true }, [
    el('summary', { text: summarise() }),
  ])

  const rerun = () => {
    // Any change starts the results again from the top: page four of the old
    // filters says nothing about the new ones.
    filters.page = 1
    redraw()
  }

  const sort = select(
    [
      { value: 'popular', label: 'Most popular' },
      { value: 'rating', label: 'Highest rated' },
      { value: 'newest', label: 'Newest first' },
      { value: 'oldest', label: 'Oldest first' },
    ],
    filters.sort,
  )
  sort.addEventListener('change', () => {
    filters.sort = sort.value as BrowseFilters['sort']
    rerun()
  })

  const fromYear = numberBox(filters.fromYear, 'Any', (value) => {
    filters.fromYear = value
    rerun()
  })
  const toYear = numberBox(filters.toYear, 'Any', (value) => {
    filters.toYear = value
    rerun()
  })
  const maxRuntime = numberBox(filters.maxRuntime, 'Any', (value) => {
    filters.maxRuntime = value
    rerun()
  })
  const minRating = numberBox(filters.minRating, 'Any', (value) => {
    filters.minRating = value
    rerun()
  })

  const hideWatched = el('input', { type: 'checkbox' }) as HTMLInputElement
  hideWatched.checked = filters.hideWatched
  hideWatched.addEventListener('change', () => {
    filters.hideWatched = hideWatched.checked
    rerun()
  })

  const clearAll = button(
    'Clear filters',
    () => {
      filters.genres = []
      filters.fromYear = null
      filters.toYear = null
      filters.minRuntime = null
      filters.maxRuntime = null
      filters.minRating = null
      filters.hideWatched = false
      filters.sort = 'popular'
      rerun()
    },
    'ghost small',
  )

  panel.append(
    el('div', { class: 'filter-grid' }, [
      field('Order', sort),
      field('From year', fromYear),
      field('To year', toYear),
      // Films only: a show's runtime is per episode, so "under 100 minutes"
      // would quietly mean something else.
      filters.media === 'movie' ? field('Max runtime (min)', maxRuntime) : null,
      field('Min TMDB score', minRating),
    ]),
    genreFilterChips(rerun),
    el('label', { class: 'checkline' }, [hideWatched, el('span', { text: 'Hide what I have seen' })]),
    el('div', { class: 'row-actions' }, [clearAll]),
  )

  return panel
}

function numberBox(
  value: number | null,
  placeholder: string,
  onChange: (value: number | null) => void,
): HTMLInputElement {
  const box = input('number', { value: value === null ? '' : String(value), placeholder })
  box.addEventListener('change', () => {
    const parsed = Number.parseFloat(box.value)
    // An empty or unparseable box means "no filter", not zero. Zero is a real
    // value for a minimum score and would silently narrow nothing.
    onChange(box.value.trim() === '' || !Number.isFinite(parsed) ? null : parsed)
  })
  return box
}

/** Multi-select genre chips: picking two means both, not either. */
function genreFilterChips(rerun: () => void): HTMLElement {
  const holder = el('div', { class: 'chip-row wrap' })

  const paint = (genres: Genre[]) => {
    clear(holder)
    for (const genre of genres) {
      const active = filters.genres.includes(genre.id)
      const chip = el('button', {
        class: active ? 'chip active' : 'chip',
        type: 'button',
        text: genre.name,
        'aria-pressed': active ? 'true' : 'false',
      })
      chip.addEventListener('click', () => {
        filters.genres = active
          ? filters.genres.filter((id) => id !== genre.id)
          : [...filters.genres, genre.id]
        rerun()
      })
      holder.append(chip)
    }
  }

  if (genreCache) {
    paint(genreCache)
  } else {
    holder.append(spinner('Loading genres'))
    void api
      .genres()
      .then((genres) => {
        genreCache = genres
        paint(genres)
      })
      .catch(() => clear(holder))
  }

  return holder
}

/** What the collapsed panel says it is doing. */
function summarise(): string {
  const parts: string[] = []
  if (filters.genres.length) parts.push(plural(filters.genres.length, 'genre'))
  if (filters.fromYear || filters.toYear) {
    parts.push(`${filters.fromYear ?? 'any'}–${filters.toYear ?? 'now'}`)
  }
  if (filters.maxRuntime) parts.push(`under ${filters.maxRuntime}m`)
  if (filters.minRating) parts.push(`${filters.minRating}+`)
  if (filters.hideWatched) parts.push('unseen only')
  return parts.length === 0 ? 'Filters' : `Filters — ${parts.join(', ')}`
}

/**
 * The filtered shelf.
 *
 * Its own loader rather than a branch inside `load`, because the response is a
 * different shape: it comes paged, it carries each title's history, and it
 * reports how many rows it hid.
 */
async function loadBrowse(results: HTMLElement): Promise<void> {
  let page: Awaited<ReturnType<typeof api.browse>>
  try {
    page = await api.browse(filters)
  } catch (error) {
    clear(results)
    results.append(el('p', { class: 'error-note', text: message(error) }))
    return
  }

  clear(results)

  if (page.results.length === 0) {
    results.append(
      empty(
        page.hidden > 0
          ? `Everything on this page is already in your diary. ${plural(page.hidden, 'title')} hidden.`
          : 'Nothing matches those filters. Try widening the years or dropping a genre.',
      ),
    )
    results.append(pager(page.page, page.totalPages, results))
    return
  }

  results.append(
    el('p', {
      class: 'muted count',
      // The total is TMDB's, before anything was hidden — saying "1,204
      // results" and showing four would be a different kind of lie than saying
      // how many this page dropped.
      text:
        page.hidden > 0
          ? `${page.totalResults.toLocaleString()} matches · ${plural(page.hidden, 'seen title')} hidden on this page`
          : `${page.totalResults.toLocaleString()} matches`,
    }),
    posterGrid(page.results, openTitle, badgeFor),
    pager(page.page, page.totalPages, results),
  )
}

/** The badge on a browse result, which already knows its own history. */
function badgeFor(movie: MovieSummary): string | null {
  const result = movie as BrowseResult
  if (result.viewings > 0) return 'Seen'
  if (result.onWatchlist) return 'Listed'
  return null
}

function pager(current: number, total: number, results: HTMLElement): HTMLElement {
  // TMDB refuses page numbers above 500 whatever the total claims, so the pager
  // stops where the API does rather than offering a page that 400s.
  const last = Math.min(total, 500)
  const row = el('div', { class: 'row-actions pager' })

  if (current > 1) {
    row.append(
      button(
        '← Previous',
        () => {
          filters.page = current - 1
          window.scrollTo({ top: 0 })
          void load(results)
        },
        'ghost small',
      ),
    )
  }

  if (last > 1) {
    row.append(el('span', { class: 'muted small', text: `Page ${current} of ${last}` }))
  }

  if (current < last) {
    row.append(
      button(
        'Next →',
        () => {
          filters.page = current + 1
          window.scrollTo({ top: 0 })
          void load(results)
        },
        'ghost small',
      ),
    )
  }

  return row
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong'
}

async function load(results: HTMLElement): Promise<void> {
  clear(results)
  results.append(spinner('Loading'))

  if (rail === 'browse') {
    await loadBrowse(results)
    return
  }

  try {
    let movies: MovieSummary[] = []
    let note: string | null = null

    if (rail === 'for-you') {
      const response = await api.forYou(media)
      movies = response.results
      note = response.reason
    } else if (rail === 'trending') {
      movies = await api.trending(media)
    } else if (rail === 'popular') {
      movies = await api.popular(media)
    } else if (genreId !== null) {
      movies = await api.byGenre(genreId, media)
    }

    const [watched, queued] = await Promise.all([library.watchedKeys(), library.watchlistKeys()])
    clear(results)
    if (note) results.append(sectionHead(headingFor(), note))
    if (movies.length === 0) {
      results.append(empty('Nothing here yet.'))
      return
    }
    results.append(
      posterGrid(movies, openTitle, (movie) => {
        const key = library.key(movie.mediaType, movie.tmdbId)
        if (watched.has(key)) return 'Seen'
        if (queued.has(key)) return 'Queued'
        return null
      }),
    )
  } catch (error) {
    clear(results)
    results.append(el('p', { class: 'error-note', text: message(error) }))
  }
}

function headingFor(): string {
  if (rail === 'for-you') return 'For you'
  if (rail === 'trending') return 'Trending'
  if (rail === 'popular') return 'Popular'
  return 'By genre'
}

/** The header search box renders into the Discover view. */
export function mountSearch(root: HTMLElement, query: string): () => void {
  const results = el('div', { class: 'results' })
  root.append(
    sectionHead(`Results for “${query}”`, null, button('Clear search', () => {
      window.dispatchEvent(new CustomEvent('mt:clear-search'))
    })),
    results,
  )

  const controller = new AbortController()
  results.append(spinner('Searching'))

  void (async () => {
    try {
      const [page, watched, queued] = await Promise.all([
        api.search(query, 1, controller.signal),
        library.watchedKeys(),
        library.watchlistKeys(),
      ])
      clear(results)
      if (page.results.length === 0) {
        results.append(empty(`Nothing matched “${query}”.`))
        return
      }
      results.append(
        posterGrid(page.results, openTitle, (movie) => {
          const key = library.key(movie.mediaType, movie.tmdbId)
          if (watched.has(key)) return 'Seen'
          if (queued.has(key)) return 'Queued'
          return null
        }),
      )

      if (page.totalPages > 1) {
        let page_ = 1
        const more = button('Load more', () => {
          page_ += 1
          more.disabled = true
          void api
            .search(query, page_)
            .then((next) => {
              results.append(posterGrid(next.results, openTitle))
              more.disabled = page_ >= next.totalPages
            })
            .catch((error: unknown) => toast(message(error), 'error'))
        }, 'ghost')
        root.append(el('div', { class: 'centre' }, [more]))
      }
    } catch (error) {
      if (controller.signal.aborted) return
      clear(results)
      results.append(el('p', { class: 'error-note', text: message(error) }))
    }
  })()

  return () => controller.abort()
}
