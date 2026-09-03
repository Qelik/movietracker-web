/** Watchlist: what you mean to watch, ordered by how much you mean it. */
import * as api from '../api.js';
import { chipRow, field, input, posterCard, progressBar, sectionHead, select, } from '../components.js';
import { add, busy, button, clear, confirmModal, el, empty, modal, spinner, toast } from '../dom.js';
import { formatDay, formatRuntime, plural, posterUrl, today } from '../format.js';
import * as library from '../library.js';
import { on } from '../store.js';
import { openTitle } from '../title.js';
const PRIORITIES = ['Someday', 'High', 'Next up'];
let filter = 'all';
/**
 * TMDB provider id, or null for "any service". Filtering happens in the
 * browser because every row already carries its own availability — asking the
 * server again would re-download the same list to show a subset of it.
 */
let providerFilter = null;
export function mount(root) {
    // Up next sits above the watchlist: it answers the same question and needs no
    // deciding, because the show is already chosen.
    const upNext = el('div');
    const controls = el('div', { class: 'stack' });
    // Its own node so a redraw replaces the picker instead of stacking another
    // copy of it under the filter chips.
    const services = el('div');
    const body = el('div');
    root.append(upNext, controls, services, body);
    const draw = () => {
        clear(controls);
        void loadUpNext(upNext);
        controls.append(chipRow([
            { value: 'all', label: 'Everything' },
            { value: 'movie', label: 'Films' },
            { value: 'tv', label: 'Shows' },
            { value: 'next', label: 'Next up' },
        ], filter, (value) => {
            filter = value;
            draw();
        }));
        void load(body, services, draw);
    };
    draw();
    return on('library', () => {
        void loadUpNext(upNext);
        void load(body, services, draw);
    });
}
async function load(body, services, redraw) {
    clear(body);
    body.append(spinner('Loading your watchlist'));
    try {
        const items = await library.getWatchlist();
        const byMedia = items.filter((item) => {
            if (filter === 'all')
                return true;
            if (filter === 'next')
                return item.priority === 2;
            return item.mediaType === filter;
        });
        // The service picker is built from what is actually on the list, so it
        // never offers a service that would return nothing.
        clear(services);
        const picker = servicePicker(byMedia, redraw);
        if (picker)
            services.append(picker);
        const shown = providerFilter === null
            ? byMedia
            : byMedia.filter((item) => item.watchProviders?.subscription.some((provider) => provider.providerId === providerFilter));
        // Titles nobody has looked up yet cannot be filtered honestly, so they are
        // counted out loud rather than dropped in silence.
        const unchecked = providerFilter === null
            ? 0
            : byMedia.filter((item) => item.watchProviders === null).length;
        clear(body);
        if (shown.length === 0) {
            body.append(empty(items.length === 0
                ? 'Your watchlist is empty. Find something on Discover and add it.'
                : 'Nothing under that filter.'));
            if (unchecked > 0)
                body.append(uncheckedNote(unchecked));
            return;
        }
        body.append(el('p', { class: 'muted count', text: plural(shown.length, 'title') }), el('div', { class: 'poster-grid' }, shown.map((item) => card(item, redraw))));
        if (unchecked > 0)
            body.append(uncheckedNote(unchecked));
    }
    catch (error) {
        clear(body);
        body.append(el('p', { class: 'error-note', text: message(error) }));
    }
}
/**
 * "On a service I have". Only subscription providers are offered: a filter that
 * also matched rent and buy would answer a different question than the one the
 * label asks.
 */
function servicePicker(items, redraw) {
    const services = new Map();
    for (const item of items) {
        for (const provider of item.watchProviders?.subscription ?? []) {
            services.set(provider.providerId, provider.name);
        }
    }
    if (services.size === 0)
        return null;
    const options = [
        { value: '', label: 'Any service' },
        ...[...services.entries()]
            .sort((a, b) => a[1].localeCompare(b[1]))
            .map(([id, name]) => ({ value: String(id), label: name })),
    ];
    const picker = select(options, providerFilter === null ? '' : String(providerFilter));
    picker.addEventListener('change', () => {
        providerFilter = picker.value === '' ? null : Number(picker.value);
        redraw();
    });
    return el('div', { class: 'inline-field' }, [field('Streaming on', picker)]);
}
function uncheckedNote(count) {
    return el('p', {
        class: 'muted',
        text: `${plural(count, 'title')} not checked for availability yet — open one to look it up.`,
    });
}
/**
 * "Up next": one row per show you have started, with the episode to play.
 *
 * Rendered above the watchlist because it answers the same question and needs
 * no deciding — the show is already chosen, and the only thing standing between
 * you and it was remembering where you had got to.
 *
 * Silent on failure. This is a convenience strip above the screen the user
 * actually asked for, and an error banner here would blame the watchlist for
 * something that is not wrong with it.
 */
