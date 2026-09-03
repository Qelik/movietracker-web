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

export interface WatchProvider {
  providerId: number
  name: string
  logoPath: string | null
}

/**
 * One country's availability. `subscription` merges what TMDB splits into
 * flatrate, free and ads, because all three mean "press play, pay nothing
 * more"; rent and buy stay apart because they do not.
 */
export interface RegionProviders {
  region: string
  link: string | null
  subscription: WatchProvider[]
  rent: WatchProvider[]
  buy: WatchProvider[]
}

/** The one video worth a button, already chosen by the server. */
export interface Trailer {
  key: string
  name: string
  type: string
  official: boolean
  publishedAt: string | null
  url: string
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
  /** Availability in the signed-in user's region, or null if there is none. */
  watchProviders: RegionProviders | null
  trailer: Trailer | null
  /** The series this film belongs to, when it belongs to one. Films only. */
  collection: CollectionRef | null
}

/** The stub shown on a film that belongs to a series. */
export interface CollectionRef {
  tmdbId: number
  name: string
  posterPath: string | null
}

/** One film in a series, with what you have done about it. */
export interface CollectionPart extends MovieSummary {
  viewings: number
  score: number | null
  onWatchlist: boolean
}

export interface CollectionPage {
  collection: CollectionRef & { overview: string | null; backdropPath: string | null }
  /** In release order, which is the order anyone means by "the series". */
  parts: CollectionPart[]
  seen: { watched: number; total: number }
}

export interface Person {
  tmdbId: number
  name: string
  biography: string | null
  birthday: string | null
  deathday: string | null
  placeOfBirth: string | null
  profilePath: string | null
  knownForDepartment: string | null
}

/**
 * One title in a filmography, with what you have done about it.
 *
 * `roles` is a list because one person can be credited more than once on the
 * same title — an actor who also produced, a writer who directed.
 */
export interface PersonCredit extends MovieSummary {
  roles: string[]
  isCast: boolean
  episodeCount: number | null
  viewings: number
  score: number | null
  onWatchlist: boolean
}

export interface PersonPage {
  person: Person
  credits: PersonCredit[]
  /** Counted over titles, not viewings: three rewatches are still one film. */
  seen: { watched: number; total: number }
}

export interface PublicUser {
  id: string
  email: string | null
  handle: string
  displayName: string | null
  avatarUrl: string | null
  /** ISO 3166-1 alpha-2. Decides whose streaming availability is shown. */
  region: string
  /** Who can see what this account watches. Opt-in; private by default. */
  activityVisibility: 'private' | 'followers'
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
  /** Null when nobody has ever fetched availability for this title. */
  watchProviders: RegionProviders | null
}

/**
 * The episode to play for one show you have started.
 *
 * `ready` means it has aired; `upcoming` means it has not yet. An episode with
 * no known air date counts as ready — the usual reason for a missing date is a
 * season nobody has fetched, and hiding a watchable episode behind "unknown" is
 * the worse mistake.
 */
