/**
 * Profile: statistics, your ratings, your tags, shared-list activity, and the
 * account itself. A sub-nav rather than five tabs, matching the app.
 */
import * as api from '../api.js';
import { APP_VERSION } from '../version.js';
import { barList, chipRow, field, input, posterCard, progressBar, sectionHead, select, } from '../components.js';
import { busy, button, clear, confirmModal, el, empty, modal, spinner, toast } from '../dom.js';
import { formatDay, plural, regionName, scoreLabel, starsFor } from '../format.js';
import * as library from '../library.js';
import { emit, on } from '../store.js';
import { renderFeed } from '../feed.js';
import { openProfile } from '../people.js';
import { openTitle } from '../title.js';
let pane = 'stats';
let statsYear = null;
export function mount(root) {
    const nav = el('div', { class: 'stack' });
    const body = el('div');
    root.append(nav, body);
    const draw = () => {
        clear(nav);
        nav.append(chipRow([
            { value: 'stats', label: 'Stats' },
            { value: 'ratings', label: 'Ratings' },
            { value: 'tags', label: 'Tags' },
            { value: 'feed', label: 'Feed' },
            { value: 'activity', label: 'Activity' },
            { value: 'account', label: 'Account' },
        ], pane, (value) => {
            pane = value;
            draw();
        }));
        clear(body);
        if (pane === 'stats')
            void renderStats(body, draw);
        else if (pane === 'ratings')
            void renderRatings(body);
        else if (pane === 'tags')
            void renderTags(body, draw);
        else if (pane === 'feed')
            void renderFeedPane(body);
        else if (pane === 'activity')
            void renderActivity(body, draw);
        else
            renderAccount(body);
    };
    draw();
    return on('library', () => {
        if (pane === 'stats' || pane === 'ratings' || pane === 'tags')
            draw();
    });
}
function message(error) {
    return error instanceof Error ? error.message : 'Something went wrong';
}
// MARK: Stats
async function renderStats(body, redraw) {
    clear(body);
    body.append(spinner('Working out your numbers'));
    let stats;
    try {
        stats = await api.stats(statsYear);
    }
    catch (error) {
        clear(body);
        body.append(el('p', { class: 'error-note', text: message(error) }));
        return;
    }
    clear(body);
    const years = [
        { value: 0, label: 'All time' },
        ...stats.availableYears.map((year) => ({ value: year, label: String(year) })),
    ];
    body.append(chipRow(years, statsYear ?? 0, (value) => {
        statsYear = value === 0 ? null : value;
        redraw();
    }, 'secondary'));
    const totals = stats.selected;
    body.append(el('div', { class: 'stats-strip' }, [
        stat(String(totals.films), 'Films'),
        stat(String(totals.shows), 'Shows'),
        stat(String(totals.episodes), 'Episodes'),
        stat(String(totals.viewings), 'Viewings'),
        stat(`${totals.hoursWatched}`, 'Hours'),
        stat(stats.averageRating === null ? '—' : stats.averageRating.toFixed(1), 'Average score'),
    ]));
    if (totals.viewingsWithUnknownRuntime > 0) {
        body.append(el('p', {
            class: 'muted',
            text: `${plural(totals.viewingsWithUnknownRuntime, 'viewing')} had no runtime on TMDB and are not in the hours above.`,
        }));
    }
    if (stats.monthlyViewings) {
        const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        body.append(sectionHead('By month'), barList(stats.monthlyViewings.map((row) => ({
            label: names[row.month - 1] ?? String(row.month),
            value: row.viewings,
        }))));
    }
    if (stats.genres.length) {
        body.append(sectionHead('Genres', 'Share is of genre mentions, so a three-genre film counts in three.'), barList(stats.genres.slice(0, 10).map((genre) => ({
            label: genre.name,
            // The share, not the raw count: this chart is drawn against 100, so
            // a genre on 27% fills just over a quarter of the track instead of
            // all of it while its own label reads 27%.
            value: Math.round(genre.share * 100),
            caption: `${Math.round(genre.share * 100)}%`,
        })), { outOf: 100 }));
    }
    if (stats.topDirectors.length) {
        body.append(sectionHead('Directors and creators'), barList(stats.topDirectors.map((row) => ({ label: row.name, value: row.viewings }))));
    }
    if (stats.topActors.length) {
        body.append(sectionHead('Faces you keep seeing'), barList(stats.topActors.map((row) => ({ label: row.name, value: row.viewings }))));
    }
    if (stats.decades.length) {
        body.append(sectionHead('Decades'), barList(stats.decades.map((row) => ({ label: `${row.decade}s`, value: row.viewings }))));
    }
    if (stats.ratingDistribution.some((row) => row.count > 0)) {
        body.append(sectionHead('How you rate'), barList(stats.ratingDistribution.map((row) => ({
            label: starsFor(row.score),
            value: row.count,
        }))));
    }
    const runtime = stats.runtime;
    if (runtime.averageMinutes !== null || runtime.longest || runtime.shortest) {
        body.append(sectionHead('Runtime'), el('div', { class: 'stats-strip' }, [
            stat(runtime.averageMinutes === null ? '—' : `${Math.round(runtime.averageMinutes)}m`, 'Average'),
            stat(runtime.longest ? `${runtime.longest.minutes}m` : '—', runtime.longest?.title ?? 'Longest'),
            stat(runtime.shortest ? `${runtime.shortest.minutes}m` : '—', runtime.shortest?.title ?? 'Shortest'),
        ]));
    }
    const streaks = stats.streaks;
    if (streaks.activeDays > 0) {
        body.append(sectionHead('Habits', streakNote(stats)), el('div', { class: 'stats-strip' }, [
            stat(String(streaks.longestDays), 'Longest streak'),
            stat(String(streaks.activeDays), 'Days watching'),
            stat(streaks.busiestDay ? String(streaks.busiestDay.viewings) : '—', streaks.busiestDay ? `Most on ${formatDay(streaks.busiestDay.date)}` : 'Busiest day'),
            stat(String(stats.firstTimeVsRewatch.firstTime), 'First time'),
            stat(String(stats.firstTimeVsRewatch.rewatches), 'Rewatches'),
        ]));
        const span = streakSpan(stats);
        if (span) {
            body.append(el('p', { class: 'muted small', text: `Longest run: ${span}.` }));
        }
    }
    if (stats.mostRewatched.length > 0) {
        body.append(sectionHead('Go back to most'), barList(stats.mostRewatched.map((row) => ({ label: row.title, value: row.viewings })), { format: (value) => `${value}×` }));
    }
    if (stats.allTime.viewings === 0) {
        body.append(empty('Log something and this page fills in.'));
    }
}
/**
 * The line under "Habits": how this year compares with the one before it.
 *
 * Absent for all time and for a first year, because there is nothing to
 * compare against and inventing a baseline of zero would report an infinite
 * increase.
 */
