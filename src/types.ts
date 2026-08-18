/**
 * The shapes the API actually sends. Kept hand-written rather than generated:
 * the server is the source of truth, and a mismatch here should be a compile
 * error in one place instead of a runtime surprise in ten.
 */

export type MediaType = 'movie' | 'tv'

export interface Genre {
  id: number
  name: string
}

export interface MovieSummary {
  mediaType: MediaType
  tmdbId: number
  title: string
  releaseYear: number | null
  releaseDate: string | null
  posterPath: string | null
  overview: string | null
  genres: Genre[]
}

export interface SeasonSummary {
  seasonNumber: number
  name: string
  episodeCount: number
  airDate: string | null
}

export interface EpisodeSummary {
  seasonNumber: number
  episodeNumber: number
  name: string
  airDate: string | null
  runtimeMinutes: number | null
  stillPath: string | null
}

export interface MovieDetail extends MovieSummary {
  runtimeMinutes: number | null
  backdropPath: string | null
  directors: { id: number; name: string }[]
  topCast: { id: number; name: string; character: string | null }[]
  seasonCount: number | null
  episodeCount: number | null
  seriesStatus: string | null
  seasons: SeasonSummary[]
}

export interface PublicUser {
  id: string
  email: string | null
  handle: string
  displayName: string | null
  avatarUrl: string | null
  createdAt: string
}

export interface TokenPair {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

export interface WatchlistItem {
  id: string
  mediaType: MediaType
  tmdbId: number
  note: string | null
  /** 0 normal, 1 high, 2 next up. */
  priority: number
  createdAt: string
  updatedAt: string
  movie: MovieSummary | null
}

export interface DiaryEntry {
  id: string
  mediaType: MediaType
  tmdbId: number
  seasonNumber: number | null
  episodeNumber: number | null
  /** YYYY-MM-DD */
  watchedOn: string
  isRewatch: boolean
  createdAt: string
  updatedAt: string
  movie: MovieSummary | null
}

export interface Rating {
  id: string
  mediaType: MediaType
  tmdbId: number
  /** 1-10 in half-star units, so 7 is three and a half stars. */
  score: number
  review: string | null
  createdAt: string
  updatedAt: string
  movie: MovieSummary | null
}

export interface Tag {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

export interface Totals {
  films: number
  shows: number
  episodes: number
  viewings: number
  hoursWatched: number
  viewingsWithUnknownRuntime: number
}

export interface Stats {
  year: number | null
  allTime: Totals
  selected: Totals
  monthlyViewings: { month: number; viewings: number }[] | null
  genres: { id: number; name: string; viewings: number; share: number }[]
  topDirectors: { id: number; name: string; viewings: number }[]
  topActors: { id: number; name: string; viewings: number }[]
  decades: { decade: number; viewings: number }[]
  ratingDistribution: { score: number; count: number }[]
  averageRating: number | null
  runtime: {
    averageMinutes: number | null
    longest: { tmdbId: number; title: string; minutes: number } | null
    shortest: { tmdbId: number; title: string; minutes: number } | null
  }
  availableYears: number[]
}

export type ListRole = 'owner' | 'editor' | 'viewer'
export type Vote = 'yes' | 'maybe' | 'no'

export interface ListSummary {
  id: string
  name: string
  description: string | null
  isShared: boolean
  /** Only ever populated for the owner. */
  shareCode: string | null
  role: ListRole
  itemCount: number
  memberCount: number
  createdAt: string
  updatedAt: string
}

export interface ListItem {
  id: string
  mediaType: MediaType
  tmdbId: number
  note: string | null
  position: number
  addedAt: string
  addedBy: { id: string; handle: string; displayName: string | null }
  movie: MovieSummary | null
  votes: {
    yes: number
    maybe: number
    no: number
    myVote: Vote | null
    voters: { userId: string; handle: string; displayName: string | null; vote: Vote }[]
    awaiting: number
  }
}

export interface ListMember {
  userId: string
  handle: string
  displayName: string | null
  role: ListRole
}

export interface AppNotification {
  id: string
  kind: string
  listId: string | null
  listItemId: string | null
  mediaType: MediaType | null
  tmdbId: number | null
  listName: string | null
  titleName: string | null
  actor: { id: string; handle: string; displayName: string | null }
  readAt: string | null
  createdAt: string
}

export interface SearchPage {
  page: number
  totalPages: number
  totalResults: number
  results: MovieSummary[]
}

export interface ForYou {
  source: 'recommendations' | 'trending'
  reason: string
  ratingsNeeded?: number
  seedCount?: number
  results: MovieSummary[]
}