export interface UpNextShow {
  mediaType: 'tv'
  tmdbId: number
  title: string
  posterPath: string | null
  seriesStatus: string | null
  next: {
    seasonNumber: number
    episodeNumber: number
    /** Null when that season's episodes are not cached on the server. */
    name: string | null
    airDate: string | null
    runtimeMinutes: number | null
    stillPath: string | null
  }
  status: 'ready' | 'upcoming'
  watchedEpisodes: number
  /**
   * Episodes that exist to be watched. Progress is measured against this, not
   * the whole run: somebody caught up midway through a second season has
   * watched everything there is, and counting the announced episodes against
   * them reports it as half finished.
   */
  airedEpisodes: number
  /** The whole run, announced episodes included. Context, not a denominator. */
  totalEpisodes: number
  /** Aired episodes left after this one. */
  remaining: number
  lastWatchedOn: string
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

/** One thing landing on one day: a film's release, or an episode airing. */
export interface CalendarEntry {
  kind: 'release' | 'episode'
  mediaType: MediaType
  tmdbId: number
  title: string
  posterPath: string | null
  /** YYYY-MM-DD */
  date: string
  /** Episodes only. */
  seasonNumber: number | null
  episodeNumber: number | null
  episodeName: string | null
}

export interface CalendarDay {
  date: string
  entries: CalendarEntry[]
}

export interface CalendarPage {
  /** The day the window opens on, which is today on the server. */
  from: string
  days: number
  calendar: CalendarDay[]
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
  streaks: {
    /** The longest run of consecutive days with something watched. */
    longestDays: number
    longestFrom: string | null
    longestTo: string | null
    /** Days with at least one viewing. */
    activeDays: number
    busiestDay: { date: string; viewings: number } | null
  }
  /** How much was new to you, and how much was going back. */
  firstTimeVsRewatch: { firstTime: number; rewatches: number }
  mostRewatched: { mediaType: MediaType; tmdbId: number; title: string; viewings: number }[]
  /** Null for all time, or when there is nothing before the selected year. */
  previousYear: {
    year: number
    viewings: number
    hoursWatched: number
    /** A proportion: 0.25 is a quarter more than last year. */
    viewingsChange: number | null
  } | null
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

/** What the list picked, and what it was drawn against. */
export interface Decision {
  pick: {
    listItemId: string
    mediaType: MediaType
    tmdbId: number
    title: string
    yes: number
    maybe: number
    no: number
  }
  odds: { listItemId: string; title: string; weight: number }[]
  /** True when nothing survived the veto rule and it had to be relaxed. */
  vetoesIgnored: boolean
  voterCount: number
  movie: MovieSummary | null
}

export type Availability = 'yes' | 'maybe' | 'no'

/** A proposed night in, and who can make it. */
export interface ListNight {
  id: string
  /** YYYY-MM-DD */
  onDate: string
  note: string | null
  proposedBy: { id: string; handle: string; displayName: string | null }
  yes: number
  maybe: number
  no: number
  myReply: Availability | null
  replies: { userId: string; handle: string; displayName: string | null; reply: Availability }[]
  createdAt: string
}

export interface AppNotification {
  id: string
  /**
   * Left as a string rather than a union: the server can learn a new kind
   * before the client does, and an unknown value should render a plain row,
   * not fail the whole inbox.
   */
  kind: string
  listId: string | null
  listItemId: string | null
  mediaType: MediaType | null
  tmdbId: number | null
  listName: string | null
  titleName: string | null
  /** Null for the events nobody caused: a release arriving, an episode airing. */
  actor: { id: string; handle: string; displayName: string | null } | null
  readAt: string | null
  createdAt: string
}

/** One CSV upload, and what became of it. */
export interface ImportJob {
  id: string
  filename: string | null
  status: 'running' | 'done' | 'failed'
  /** Rows with a usable title. Lines without one are counted in `skipped`. */
  total: number
  processed: number
  /** Distinct films resolved to a TMDB id. */
  matched: number
  /** Viewings, ratings and watchlist entries actually written. */
  imported: number
  skipped: number
  /** Titles TMDB could not identify, listed so nothing is lost silently. */
  unmatched: { title: string; year: number | null }[]
  error: string | null
  createdAt: string
  finishedAt: string | null
}

/** One thing somebody you follow did. */
export interface FeedItem {
  kind: 'watched' | 'rated'
  id: string
  user: PublicUser
  mediaType: MediaType
  tmdbId: number
  movie: MovieSummary | null
  /** Viewings only. */
  watchedOn: string | null
  isRewatch: boolean
  /** Ratings only. 1-10 in half-star units. */
  score: number | null
  review: string | null
  at: string
}

export interface FollowCounts {
  followers: number
  following: number
}

export interface ProfileView {
  user: PublicUser
  counts: FollowCounts
  /** Null when the profile is your own. */
  isFollowing: boolean | null
  isSelf: boolean
  /** False is a real answer: a private account still has a profile to follow. */
  canSeeActivity: boolean
  activity: FeedItem[]
}

export interface SearchPage {
  page: number
  totalPages: number
  totalResults: number
  results: MovieSummary[]
}

/** One result of a filtered browse, with what you have done about it. */
export interface BrowseResult extends MovieSummary {
  viewings: number
  score: number | null
  onWatchlist: boolean
}

export interface BrowseFilters {
  media: 'movie' | 'tv'
  genres: number[]
  providers: number[]
  fromYear: number | null
  toYear: number | null
  minRuntime: number | null
  maxRuntime: number | null
  minRating: number | null
  sort: 'popular' | 'rating' | 'newest' | 'oldest'
  hideWatched: boolean
  page: number
}

export interface BrowsePage {
  page: number
  totalPages: number
  totalResults: number
  results: BrowseResult[]
  /** How many this page dropped as already watched. */
  hidden: number
  region: string | null
}

export interface ForYou {
  source: 'recommendations' | 'trending'
  reason: string
  ratingsNeeded?: number
  seedCount?: number
  results: MovieSummary[]
}
