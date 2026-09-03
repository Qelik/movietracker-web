/**
 * The one place that talks to the API.
 *
 * Access tokens are short-lived (15 minutes by default), so every call routes
 * through `request`, which refreshes once on a 401 and replays the original
 * request. Concurrent 401s share a single refresh — rotation is single-use, and
 * two refreshes racing would burn one token and log the user out.
 */
import type {
  AppNotification,
  BrowseFilters,
  BrowsePage,
  CalendarPage,
  Availability,
  CollectionPage,
  Decision,
  FeedItem,
  FollowCounts,
  DiaryEntry,
  EpisodeSummary,
  ForYou,
  Genre,
  ImportJob,
  ListItem,
  ListMember,
  ListNight,
  ListSummary,
  MediaType,
  MovieDetail,
  MovieSummary,
  PersonPage,
  ProfileView,
  UpNextShow,
  PublicUser,
  Rating,
  SearchPage,
  Stats,
  Tag,
  TokenPair,
  Vote,
  WatchlistItem,
} from './types.js'

/** Overridable from the console for local development against a local server. */
const STORED_BASE = 'movietracker.apiBase'
const DEFAULT_BASE = 'https://movietracker-api-production.up.railway.app'

/** Hostnames where pointing the app at another API is a development convenience. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', ''])

export function apiBase(): string {
  // Ignore any stored override on the deployed origin, not merely refuse to
  // write one — a value planted before this guard existed must not keep working.
  if (!LOCAL_HOSTS.has(location.hostname)) return DEFAULT_BASE
  return localStorage.getItem(STORED_BASE) ?? DEFAULT_BASE
}

/**
 * Overridable from the console, but only while the page itself is served
 * locally.
 *
 * On the deployed origin this is a refusal, because a stored base URL survives
 * reloads: one injected script could repoint the app at an attacker's host and
 * every later request would carry the bearer token there. Development does not
 * need that to be possible in production to work.
 */
export function setApiBase(base: string | null): void {
  if (!LOCAL_HOSTS.has(location.hostname)) {
    throw new Error('The API base URL can only be changed when running locally')
  }
  if (base) localStorage.setItem(STORED_BASE, base.replace(/\/+$/, ''))
  else localStorage.removeItem(STORED_BASE)
}

const SESSION_KEY = 'movietracker.session'

interface StoredSession {
  accessToken: string
  refreshToken: string
  user: PublicUser
}

let session: StoredSession | null = readSession()

function readSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredSession>
    if (!parsed.accessToken || !parsed.refreshToken || !parsed.user) return null
    return parsed as StoredSession
  } catch {
    return null
  }
}

function writeSession(next: StoredSession | null): void {
  session = next
  if (next) localStorage.setItem(SESSION_KEY, JSON.stringify(next))
  else localStorage.removeItem(SESSION_KEY)
}

export function currentUser(): PublicUser | null {
  return session?.user ?? null
}

export function isSignedIn(): boolean {
  return session !== null
}

/** Raised for every non-2xx response, carrying the server's own error code. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

/** Fired when a refresh fails, so the shell can drop back to the sign-in screen. */
type SignedOutHandler = () => void
let onSignedOut: SignedOutHandler = () => {}
export function whenSignedOut(handler: SignedOutHandler): void {
  onSignedOut = handler
}

interface RequestOptions {
  method?: string
  body?: unknown
  /** Auth endpoints, which must not try to refresh a token they are issuing. */
  anonymous?: boolean
  signal?: AbortSignal
}

let refreshInFlight: Promise<boolean> | null = null

