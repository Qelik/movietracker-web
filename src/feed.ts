/**
 * The feed: what the people you follow have been watching.
 *
 * Only accounts that have opted in appear. Following somebody private is
 * allowed and contributes nothing, which is why an empty feed says how many of
 * the people you follow are actually sharing rather than implying nobody has
 * watched anything.
 */
import * as api from './api.js'
import { clear, el, empty, spinner } from './dom.js'
import { formatDay, posterUrl, scoreLabel } from './format.js'
import { openProfile } from './people.js'
import { openTitle } from './title.js'
import type { FeedItem } from './types.js'

export async function renderFeed(body: HTMLElement): Promise<void> {
  clear(body)
  body.append(spinner('Loading'))

  let page: { items: FeedItem[]; sharingCount: number }
  try {
    page = await api.feed()
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

  if (page.items.length === 0) {
    body.append(
      empty(
        page.sharingCount === 0
          ? 'Nobody you follow is sharing what they watch. Find someone by their handle, or ask them to switch sharing on.'
          : 'Nothing new from the people you follow.',
      ),
    )
    return
  }

  body.append(el('div', { class: 'credit-list' }, page.items.map((item) => feedRow(item, true))))
}

/**
 * One row.
 *
 * `withAuthor` is false on somebody's own profile, where repeating their name
 * on every line says nothing.
 */
export function feedRow(item: FeedItem, withAuthor: boolean): HTMLElement {
  const poster = posterUrl(item.movie?.posterPath ?? null, 'w185')
  const title = item.movie?.title ?? 'Something'
  const who = item.user.displayName?.trim() || `@${item.user.handle}`

  const line =
    item.kind === 'rated'
      ? `${scoreLabel(item.score ?? 0)}${item.isRewatch ? ' · rewatch' : ''}`
      : `${item.watchedOn ? formatDay(item.watchedOn) : 'Watched'}${item.isRewatch ? ' · rewatch' : ''}`

  const body = el('div', { class: 'credit-body' }, [
    el('span', { class: 'credit-title', text: title }),
    el('span', { class: 'muted small', text: line }),
    item.review ? el('span', { class: 'muted small review-line', text: item.review }) : null,
  ])

  if (withAuthor) {
    const author = el('button', { class: 'link-button small', type: 'button', text: who })
    author.addEventListener('click', (event) => {
      // The row itself opens the title, so the name has to keep its own tap.
      event.stopPropagation()
      openProfile(item.user.handle)
    })
    body.prepend(author)
  }

  const row = el('button', { class: 'credit-row', type: 'button' }, [
    poster
      ? el('img', { class: 'credit-poster', src: poster, alt: '', loading: 'lazy' })
      : el('div', { class: 'credit-poster placeholder', 'aria-hidden': 'true' }, ['🎬']),
    body,
  ])

  row.addEventListener('click', () =>
    openTitle({ mediaType: item.mediaType, tmdbId: item.tmdbId, title }),
  )
  return row
}
