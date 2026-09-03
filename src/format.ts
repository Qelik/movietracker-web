/** Presentation-only helpers: dates, runtimes, stars, poster URLs. */
import type { DiaryEntry, MediaType, MovieSummary } from './types.js'

const POSTER_BASE = 'https://image.tmdb.org/t/p'

export function posterUrl(path: string | null, size: 'w185' | 'w342' | 'w500' = 'w342'): string | null {
  return path ? `${POSTER_BASE}/${size}${path}` : null
}

export function backdropUrl(path: string | null): string | null {
  return path ? `${POSTER_BASE}/w780${path}` : null
}

/**
 * Provider logos, which come from the same image host but in their own sizes —
 * w92 is the smallest square TMDB publishes and the only one a chip needs.
 */
export function logoUrl(path: string | null): string | null {
  return path ? `${POSTER_BASE}/w92${path}` : null
}

/**
 * A country code as a reader's own language names it: "GB" becomes "United
 * Kingdom" in English, "Royaume-Uni" in French.
 *
 * Falls back to the bare code, which is not a failure state — every region the
 * server can store is a valid ISO code, and an older browser without
 * DisplayNames still shows something true.
 */
export function regionName(region: string): string {
  try {
    const names = new Intl.DisplayNames(undefined, { type: 'region' })
    return names.of(region.toUpperCase()) ?? region.toUpperCase()
  } catch {
    return region.toUpperCase()
  }
}

/** Today in the browser's timezone — not UTC, which is yesterday for half the day. */
export function today(): string {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

const LONG_DATE = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

const MONTH_YEAR = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })

/** "YYYY-MM-DD" parsed as a local date; `new Date(iso)` would shift the day. */
export function parseDay(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1)
}

export function formatDay(iso: string): string {
  const day = parseDay(iso)
  const now = today()
  if (iso === now) return 'Today'
  const yesterday = new Date(parseDay(now).getTime() - 86_400_000)
  if (day.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return LONG_DATE.format(day)
}

export function formatMonth(iso: string): string {
  return MONTH_YEAR.format(parseDay(`${iso.slice(0, 7)}-01`))
}

export function formatRuntime(minutes: number | null): string | null {
  if (!minutes || minutes <= 0) return null
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest}m`
  if (rest === 0) return `${hours}h`
  return `${hours}h ${rest}m`
}

/** Scores are 1-10 in half-star units, so 7 is three and a half stars. */
export function starsFor(score: number): string {
  const full = Math.floor(score / 2)
  const half = score % 2 === 1
  return '★'.repeat(full) + (half ? '½' : '')
}

export function scoreLabel(score: number): string {
  return `${score / 2} out of 5`
}

export function mediaLabel(mediaType: MediaType): string {
  return mediaType === 'tv' ? 'Show' : 'Film'
}

/** "The Bear · S2E4" — one string, because two Texts wrap independently. */
export function entryTitle(entry: DiaryEntry): string {
  const name = entry.movie?.title ?? 'Unknown title'
  if (entry.mediaType !== 'tv' || entry.seasonNumber === null || entry.episodeNumber === null) {
    return name
  }
  return `${name} · S${entry.seasonNumber}E${entry.episodeNumber}`
}

export function subtitleFor(movie: MovieSummary | null): string {
  if (!movie) return ''
  const parts: string[] = []
  if (movie.releaseYear) parts.push(String(movie.releaseYear))
  if (movie.mediaType === 'tv') parts.push('Show')
  const genre = movie.genres[0]?.name
  if (genre) parts.push(genre)
  return parts.join(' · ')
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}