async function refreshTokens(): Promise<boolean> {
  if (!session) return false
  if (refreshInFlight) return refreshInFlight

  const attempt = (async () => {
    try {
      const response = await fetch(`${apiBase()}/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: session?.refreshToken }),
      })
      if (!response.ok) return false
      const tokens = (await response.json()) as TokenPair
      if (!session) return false
      writeSession({ ...session, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken })
      return true
    } catch {
      // A refresh that fails because the network is down is not a signed-out
      // user. The caller reports the network error and the session survives.
      return false
    } finally {
      refreshInFlight = null
    }
  })()

  refreshInFlight = attempt
  return attempt
}

async function readError(response: Response): Promise<ApiError> {
  let code = 'http_error'
  let message = `Request failed (${response.status})`
  try {
    const body = (await response.json()) as { error?: { code?: string; message?: string } }
    if (body.error?.code) code = body.error.code
    if (body.error?.message) message = body.error.message
  } catch {
    // A body that is not JSON tells us nothing beyond the status code.
  }
  return new ApiError(response.status, code, message)
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const send = async (): Promise<Response> => {
    const headers: Record<string, string> = {}
    if (options.body !== undefined) headers['Content-Type'] = 'application/json'
    if (!options.anonymous && session) headers.Authorization = `Bearer ${session.accessToken}`

    try {
      return await fetch(`${apiBase()}${path}`, {
        method: options.method ?? 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: options.signal,
      })
    } catch (error) {
      // A cancelled request is not a network failure — the caller asked for it.
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      throw new ApiError(0, 'network', 'Cannot reach the server. Check your connection.')
    }
  }

  let response = await send()

  if (response.status === 401 && !options.anonymous && session) {
    const refreshed = await refreshTokens()
    if (refreshed) {
      response = await send()
    } else {
      // Only a server that answered counts as signed out. Being offline must
      // not throw away a perfectly good session.
      writeSession(null)
      onSignedOut()
      throw new ApiError(401, 'signed_out', 'Your session expired. Sign in again.')
    }
  }

  if (!response.ok) throw await readError(response)
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

// MARK: Auth

export async function register(
  email: string,
  password: string,
  displayName?: string,
): Promise<PublicUser> {
  const result = await request<{ user: PublicUser } & TokenPair>('/v1/auth/register', {
    method: 'POST',
    anonymous: true,
    body: { email, password, ...(displayName ? { displayName } : {}) },
  })
  writeSession({ accessToken: result.accessToken, refreshToken: result.refreshToken, user: result.user })
  return result.user
}

export async function login(email: string, password: string): Promise<PublicUser> {
  const result = await request<{ user: PublicUser } & TokenPair>('/v1/auth/login', {
    method: 'POST',
    anonymous: true,
    body: { email, password },
  })
  writeSession({ accessToken: result.accessToken, refreshToken: result.refreshToken, user: result.user })
  return result.user
}

export async function logout(): Promise<void> {
  const refreshToken = session?.refreshToken
  writeSession(null)
  if (!refreshToken) return
  try {
    await fetch(`${apiBase()}/v1/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
  } catch {
    // Signing out locally is the part that matters; the token expires anyway.
  }
}

export async function me(): Promise<PublicUser> {
  const { user } = await request<{ user: PublicUser }>('/v1/me')
  if (session) writeSession({ ...session, user })
  return user
}

export async function updateMe(patch: {
  displayName?: string
  handle?: string
  region?: string
  activityVisibility?: 'private' | 'followers'
}): Promise<PublicUser> {
  const { user } = await request<{ user: PublicUser }>('/v1/me', { method: 'PATCH', body: patch })
  if (session) writeSession({ ...session, user })
  return user
}

// MARK: People you follow

/** What the accounts you follow have been watching. */
export async function feed(): Promise<{ items: FeedItem[]; sharingCount: number }> {
  return await request<{ items: FeedItem[]; sharingCount: number }>('/v1/feed')
}

/** Somebody else's profile, as you are allowed to see it. */
export async function profile(handle: string): Promise<ProfileView> {
  return await request<ProfileView>(`/v1/users/${encodeURIComponent(handle)}`)
}

export async function follow(handle: string): Promise<{ counts: FollowCounts }> {
  return await request<{ counts: FollowCounts }>(
    `/v1/follows/${encodeURIComponent(handle)}`,
    { method: 'POST' },
  )
}

export async function unfollow(handle: string): Promise<{ counts: FollowCounts }> {
  return await request<{ counts: FollowCounts }>(
    `/v1/follows/${encodeURIComponent(handle)}`,
    { method: 'DELETE' },
  )
}

export async function follows(): Promise<{ following: PublicUser[]; followers: PublicUser[] }> {
  return await request<{ following: PublicUser[]; followers: PublicUser[] }>('/v1/follows')
}

// MARK: Titles

export function search(query: string, page = 1, signal?: AbortSignal): Promise<SearchPage> {
  return request<SearchPage>(
    `/v1/movies/search?q=${encodeURIComponent(query)}&page=${page}`,
    { signal },
  )
}

export async function titleDetail(mediaType: MediaType, tmdbId: number): Promise<MovieDetail> {
  const { movie } = await request<{ movie: MovieDetail }>(
    `/v1/movies/${tmdbId}?mediaType=${mediaType}`,
  )
  return movie
}

/**
 * A person, their filmography, and what you have seen of it — one call, because
 * the overlay is the only reason the screen is worth opening.
 */
export async function person(tmdbId: number): Promise<PersonPage> {
  return await request<PersonPage>(`/v1/people/${tmdbId}`)
}

/** A series, its films in release order, and how many of them you have seen. */
export async function collection(tmdbId: number): Promise<CollectionPage> {
  return await request<CollectionPage>(`/v1/collections/${tmdbId}`)
}

export async function seasonEpisodes(tmdbId: number, seasonNumber: number): Promise<EpisodeSummary[]> {
  const { episodes } = await request<{ episodes: EpisodeSummary[] }>(
    `/v1/tv/${tmdbId}/seasons/${seasonNumber}`,
  )
  return episodes
}

export function similar(tmdbId: number, page = 1): Promise<SearchPage> {
  return request<SearchPage>(`/v1/movies/${tmdbId}/similar?page=${page}`)
}

// MARK: Discover

export async function genres(): Promise<Genre[]> {
  const result = await request<{ genres: Genre[] }>('/v1/discover/genres')
  return result.genres
}

type DiscoverMedia = 'all' | 'movie' | 'tv'

export async function trending(media: DiscoverMedia, page = 1): Promise<MovieSummary[]> {
  const { results } = await request<{ results: MovieSummary[] }>(
    `/v1/discover/trending?media=${media}&page=${page}`,
  )
  return results
}

export async function popular(media: DiscoverMedia, page = 1): Promise<MovieSummary[]> {
  const { results } = await request<{ results: MovieSummary[] }>(
    `/v1/discover/popular?media=${media}&page=${page}`,
  )
  return results
}

export async function byGenre(id: number, media: DiscoverMedia, page = 1): Promise<MovieSummary[]> {
  const { results } = await request<{ results: MovieSummary[] }>(
    `/v1/discover/genre/${id}?media=${media}&page=${page}`,
  )
  return results
}

/**
 * A filtered browse. Every empty filter is left out of the query rather than
 * sent blank — TMDB reads an empty parameter as a real constraint on some
 * endpoints and answers with nothing.
 */
export async function browse(filters: BrowseFilters): Promise<BrowsePage> {
  const query = new URLSearchParams({
    media: filters.media,
    sort: filters.sort,
    page: String(filters.page),
  })

  if (filters.genres.length) query.set('genres', filters.genres.join(','))
  if (filters.providers.length) query.set('providers', filters.providers.join(','))
  if (filters.fromYear !== null) query.set('fromYear', String(filters.fromYear))
  if (filters.toYear !== null) query.set('toYear', String(filters.toYear))
  if (filters.minRuntime !== null) query.set('minRuntime', String(filters.minRuntime))
  if (filters.maxRuntime !== null) query.set('maxRuntime', String(filters.maxRuntime))
  if (filters.minRating !== null) query.set('minRating', String(filters.minRating))
  if (filters.hideWatched) query.set('hideWatched', 'true')

  return await request<BrowsePage>(`/v1/discover/browse?${query.toString()}`)
}

export function forYou(media: DiscoverMedia): Promise<ForYou> {
  return request<ForYou>(`/v1/discover/for-you?media=${media}`)
}

// MARK: Watchlist

export async function watchlist(): Promise<WatchlistItem[]> {
  const { items } = await request<{ items: WatchlistItem[] }>('/v1/watchlist')
  return items
}

export async function addToWatchlist(
  mediaType: MediaType,
  tmdbId: number,
  options: { note?: string | null; priority?: number } = {},
): Promise<WatchlistItem> {
  const { item } = await request<{ item: WatchlistItem }>('/v1/watchlist', {
    method: 'POST',
    body: { mediaType, tmdbId, ...options },
  })
  return item
}

export async function updateWatchlist(
  mediaType: MediaType,
  tmdbId: number,
  patch: { note?: string | null; priority?: number },
): Promise<WatchlistItem> {
  const { item } = await request<{ item: WatchlistItem }>(
    `/v1/watchlist/${tmdbId}?mediaType=${mediaType}`,
    { method: 'PATCH', body: patch },
  )
  return item
}

export function removeFromWatchlist(mediaType: MediaType, tmdbId: number): Promise<void> {
  return request<void>(`/v1/watchlist/${tmdbId}?mediaType=${mediaType}`, { method: 'DELETE' })
}

// MARK: Diary

/**
 * The episode to play for every show you have started. Costs the server no
 * upstream call, so it is cheap enough to ask for on every app open.
 */
export async function upNext(): Promise<UpNextShow[]> {
  const { shows } = await request<{ shows: UpNextShow[] }>('/v1/up-next')
  return shows
}

/**
 * What is coming: watchlisted films yet to be released, and unaired episodes of
 * shows you have started. Reads only the server's own cache — nothing upstream.
 */
export async function calendar(days = 60): Promise<CalendarPage> {
  return await request<CalendarPage>(`/v1/calendar?days=${days}`)
}

export async function diary(range: { from?: string; to?: string } = {}): Promise<DiaryEntry[]> {
  const params = new URLSearchParams()
  if (range.from) params.set('from', range.from)
  if (range.to) params.set('to', range.to)
  const suffix = params.toString() ? `?${params}` : ''
  const { entries } = await request<{ entries: DiaryEntry[] }>(`/v1/diary${suffix}`)
  return entries
}

export async function logViewing(input: {
  mediaType: MediaType
  tmdbId: number
  seasonNumber?: number
  episodeNumber?: number
  watchedOn?: string
  isRewatch?: boolean
}): Promise<DiaryEntry> {
  const { entry } = await request<{ entry: DiaryEntry }>('/v1/diary', { method: 'POST', body: input })
  return entry
}

export function logSeason(input: {
  tmdbId: number
  seasonNumber: number
  watchedOn?: string
  includeAlreadyLogged?: boolean
}): Promise<{ added: number; skipped: number; message?: string }> {
  return request('/v1/diary/season', { method: 'POST', body: input })
}

export async function updateViewing(
  id: string,
  patch: { watchedOn?: string; isRewatch?: boolean },
): Promise<DiaryEntry> {
  const { entry } = await request<{ entry: DiaryEntry }>(`/v1/diary/${id}`, {
    method: 'PATCH',
    body: patch,
  })
  return entry
}

export function deleteViewing(id: string): Promise<void> {
  return request<void>(`/v1/diary/${id}`, { method: 'DELETE' })
}

// MARK: Ratings

export async function ratings(): Promise<Rating[]> {
  const result = await request<{ ratings: Rating[] }>('/v1/ratings')
  return result.ratings
}

export async function rate(
  mediaType: MediaType,
  tmdbId: number,
  score: number,
  review: string | null,
): Promise<Rating> {
  const { rating } = await request<{ rating: Rating }>(`/v1/ratings/${tmdbId}?mediaType=${mediaType}`, {
    method: 'PUT',
    body: { score, review },
  })
  return rating
}

export function unrate(mediaType: MediaType, tmdbId: number): Promise<void> {
  return request<void>(`/v1/ratings/${tmdbId}?mediaType=${mediaType}`, { method: 'DELETE' })
}

// MARK: Tags

export async function tags(): Promise<Tag[]> {
  const result = await request<{ tags: Tag[] }>('/v1/tags')
  return result.tags
}

export async function createTag(name: string): Promise<Tag> {
  const { tag } = await request<{ tag: Tag }>('/v1/tags', { method: 'POST', body: { name } })
  return tag
}

export async function renameTag(id: string, name: string): Promise<Tag> {
  const { tag } = await request<{ tag: Tag }>(`/v1/tags/${id}`, { method: 'PATCH', body: { name } })
  return tag
}

export function deleteTag(id: string): Promise<void> {
  return request<void>(`/v1/tags/${id}`, { method: 'DELETE' })
}

export async function tagsFor(mediaType: MediaType, tmdbId: number): Promise<Tag[]> {
  const result = await request<{ tags: Tag[] }>(`/v1/movies/${tmdbId}/tags?mediaType=${mediaType}`)
  return result.tags
}

export async function setTags(mediaType: MediaType, tmdbId: number, tagIds: string[]): Promise<Tag[]> {
  const result = await request<{ tags: Tag[] }>(`/v1/movies/${tmdbId}/tags?mediaType=${mediaType}`, {
    method: 'PUT',
    body: { tagIds },
  })
  return result.tags
}

// MARK: Stats

export function stats(year?: number | null): Promise<Stats> {
  return request<Stats>(`/v1/stats${year ? `?year=${year}` : ''}`)
}

// MARK: Lists

export function lists(): Promise<{ owned: ListSummary[]; shared: ListSummary[] }> {
  return request('/v1/lists')
}

export async function createList(name: string, description?: string | null): Promise<ListSummary> {
  const { list } = await request<{ list: ListSummary }>('/v1/lists', {
    method: 'POST',
    body: { name, description: description ?? null },
  })
  return list
}

export function listDetail(id: string): Promise<{ list: ListSummary; items: ListItem[] }> {
  return request(`/v1/lists/${id}`)
}

export async function updateList(
  id: string,
  patch: { name?: string; description?: string | null },
): Promise<ListSummary> {
  const { list } = await request<{ list: ListSummary }>(`/v1/lists/${id}`, {
    method: 'PATCH',
    body: patch,
  })
  return list
}

export function deleteList(id: string): Promise<void> {
  return request<void>(`/v1/lists/${id}`, { method: 'DELETE' })
}

export function addListItem(
  id: string,
  mediaType: MediaType,
  tmdbId: number,
  note?: string | null,
): Promise<{ item: ListItem }> {
  return request(`/v1/lists/${id}/items`, {
    method: 'POST',
    body: { mediaType, tmdbId, note: note ?? null },
  })
}

export function removeListItem(id: string, mediaType: MediaType, tmdbId: number): Promise<void> {
  return request<void>(`/v1/lists/${id}/items/${tmdbId}?mediaType=${mediaType}`, { method: 'DELETE' })
}

export function voteOn(listId: string, itemId: string, vote: Vote): Promise<unknown> {
  return request(`/v1/lists/${listId}/items/${itemId}/vote`, { method: 'PUT', body: { vote } })
}

export function clearVote(listId: string, itemId: string): Promise<void> {
  return request<void>(`/v1/lists/${listId}/items/${itemId}/vote`, { method: 'DELETE' })
}

/**
 * Picks one thing off a shared list.
 *
 * Nothing is recorded, so rolling again is free — which is, in practice, how
 * the decision actually gets made.
 */
export async function decideForList(listId: string): Promise<Decision> {
  const { decision } = await request<{ decision: Decision }>(`/v1/lists/${listId}/decide`, {
    method: 'POST',
  })
  return decision
}

export async function nights(listId: string): Promise<ListNight[]> {
  const { nights } = await request<{ nights: ListNight[] }>(`/v1/lists/${listId}/nights`)
  return nights
}

export async function proposeNight(
  listId: string,
  onDate: string,
  note?: string | null,
): Promise<ListNight[]> {
  const { nights } = await request<{ nights: ListNight[] }>(`/v1/lists/${listId}/nights`, {
    method: 'POST',
    body: { onDate, note: note ?? null },
  })
  return nights
}

export async function replyToNight(
  listId: string,
  nightId: string,
  reply: Availability,
): Promise<ListNight[]> {
  const { nights } = await request<{ nights: ListNight[] }>(
    `/v1/lists/${listId}/nights/${nightId}/reply`,
    { method: 'POST', body: { reply } },
  )
  return nights
}

export async function cancelNight(listId: string, nightId: string): Promise<ListNight[]> {
  const { nights } = await request<{ nights: ListNight[] }>(
    `/v1/lists/${listId}/nights/${nightId}`,
    { method: 'DELETE' },
  )
  return nights
}

export async function listMembers(id: string): Promise<ListMember[]> {
  const { members } = await request<{ members: ListMember[] }>(`/v1/lists/${id}/members`)
  return members
}

export function invite(id: string, handle: string, role: 'editor' | 'viewer'): Promise<unknown> {
  return request(`/v1/lists/${id}/members`, { method: 'POST', body: { handle, role } })
}

export function setMemberRole(id: string, userId: string, role: 'editor' | 'viewer'): Promise<unknown> {
  return request(`/v1/lists/${id}/members/${userId}`, { method: 'PATCH', body: { role } })
}

export function removeMember(id: string, userId: string): Promise<void> {
  return request<void>(`/v1/lists/${id}/members/${userId}`, { method: 'DELETE' })
}

export async function mintShareCode(id: string): Promise<string> {
  const result = await request<{ shareCode: string }>(`/v1/lists/${id}/share-code`, { method: 'POST' })
  return result.shareCode
}

export function revokeShareCode(id: string): Promise<void> {
  return request<void>(`/v1/lists/${id}/share-code`, { method: 'DELETE' })
}

export function redeemShareCode(code: string): Promise<{ list: ListSummary }> {
  return request(`/v1/lists/redeem/${encodeURIComponent(code)}`, { method: 'POST' })
}

// MARK: Notifications

export function notifications(limit = 50): Promise<{
  notifications: AppNotification[]
  unread: number
  pushEnabled: boolean
}> {
  return request(`/v1/notifications?limit=${limit}`)
}

export function markNotificationsRead(ids?: string[]): Promise<{ marked: number; unread: number }> {
  return request('/v1/notifications/read', { method: 'POST', body: ids ? { ids } : {} })
}

// MARK: Export

/**
 * Uploads a CSV and starts an import.
 *
 * Answers with a job, not a result: matching hundreds of titles against TMDB
 * takes minutes, and the run outlives the request that started it.
 */
export async function startImport(csv: string, filename: string): Promise<ImportJob> {
  const { job } = await request<{ job: ImportJob }>('/v1/import', {
    method: 'POST',
    body: { csv, filename },
  })
  return job
}

export async function importJob(id: string): Promise<ImportJob> {
  const { job } = await request<{ job: ImportJob }>(`/v1/import/${id}`)
  return job
}

export function exportLibrary(): Promise<unknown> {
  return request('/v1/export')
}