function streakNote(stats) {
    const previous = stats.previousYear;
    if (!previous)
        return null;
    if (previous.viewingsChange === null) {
        return `${previous.year}: ${plural(previous.viewings, 'viewing')}.`;
    }
    const percent = Math.abs(Math.round(previous.viewingsChange * 100));
    if (percent === 0)
        return `Level with ${previous.year}.`;
    const direction = previous.viewingsChange > 0 ? 'more than' : 'fewer than';
    return `${percent}% ${direction} ${previous.year} (${plural(previous.viewings, 'viewing')}).`;
}
/**
 * The longest streak's dates, when it is long enough to be worth naming.
 *
 * A two-day run is not a story, and "your longest streak was 1 day" reads as an
 * accusation rather than a statistic.
 */
function streakSpan(stats) {
    const { longestDays, longestFrom, longestTo } = stats.streaks;
    if (longestDays < 3 || !longestFrom || !longestTo)
        return null;
    return `${formatDay(longestFrom)} – ${formatDay(longestTo)}`;
}
function stat(value, label) {
    return el('div', { class: 'stat' }, [
        el('div', { class: 'num', text: value }),
        el('div', { class: 'lbl', text: label }),
    ]);
}
// MARK: Ratings
async function renderRatings(body) {
    clear(body);
    body.append(spinner('Loading your ratings'));
    try {
        const ratings = await library.getRatings();
        clear(body);
        if (ratings.length === 0) {
            body.append(empty('Nothing rated yet.'));
            return;
        }
        const sorted = [...ratings].sort((a, b) => b.score - a.score || (a.movie?.title ?? '').localeCompare(b.movie?.title ?? ''));
        body.append(el('p', { class: 'muted count', text: plural(sorted.length, 'rating') }));
        body.append(el('div', { class: 'poster-grid' }, sorted.map((rating) => {
            const movie = rating.movie;
            if (!movie) {
                return el('div', { class: 'poster-card' }, [el('span', { text: `#${rating.tmdbId}` })]);
            }
            return el('div', { class: 'rated-card' }, [
                posterCard(movie, openTitle, starsFor(rating.score)),
                rating.review ? el('p', { class: 'wl-note', text: rating.review }) : null,
                el('p', { class: 'muted small', text: scoreLabel(rating.score) }),
            ]);
        })));
    }
    catch (error) {
        clear(body);
        body.append(el('p', { class: 'error-note', text: message(error) }));
    }
}
// MARK: Tags
async function renderTags(body, redraw) {
    clear(body);
    body.append(spinner('Loading your tags'));
    try {
        const tags = await library.getTags();
        clear(body);
        const name = input('text', { placeholder: 'New tag', maxlength: 40 });
        const add = button('Add tag', () => void busy(add, async () => {
            const value = name.value.trim();
            if (!value)
                return;
            try {
                await api.createTag(value);
                library.invalidate(['tags']);
                redraw();
            }
            catch (error) {
                toast(message(error), 'error');
            }
        }), 'primary');
        body.append(el('div', { class: 'inline-form' }, [name, add]));
        if (tags.length === 0) {
            body.append(empty('No tags yet. Tags are yours alone — nobody else sees them.'));
            return;
        }
        const rows = tags.map((tag) => {
            const rename = button('Rename', () => {
                const next = input('text', { value: tag.name, maxlength: 40 });
                const save = button('Save', () => void busy(save, async () => {
                    try {
                        await api.renameTag(tag.id, next.value.trim());
                        library.invalidate(['tags']);
                        redraw();
                        close();
                    }
                    catch (error) {
                        toast(message(error), 'error');
                    }
                }), 'primary');
                const close = modal({
                    title: 'Rename tag',
                    body: el('div', { class: 'form' }, [field('Name', next)]),
                    actions: [button('Cancel', () => close()), save],
                });
            }, 'ghost small');
            const remove = button('Delete', () => void busy(remove, async () => {
                if (!(await confirmModal({
                    title: 'Delete tag',
                    message: `Delete “${tag.name}”? It comes off every title it is on.`,
                    confirmLabel: 'Delete',
                    destructive: true,
                }))) {
                    return;
                }
                try {
                    await api.deleteTag(tag.id);
                    library.invalidate(['tags']);
                    redraw();
                }
                catch (error) {
                    toast(message(error), 'error');
                }
            }), 'ghost small danger');
            return el('div', { class: 'member-row' }, [
                el('strong', { text: tag.name }),
                el('span', { class: 'row-actions' }, [rename, remove]),
            ]);
        });
        body.append(el('div', { class: 'stack' }, rows));
    }
    catch (error) {
        clear(body);
        body.append(el('p', { class: 'error-note', text: message(error) }));
    }
}
// MARK: Activity
async function renderActivity(body, redraw) {
    clear(body);
    body.append(spinner('Loading activity'));
    try {
        const { notifications, unread } = await api.notifications();
        clear(body);
        const markAll = button('Mark all read', () => void busy(markAll, async () => {
            try {
                await api.markNotificationsRead();
                emit('notifications');
                redraw();
            }
            catch (error) {
                toast(message(error), 'error');
            }
        }), 'ghost');
        body.append(sectionHead('Activity', unread ? `${unread} unread` : 'All caught up', markAll));
        if (notifications.length === 0) {
            body.append(empty('Nothing yet. Shared-list activity and release dates show up here.'));
            return;
        }
        body.append(el('div', { class: 'stack' }, notifications.map((item) => el('div', { class: `notice${item.readAt ? '' : ' unread'}` }, [
            el('p', { text: describeNotification(item) }),
            el('p', { class: 'muted small', text: new Date(item.createdAt).toLocaleString() }),
        ]))));
    }
    catch (error) {
        clear(body);
        body.append(el('p', { class: 'error-note', text: message(error) }));
    }
}
/**
 * One sentence per notification.
 *
 * The kind is a bare string, not a union, so a server that learns a new kind
 * before this client does renders a plain row instead of failing the inbox.
 *
 * Release and airing events have no actor: they are facts about the world, not
 * about a person, so their sentences do not name one.
 */
