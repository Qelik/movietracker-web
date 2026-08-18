/**
 * Discover: For You, Trending, Popular and genre browsing, plus search.
 *
 * Search is not a tab of its own — it takes over the results area from the
 * header's search box, the same way the iOS app presents it over whatever you
 * were looking at.
 */
import * as api from '../api.js'
import { chipRow, posterGrid, sectionHead } from '../components.js'
import { button, clear, el, empty, spinner, toast } from '../dom.js'
import * as library from '../library.js'
import { on } from '../store.js'
import { openTitle } from '../title.js'
import type { Genre, MovieSummary } from '../types.js'

type Rail = 'for-you' | 'trending' | 'popular' | 'genres'
type Media = 'all' | 'movie' | 'tv'

let rail: Rail = 'for-you'
let media: Media = 'all'
let genreId: number | null = null
let genreCache: Genre[] | null = null

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
        ],
        rail,
        (value) => {
          rail = value
          draw()
        },
      ),
      chipRow(
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

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong'
}

async function load(results: HTMLElement): Promise<void> {
  clear(results)
  results.append(spinner('Loading'))

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
