/**
 * The series sheet: every film in a collection, and how many you have seen.
 *
 * Opened from the film that belongs to it, which is where the question comes
 * up — "have I seen the rest of these" — and where the answer used to be a
 * mental note.
 */
import * as api from './api.js'
import { sectionHead } from './components.js'
import { clear, el, modal, spinner } from './dom.js'
import { plural, posterUrl, scoreLabel } from './format.js'
import { openTitle } from './title.js'
import type { CollectionPage, CollectionPart } from './types.js'

export function openCollection(tmdbId: number, name?: string): void {
  const body = el('div', { class: 'person-sheet' }, [spinner('Loading')])
  modal({ title: name ?? 'Series', body, wide: true })
  void render(body, tmdbId)
}

async function render(body: HTMLElement, tmdbId: number): Promise<void> {
  let page: CollectionPage
  try {
    page = await api.collection(tmdbId)
  } catch (error) {
    clear(body)
    body.append(
      el('p', {
        class: 'error-note',
        text: error instanceof Error ? error.message : 'Something went wrong',
      }),
    )
    return
  }

  clear(body)
  const poster = posterUrl(page.collection.posterPath, 'w185')

  body.append(
    el('div', { class: 'person-head' }, [
      poster
        ? el('img', { class: 'person-portrait', src: poster, alt: '', loading: 'lazy' })
        : el('div', { class: 'person-portrait placeholder', 'aria-hidden': 'true' }, ['🎬']),
      el('div', { class: 'person-text' }, [
        el('h2', { text: page.collection.name }),
        el('p', { class: 'seen-line', text: seenLine(page.seen) }),
        page.collection.overview
          ? el('p', { class: 'overview clamp', text: page.collection.overview })
          : null,
      ]),
    ]),
    el('section', { class: 'sheet-block' }, [
      sectionHead('Films', plural(page.parts.length, 'film')),
      el('div', { class: 'credit-list' }, page.parts.map(partRow)),
    ]),
  )
}

/**
 * "3 of 4" — the sentence the whole screen exists for.
 *
 * Counted over films rather than viewings: watching The Godfather three times
 * has not got you through the trilogy.
 */
function seenLine(seen: { watched: number; total: number }): string {
  if (seen.total === 0) return 'No films listed for this series.'
  if (seen.watched === seen.total) return `You have seen all ${seen.total}.`
  return `You have seen ${seen.watched} of ${seen.total}.`
}

function partRow(part: CollectionPart): HTMLElement {
  const poster = posterUrl(part.posterPath, 'w185')

  const marks = el('div', { class: 'credit-marks' }, [
    part.viewings > 0
      ? el('span', {
          class: 'pill good',
          text: part.viewings > 1 ? `Watched ×${part.viewings}` : 'Watched',
        })
      : null,
    part.score !== null ? el('span', { class: 'pill', text: scoreLabel(part.score) }) : null,
    part.onWatchlist && part.viewings === 0
      ? el('span', { class: 'pill', text: 'On watchlist' })
      : null,
  ])

  const row = el('button', { class: 'credit-row', type: 'button' }, [
    poster
      ? el('img', { class: 'credit-poster', src: poster, alt: '', loading: 'lazy' })
      : el('div', { class: 'credit-poster placeholder', 'aria-hidden': 'true' }, ['🎬']),
    el('div', { class: 'credit-body' }, [
      el('span', { class: 'credit-title', text: part.title }),
      part.releaseYear
        ? el('span', { class: 'muted small', text: String(part.releaseYear) })
        : null,
      marks,
    ]),
  ])

  row.addEventListener('click', () => openTitle(part))
  return row
}