function describeNotification(item) {
    const who = item.actor?.displayName ?? (item.actor ? `@${item.actor.handle}` : 'Someone');
    const list = item.listName ?? 'a list';
    const title = item.titleName ?? 'something';
    switch (item.kind) {
        case 'list_item_added':
            return `${who} added ${title} to ${list}`;
        case 'list_item_vote':
            return `${who} voted on ${title} in ${list}`;
        case 'release_today':
            return `${title} is out today`;
        case 'episode_airing':
            return `A new episode of ${title} has aired`;
        case 'new_follower':
            return `${who} started following you`;
        default:
            return `Something happened with ${title}`;
    }
}
// MARK: Feed
/**
 * The feed, plus the one control that makes it possible to be found: a box to
 * follow somebody by handle.
 *
 * Handles are already the public identifier — they are how a list gets shared —
 * so there is nothing new to learn here.
 */
async function renderFeedPane(body) {
    clear(body);
    const handle = input('text', { placeholder: 'handle', maxlength: 30 });
    const go = button('Follow', () => void busy(go, async () => {
        const wanted = handle.value.trim().toLowerCase().replace(/^@/, '');
        if (!wanted) {
            toast('Type a handle first', 'error');
            return;
        }
        try {
            await api.follow(wanted);
            handle.value = '';
            toast(`Following @${wanted}`);
            await renderFeedPane(body);
        }
        catch (error) {
            toast(message(error), 'error');
        }
    }), 'ghost');
    const list = el('div');
    body.append(el('div', { class: 'form' }, [
        field('Follow someone', handle, 'Their handle, without the @.'),
        el('div', { class: 'row-actions' }, [go, button('Who I follow', () => void openFollows(), 'ghost')]),
    ]), list);
    await renderFeed(list);
}
/** The two lists, in a sheet: nobody needs them on screen all the time. */
async function openFollows() {
    const body = el('div', { class: 'stack' }, [spinner('Loading')]);
    modal({ title: 'People', body });
    try {
        const { following, followers } = await api.follows();
        clear(body);
        body.append(sectionHead('You follow', plural(following.length, 'person', 'people')), following.length
            ? el('div', { class: 'stack' }, following.map(personRow))
            : el('p', { class: 'muted', text: 'Nobody yet.' }), sectionHead('Following you', plural(followers.length, 'person', 'people')), followers.length
            ? el('div', { class: 'stack' }, followers.map(personRow))
            : el('p', { class: 'muted', text: 'Nobody yet.' }));
    }
    catch (error) {
        clear(body);
        body.append(el('p', { class: 'error-note', text: message(error) }));
    }
}
function personRow(user) {
    const row = el('button', { class: 'credit-row', type: 'button' }, [
        el('div', { class: 'credit-body' }, [
            el('span', { class: 'credit-title', text: user.displayName?.trim() || `@${user.handle}` }),
            el('span', { class: 'muted small', text: `@${user.handle}` }),
        ]),
    ]);
    row.addEventListener('click', () => openProfile(user.handle));
    return row;
}
// MARK: Import
/**
 * Bring a library in from somewhere else.
 *
 * Reads the file in the browser and posts its text, rather than a multipart
 * upload: the API speaks JSON everywhere else, and a CSV is text — adding a
 * second body format to the server for one endpoint would be the larger change.
 *
 * The server answers with a job rather than a result, because resolving
 * hundreds of titles against TMDB takes minutes. This polls it.
 */
