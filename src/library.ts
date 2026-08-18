/**
 * A small read-through cache of the user's own library.
 *
 * The film sheet needs to know whether a title is on the watchlist, what you
 * rated it and when you watched it — three questions the API answers only for
 * the whole library at once. Fetching all three per poster tap would be absurd,
 * so they are loaded once and invalidated whenever a write says they changed.
 */
import * as api from './api.js'
import { emit } from './store.js'
import type { DiaryEntry, MediaType, Rating, Tag, WatchlistItem } from './types.js'

interface Cached<T> {
  value: T | null
  loading: Promise<T> | null
}

const watchlistCache: Cached<WatchlistItem[]> = { value: null, loading: null }
const diaryCache: Cached<DiaryEntry[]> = { value: null, loading: null }
const ratingsCache: Cached<Rating[]> = { value: null, loading: null }
const tagsCache: Cached<Tag[]> = { value: null, loading: null }

function through<T>(cache: Cached<T>, load: () => Promise<T>): Promise<T> {
  if (cache.value) return Promise.resolve(cache.value)
  if (cache.loading) return cache.loading
  cache.loading = load()
    .then((value) => {
      cache.value = value
      return value
    })
    .finally(() => {
      cache.loading = null
    })
  return cache.loading
}

export const getWatchlist = () => through(watchlistCache, api.watchlist)
export const getDiary = () => through(diaryCache, () => api.diary())
export const getRatings = () => through(ratingsCache, api.ratings)
export const getTags = () => through(tagsCache, api.tags)

/** Everything the library screens show, dropped and re-fetched on next read. */
export function invalidate(
  what: ('watchlist' | 'diary' | 'ratings' | 'tags')[] = ['watchlist', 'diary', 'ratings', 'tags'],
): void {
  if (what.includes('watchlist')) watchlistCache.value = null
  if (what.includes('diary')) diaryCache.value = null
  if (what.includes('ratings')) ratingsCache.value = null
  if (what.includes('tags')) tagsCache.value = null
  emit('library')
}

export function forget(): void {
  watchlistCache.value = null
  diaryCache.value = null
  ratingsCache.value = null
  tagsCache.value = null
}

export function key(mediaType: MediaType, tmdbId: number): string {
  return `${mediaType}:${tmdbId}`
}

export interface TitleState {
  onWatchlist: WatchlistItem | null
  rating: Rating | null
  viewings: DiaryEntry[]
}

export async function stateFor(mediaType: MediaType, tmdbId: number): Promise<TitleState> {
  const [watchlist, ratings, diary] = await Promise.all([getWatchlist(), getRatings(), getDiary()])
  const wanted = key(mediaType, tmdbId)
  return {
    onWatchlist: watchlist.find((item) => key(item.mediaType, item.tmdbId) === wanted) ?? null,
    rating: ratings.find((row) => key(row.mediaType, row.tmdbId) === wanted) ?? null,
    viewings: diary.filter((entry) => key(entry.mediaType, entry.tmdbId) === wanted),
  }
}

/** Watched titles, for the "seen" badge on discovery posters. */
export async function watchedKeys(): Promise<Set<string>> {
  const diary = await getDiary()
  return new Set(diary.map((entry) => key(entry.mediaType, entry.tmdbId)))
}

export async function watchlistKeys(): Promise<Set<string>> {
  const items = await getWatchlist()
  return new Set(items.map((item) => key(item.mediaType, item.tmdbId)))
}
