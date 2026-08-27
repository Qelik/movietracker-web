/** Overridable from the console for local development against a local server. */
const STORED_BASE = 'movietracker.apiBase';
const DEFAULT_BASE = 'https://movietracker-api-production.up.railway.app';
/** Hostnames where pointing the app at another API is a development convenience. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '']);
export function apiBase() {
    // Ignore any stored override on the deployed origin, not merely refuse to
    // write one — a value planted before this guard existed must not keep working.
    if (!LOCAL_HOSTS.has(location.hostname))
        return DEFAULT_BASE;
    return localStorage.getItem(STORED_BASE) ?? DEFAULT_BASE;
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
export function setApiBase(base) {
    if (!LOCAL_HOSTS.has(location.hostname)) {
        throw new Error('The API base URL can only be changed when running locally');
    }
    if (base)
        localStorage.setItem(STORED_BASE, base.replace(/\/+$/, ''));
    else
        localStorage.removeItem(STORED_BASE);
}
const SESSION_KEY = 'movietracker.session';
let session = readSession();
function readSession() {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw)
            return null;
        const parsed = JSON.parse(raw);
        if (!parsed.accessToken || !parsed.refreshToken || !parsed.user)
            return null;
        return parsed;
    }
    catch {
        return null;
    }
}
function writeSession(next) {
    session = next;
    if (next)
        localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    else
        localStorage.removeItem(SESSION_KEY);
}
export function currentUser() {
    return session?.user ?? null;
}
export function isSignedIn() {
    return session !== null;
}
/** Raised for every non-2xx response, carrying the server's own error code. */
export class ApiError extends Error {
    status;
    code;
    constructor(status, code, message) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
    }
}
let onSignedOut = () => { };
export function whenSignedOut(handler) {
    onSignedOut = handler;
}
let refreshInFlight = null;
async function refreshTokens() {
    if (!session)
        return false;
    if (refreshInFlight)
        return refreshInFlight;
    const attempt = (async () => {
        try {
            const response = await fetch(`${apiBase()}/v1/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken: session?.refreshToken }),
            });
            if (!response.ok)
                return false;
            const tokens = (await response.json());
            if (!session)
                return false;
            writeSession({ ...session, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
            return true;
        }
        catch {
            // A refresh that fails because the network is down is not a signed-out
            // user. The caller reports the network error and the session survives.
            return false;
        }
        finally {
            refreshInFlight = null;
        }
    })();
    refreshInFlight = attempt;
    return attempt;
}
async function readError(response) {
    let code = 'http_error';
    let message = `Request failed (${response.status})`;
    try {
        const body = (await response.json());
        if (body.error?.code)
            code = body.error.code;
        if (body.error?.message)
            message = body.error.message;
    }
    catch {
        // A body that is not JSON tells us nothing beyond the status code.
    }
    return new ApiError(response.status, code, message);
}
async function request(path, options = {}) {
    const send = async () => {
        const headers = {};
        if (options.body !== undefined)
            headers['Content-Type'] = 'application/json';
        if (!options.anonymous && session)
            headers.Authorization = `Bearer ${session.accessToken}`;
        try {
            return await fetch(`${apiBase()}${path}`, {
                method: options.method ?? 'GET',
                headers,
                body: options.body === undefined ? undefined : JSON.stringify(options.body),
                signal: options.signal,
            });
        }
        catch (error) {
            // A cancelled request is not a network failure — the caller asked for it.
            if (error instanceof DOMException && error.name === 'AbortError')
                throw error;
            throw new ApiError(0, 'network', 'Cannot reach the server. Check your connection.');
        }
    };
    let response = await send();
    if (response.status === 401 && !options.anonymous && session) {
        const refreshed = await refreshTokens();
        if (refreshed) {
            response = await send();
        }
        else {
            // Only a server that answered counts as signed out. Being offline must
            // not throw away a perfectly good session.
            writeSession(null);
            onSignedOut();
            throw new ApiError(401, 'signed_out', 'Your session expired. Sign in again.');
        }
    }
    if (!response.ok)
        throw await readError(response);
    if (response.status === 204)
        return undefined;
    return (await response.json());
}
// MARK: Auth
export async function register(email, password, displayName) {
    const result = await request('/v1/auth/register', {
        method: 'POST',
        anonymous: true,
        body: { email, password, ...(displayName ? { displayName } : {}) },
    });
    writeSession({ accessToken: result.accessToken, refreshToken: result.refreshToken, user: result.user });
    return result.user;
}
export async function login(email, password) {
    const result = await request('/v1/auth/login', {
        method: 'POST',
        anonymous: true,
        body: { email, password },
    });
    writeSession({ accessToken: result.accessToken, refreshToken: result.refreshToken, user: result.user });
    return result.user;
}
export async function logout() {
    const refreshToken = session?.refreshToken;
    writeSession(null);
    if (!refreshToken)
        return;
    try {
        await fetch(`${apiBase()}/v1/auth/logout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
        });
    }
    catch {
        // Signing out locally is the part that matters; the token expires anyway.
    }
}
export async function me() {
    const { user } = await request('/v1/me');
    if (session)
        writeSession({ ...session, user });
    return user;
}
export async function updateMe(patch) {
    const { user } = await request('/v1/me', { method: 'PATCH', body: patch });
    if (session)
        writeSession({ ...session, user });
    return user;
}
// MARK: Titles
export function search(query, page = 1, signal) {
    return request(`/v1/movies/search?q=${encodeURIComponent(query)}&page=${page}`, { signal });
}
export async function titleDetail(mediaType, tmdbId) {
    const { movie } = await request(`/v1/movies/${tmdbId}?mediaType=${mediaType}`);
    return movie;
}
export async function seasonEpisodes(tmdbId, seasonNumber) {
    const { episodes } = await request(`/v1/tv/${tmdbId}/seasons/${seasonNumber}`);
    return episodes;
}
export function similar(tmdbId, page = 1) {
    return request(`/v1/movies/${tmdbId}/similar?page=${page}`);
}
// MARK: Discover
export async function genres() {
    const result = await request('/v1/discover/genres');
    return result.genres;
}
export async function trending(media, page = 1) {
    const { results } = await request(`/v1/discover/trending?media=${media}&page=${page}`);
    return results;
}
export async function popular(media, page = 1) {
    const { results } = await request(`/v1/discover/popular?media=${media}&page=${page}`);
    return results;
}
export async function byGenre(id, media, page = 1) {
    const { results } = await request(`/v1/discover/genre/${id}?media=${media}&page=${page}`);
    return results;
}
export function forYou(media) {
    return request(`/v1/discover/for-you?media=${media}`);
}
// MARK: Watchlist
export async function watchlist() {
    const { items } = await request('/v1/watchlist');
    return items;
}
export async function addToWatchlist(mediaType, tmdbId, options = {}) {
    const { item } = await request('/v1/watchlist', {
        method: 'POST',
        body: { mediaType, tmdbId, ...options },
    });
    return item;
}
export async function updateWatchlist(mediaType, tmdbId, patch) {
    const { item } = await request(`/v1/watchlist/${tmdbId}?mediaType=${mediaType}`, { method: 'PATCH', body: patch });
    return item;
}
export function removeFromWatchlist(mediaType, tmdbId) {
    return request(`/v1/watchlist/${tmdbId}?mediaType=${mediaType}`, { method: 'DELETE' });
}
// MARK: Diary
export async function diary(range = {}) {
    const params = new URLSearchParams();
    if (range.from)
        params.set('from', range.from);
    if (range.to)
        params.set('to', range.to);
    const suffix = params.toString() ? `?${params}` : '';
    const { entries } = await request(`/v1/diary${suffix}`);
    return entries;
}
export async function logViewing(input) {
    const { entry } = await request('/v1/diary', { method: 'POST', body: input });
    return entry;
}
export function logSeason(input) {
    return request('/v1/diary/season', { method: 'POST', body: input });
}
export async function updateViewing(id, patch) {
    const { entry } = await request(`/v1/diary/${id}`, {
        method: 'PATCH',
        body: patch,
    });
    return entry;
}
export function deleteViewing(id) {
    return request(`/v1/diary/${id}`, { method: 'DELETE' });
}
// MARK: Ratings
export async function ratings() {
    const result = await request('/v1/ratings');
    return result.ratings;
}
export async function rate(mediaType, tmdbId, score, review) {
    const { rating } = await request(`/v1/ratings/${tmdbId}?mediaType=${mediaType}`, {
        method: 'PUT',
        body: { score, review },
    });
    return rating;
}
export function unrate(mediaType, tmdbId) {
    return request(`/v1/ratings/${tmdbId}?mediaType=${mediaType}`, { method: 'DELETE' });
}
// MARK: Tags
export async function tags() {
    const result = await request('/v1/tags');
    return result.tags;
}
export async function createTag(name) {
    const { tag } = await request('/v1/tags', { method: 'POST', body: { name } });
    return tag;
}
export async function renameTag(id, name) {
    const { tag } = await request(`/v1/tags/${id}`, { method: 'PATCH', body: { name } });
    return tag;
}
export function deleteTag(id) {
    return request(`/v1/tags/${id}`, { method: 'DELETE' });
}
export async function tagsFor(mediaType, tmdbId) {
    const result = await request(`/v1/movies/${tmdbId}/tags?mediaType=${mediaType}`);
    return result.tags;
}
export async function setTags(mediaType, tmdbId, tagIds) {
    const result = await request(`/v1/movies/${tmdbId}/tags?mediaType=${mediaType}`, {
        method: 'PUT',
        body: { tagIds },
    });
    return result.tags;
}
// MARK: Stats
export function stats(year) {
    return request(`/v1/stats${year ? `?year=${year}` : ''}`);
}
// MARK: Lists
export function lists() {
    return request('/v1/lists');
}
export async function createList(name, description) {
    const { list } = await request('/v1/lists', {
        method: 'POST',
        body: { name, description: description ?? null },
    });
    return list;
}
export function listDetail(id) {
    return request(`/v1/lists/${id}`);
}
export async function updateList(id, patch) {
    const { list } = await request(`/v1/lists/${id}`, {
        method: 'PATCH',
        body: patch,
    });
    return list;
}
export function deleteList(id) {
    return request(`/v1/lists/${id}`, { method: 'DELETE' });
}
export function addListItem(id, mediaType, tmdbId, note) {
    return request(`/v1/lists/${id}/items`, {
        method: 'POST',
        body: { mediaType, tmdbId, note: note ?? null },
    });
}
export function removeListItem(id, mediaType, tmdbId) {
    return request(`/v1/lists/${id}/items/${tmdbId}?mediaType=${mediaType}`, { method: 'DELETE' });
}
export function voteOn(listId, itemId, vote) {
    return request(`/v1/lists/${listId}/items/${itemId}/vote`, { method: 'PUT', body: { vote } });
}
export function clearVote(listId, itemId) {
    return request(`/v1/lists/${listId}/items/${itemId}/vote`, { method: 'DELETE' });
}
export async function listMembers(id) {
    const { members } = await request(`/v1/lists/${id}/members`);
    return members;
}
export function invite(id, handle, role) {
    return request(`/v1/lists/${id}/members`, { method: 'POST', body: { handle, role } });
}
export function setMemberRole(id, userId, role) {
    return request(`/v1/lists/${id}/members/${userId}`, { method: 'PATCH', body: { role } });
}
export function removeMember(id, userId) {
    return request(`/v1/lists/${id}/members/${userId}`, { method: 'DELETE' });
}
export async function mintShareCode(id) {
    const result = await request(`/v1/lists/${id}/share-code`, { method: 'POST' });
    return result.shareCode;
}
export function revokeShareCode(id) {
    return request(`/v1/lists/${id}/share-code`, { method: 'DELETE' });
}
export function redeemShareCode(code) {
    return request(`/v1/lists/redeem/${encodeURIComponent(code)}`, { method: 'POST' });
}
// MARK: Notifications
export function notifications(limit = 50) {
    return request(`/v1/notifications?limit=${limit}`);
}
export function markNotificationsRead(ids) {
    return request('/v1/notifications/read', { method: 'POST', body: ids ? { ids } : {} });
}
// MARK: Export
export function exportLibrary() {
    return request('/v1/export');
}