function importBlock() {
    const status = el('div', { class: 'stack' });
    const picker = el('input', {
        type: 'file',
        // .txt included because browsers and mail clients rename CSVs, and the
        // parser does not care what the extension says.
        accept: '.csv,text/csv,text/plain',
        class: 'input',
    });
    const upload = button('Import file', () => void busy(upload, async () => {
        const file = picker.files?.[0];
        if (!file) {
            toast('Choose a CSV file first', 'error');
            return;
        }
        try {
            const job = await api.startImport(await file.text(), file.name);
            await follow(job.id, status);
            // Everything an import writes is something the cached library shows.
            library.invalidate();
        }
        catch (error) {
            clear(status);
            status.append(el('p', { class: 'error-note', text: message(error) }));
        }
    }), 'primary');
    return el('div', { class: 'form' }, [
        sectionHead('Import', 'A Letterboxd export works as is — watched.csv, diary.csv, ratings.csv or watchlist.csv.'),
        field('CSV file', picker),
        el('div', { class: 'row-actions' }, [upload]),
        status,
    ]);
}
/** Polls a running import until it stops, drawing progress as it goes. */
async function follow(jobId, host) {
    // Two seconds: fast enough that a small file feels immediate, slow enough
    // that a twenty-minute run is not a few hundred requests.
    const POLL_MS = 2000;
    for (;;) {
        const job = await api.importJob(jobId);
        clear(host);
        host.append(renderJob(job));
        if (job.status !== 'running')
            return;
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
}
function renderJob(job) {
    if (job.status === 'failed') {
        return el('p', {
            class: 'error-note',
            text: job.error ?? 'The import stopped before it finished.',
        });
    }
    const block = el('div', { class: 'stack' });
    // The bar belongs to the waiting, not to the result. Left up at 100% beside
    // "Imported 731 entries", it invites the reader to work out whether the two
    // numbers agree — and they measure different things, so they do not.
    if (job.status === 'running') {
        const done = job.total === 0 ? 0 : job.processed / job.total;
        block.append(progressBar(done, `${job.processed}/${job.total}`, `Import progress: ${job.processed} of ${plural(job.total, 'row')} processed`), el('p', { class: 'muted', text: 'Matching titles against TMDB…' }));
        return block;
    }
    block.append(el('p', {
        text: `Imported ${plural(job.imported, 'entry', 'entries')} across ${plural(job.matched, 'film')}.`,
    }));
    if (job.skipped > 0) {
        block.append(el('p', { class: 'muted small', text: `${plural(job.skipped, 'line')} had no title.` }));
    }
    // Listed, not counted. A user who has just handed over a decade of viewings
    // deserves to know exactly which ones did not arrive.
    if (job.unmatched.length > 0) {
        const list = el('details', { class: 'unmatched' }, [
            el('summary', { text: `${plural(job.unmatched.length, 'title')} not found on TMDB` }),
            el('ul', {}, job.unmatched.map((entry) => el('li', { text: entry.year ? `${entry.title} (${entry.year})` : entry.title }))),
        ]);
        block.append(list);
    }
    return block;
}
// MARK: Account
/**
 * The countries offered in the region picker.
 *
 * Deliberately not the full ISO 3166 list. TMDB's provider coverage is thin
 * outside these markets, and a picker with 250 entries mostly answering "no
 * services found" would be a worse answer than a short one that works. The
 * server accepts any valid two-letter code, so nothing here is a hard limit.
 */
const REGION_CODES = [
    'AR', 'AT', 'AU', 'BE', 'BR', 'CA', 'CH', 'CL', 'CO', 'CZ', 'DE', 'DK', 'EE',
    'ES', 'FI', 'FR', 'GB', 'GR', 'HK', 'HU', 'ID', 'IE', 'IL', 'IN', 'IT', 'JP',
    'KR', 'LT', 'LV', 'MX', 'MY', 'NL', 'NO', 'NZ', 'PE', 'PH', 'PL', 'PT', 'RO',
    'SE', 'SG', 'SK', 'TH', 'TR', 'TW', 'US', 'VE', 'ZA',
];
const REGIONS = REGION_CODES.map((code) => ({ value: code, label: regionName(code) })).sort((a, b) => a.label.localeCompare(b.label));
function renderAccount(body) {
    clear(body);
    const user = api.currentUser();
    if (!user)
        return;
    const displayName = input('text', { value: user.displayName ?? '', maxlength: 60 });
    const handle = input('text', { value: user.handle, maxlength: 30 });
    const region = select(REGIONS, user.region);
    const sharing = el('input', { type: 'checkbox' });
    sharing.checked = user.activityVisibility === 'followers';
    const save = button('Save profile', () => void busy(save, async () => {
        try {
            await api.updateMe({
                displayName: displayName.value.trim(),
                handle: handle.value.trim().toLowerCase(),
                region: region.value,
                activityVisibility: sharing.checked ? 'followers' : 'private',
            });
            emit('profile');
            // Availability is answered per country, so a region change invalidates
            // every provider strip the client is holding.
            library.invalidate(['watchlist']);
            toast('Profile saved');
        }
        catch (error) {
            toast(message(error), 'error');
        }
    }), 'primary');
    const exportButton = button('Export library', () => void busy(exportButton, async () => {
        try {
            const data = await api.exportLibrary();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = el('a', { href: url, download: 'movietracker-library.json' });
            document.body.append(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            toast('Library downloaded');
        }
        catch (error) {
            toast(message(error), 'error');
        }
    }), 'ghost');
    const refreshApp = button('Refresh app files', () => void busy(refreshApp, async () => {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
        const registrations = await navigator.serviceWorker?.getRegistrations();
        await Promise.all((registrations ?? []).map((registration) => registration.unregister()));
        location.reload();
    }), 'ghost');
    const signOut = button('Sign out', () => void busy(signOut, async () => {
        if (!(await confirmModal({
            title: 'Sign out',
            message: 'Sign out on this device? Your other devices stay signed in.',
            confirmLabel: 'Sign out',
        }))) {
            return;
        }
        await api.logout();
        library.forget();
        location.reload();
    }), 'ghost danger');
    body.append(el('div', { class: 'form' }, [
        field('Display name', displayName),
        field('Handle', handle, 'Lowercase letters, numbers and underscores. People invite you by this.'),
        field('Country', region, 'Decides whose streaming availability the app shows you.'),
        el('label', { class: 'checkline' }, [
            sharing,
            el('span', { text: 'Let people who follow me see what I watch' }),
        ]),
        el('p', {
            class: 'muted small',
            // Said plainly, because following needs no approval: switching this on
            // means anybody who looks you up can read your diary.
            text: 'Off by default. Anyone can follow you without asking, so this makes your viewing readable by anyone who looks up your handle.',
        }),
        el('p', { class: 'muted', text: user.email ? `Signed in as ${user.email}` : 'Signed in' }),
        el('div', { class: 'row-actions' }, [save]),
    ]), sectionHead('Your data'), el('div', { class: 'row-actions' }, [exportButton]), importBlock(), sectionHead('App'), el('p', { class: 'muted', text: `Version ${APP_VERSION} · API ${api.apiBase()}` }), el('div', { class: 'row-actions' }, [refreshApp, signOut]));
}