async function loadUpNext(host) {
    let shows;
    try {
        shows = await api.upNext();
    }
    catch {
        clear(host);
        return;
    }
    clear(host);
    if (shows.length === 0)
        return;
    host.append(el('section', { class: 'up-next' }, [
        sectionHead('Up next', plural(shows.length, 'show')),
        el('div', { class: 'up-next-rail' }, shows.map(upNextCard)),
    ]));
}
function upNextCard(show) {
    const poster = posterUrl(show.posterPath, 'w185');
    const code = `S${show.next.seasonNumber}E${show.next.episodeNumber}`;
    const facts = [code];
    if (show.next.name)
        facts.push(show.next.name);
    const tail = [];
    const runtime = formatRuntime(show.next.runtimeMinutes);
    if (runtime)
        tail.push(runtime);
    if (show.status === 'upcoming' && show.next.airDate) {
        tail.push(`Airs ${formatDay(show.next.airDate)}`);
    }
    else if (show.remaining > 0) {
        tail.push(`${show.remaining} more after this`);
    }
    const card = el('div', { class: 'up-next-card' }, [
        poster
            ? el('img', { class: 'up-next-poster', src: poster, alt: '', loading: 'lazy' })
            : el('div', { class: 'up-next-poster placeholder', 'aria-hidden': 'true' }, ['📺']),
        el('div', { class: 'up-next-body' }, [
            el('span', { class: 'up-next-title', text: show.title }),
            el('span', { class: 'muted small', text: facts.join(' · ') }),
            tail.length ? el('span', { class: 'muted small', text: tail.join(' · ') }) : null,
            showProgress(show),
        ]),
    ]);
    const open = button('Details', () => openTitle({ mediaType: 'tv', tmdbId: show.tmdbId, title: show.title }), 'ghost small');
    // Only offered for an episode that exists to be watched. A "watched" button
    // on something that has not aired invites a log that is simply untrue.
    const watched = button(`Watched ${code}`, () => void busy(watched, async () => {
        try {
            await api.logViewing({
                mediaType: 'tv',
                tmdbId: show.tmdbId,
                seasonNumber: show.next.seasonNumber,
                episodeNumber: show.next.episodeNumber,
                watchedOn: today(),
            });
            // Logging an episode moves the show on, so the rail itself is stale.
            library.invalidate(['diary']);
            toast(`Logged ${code}`);
        }
        catch (error) {
            toast(message(error), 'error');
        }
    }), 'primary small');
    card.append(el('div', { class: 'row-actions' }, [show.status === 'ready' ? watched : null, open]));
    return card;
}
/**
 * How far through the show you are.
 *
 * Measured against episodes that have aired, not the whole run. A show that has
 * announced two more seasons is not one you are 45% through when you have seen
 * every episode that exists — and the card already says "1 more after this"
 * counting the same way, so using the full run here put two different
 * denominators side by side on one card.
 */
function showProgress(show) {
    const aired = show.airedEpisodes;
    const done = aired === 0 ? 0 : show.watchedEpisodes / aired;
    return progressBar(done, `${show.watchedEpisodes}/${aired}`, `${show.title}: ${show.watchedEpisodes} of ${plural(aired, 'aired episode')} watched`);
}
function message(error) {
    return error instanceof Error ? error.message : 'Something went wrong';
}
function card(item, redraw) {
    const movie = item.movie;
    const holder = el('div', { class: 'wl-card' });
    if (movie) {
        holder.append(posterCard(movie, openTitle, item.priority === 2 ? 'Next up' : null));
    }
    else {
        holder.append(el('div', { class: 'poster-card' }, [el('span', { text: `#${item.tmdbId}` })]));
    }
    const log = button('Log', () => void busy(log, async () => {
        if (item.mediaType === 'tv') {
            // A show needs an episode, which the sheet asks for.
            openTitle({ mediaType: item.mediaType, tmdbId: item.tmdbId, title: movie?.title });
            return;
        }
        try {
            await api.logViewing({ mediaType: 'movie', tmdbId: item.tmdbId, watchedOn: today() });
            await api.removeFromWatchlist(item.mediaType, item.tmdbId);
            library.invalidate(['diary', 'watchlist']);
            toast(`Logged ${movie?.title ?? 'it'} and cleared it from your watchlist`);
            redraw();
        }
        catch (error) {
            toast(message(error), 'error');
        }
    }), 'ghost small');
    const edit = button('Edit', () => openEdit(item, redraw), 'ghost small');
    const remove = button('Remove', () => void busy(remove, async () => {
        if (!(await confirmModal({
            title: 'Remove from watchlist',
            message: `Take ${movie?.title ?? 'this title'} off your watchlist?`,
            confirmLabel: 'Remove',
            destructive: true,
        }))) {
            return;
        }
        try {
            await api.removeFromWatchlist(item.mediaType, item.tmdbId);
            library.invalidate(['watchlist']);
            redraw();
        }
        catch (error) {
            toast(message(error), 'error');
        }
    }), 'ghost small danger');
    add(holder, item.note ? el('p', { class: 'wl-note', text: item.note }) : null, el('div', { class: 'row-actions' }, [log, edit, remove]));
    return holder;
}
function openEdit(item, redraw) {
    const note = input('text', { value: item.note ?? '', maxlength: 500, placeholder: 'Why this one?' });
    const priority = select(PRIORITIES.map((label, index) => ({ value: String(index), label })), String(item.priority));
    const save = button('Save', () => void busy(save, async () => {
        try {
            await api.updateWatchlist(item.mediaType, item.tmdbId, {
                note: note.value.trim() || null,
                priority: Number(priority.value),
            });
            library.invalidate(['watchlist']);
            redraw();
            close();
        }
        catch (error) {
            toast(message(error), 'error');
        }
    }), 'primary');
    const close = modal({
        title: item.movie?.title ?? 'Watchlist item',
        body: el('div', { class: 'form' }, [field('Note', note), field('Priority', priority)]),
        actions: [button('Cancel', () => close()), save],
    });
}
