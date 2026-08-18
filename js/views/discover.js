/**
 * Discover: For You, Trending, Popular and genre browsing, plus search.
 *
 * Search is not a tab of its own — it takes over the results area from the
 * header's search box, the same way the iOS app presents it over whatever you
 * were looking at.
 */
import * as api from '../api.js';
import { chipRow, posterGrid, sectionHead } from '../components.js';
import { button, clear, el, empty, spinner, toast } from '../dom.js';
import * as library from '../library.js';
import { on } from '../store.js';
import { openTitle } from '../title.js';
let rail = 'for-you';
let media = 'all';
let genreId = null;
let genreCache = null;
export function mount(root) {
    const controls = el('div', { class: 'stack' });
    const results = el('div', { class: 'results' });
    root.append(controls, results);
    const draw = () => {
        clear(controls);
        controls.append(chipRow([
            { value: 'for-you', label: 'For you' },
            { value: 'trending', label: 'Trending' },
            { value: 'popular', label: 'Popular' },
            { value: 'genres', label: 'Genres' },
        ], rail, (value) => {
            rail = value;
            draw();
        }), chipRow([
            { value: 'all', label: 'Everything' },
            { value: 'movie', label: 'Films' },
            { value: 'tv', label: 'Shows' },
        ], media, (value) => {
            media = value;
            draw();
        }, 'secondary'));
        if (rail === 'genres')
            controls.append(genrePicker(draw));
        void load(results);
    };
    draw();
    return on('library', () => void load(results));
}
function genrePicker(redraw) {
    const holder = el('div', { class: 'chip-row wrap' });
    const paint = (genres) => {
        clear(holder);
        holder.append(chipRow(genres.map((genre) => ({ value: genre.id, label: genre.name })), genreId ?? genres[0]?.id ?? 0, (value) => {
            genreId = value;
            redraw();
        }, 'wrap'));
    };
    if (genreCache) {
        paint(genreCache);
    }
    else {
        holder.append(spinner('Loading genres'));
        void api
            .genres()
            .then((genres) => {
            genreCache = genres;
            genreId ??= genres[0]?.id ?? null;
            paint(genres);
            redraw();
        })
            .catch((error) => {
            clear(holder);
            holder.append(el('p', { class: 'error-note', text: message(error) }));
        });
    }
    return holder;
}
function message(error) {
    return error instanceof Error ? error.message : 'Something went wrong';
}
async function load(results) {
    clear(results);
    results.append(spinner('Loading'));
    try {
        let movies = [];
        let note = null;
        if (rail === 'for-you') {
            const response = await api.forYou(media);
            movies = response.results;
            note = response.reason;
        }
        else if (rail === 'trending') {
            movies = await api.trending(media);
        }
        else if (rail === 'popular') {
            movies = await api.popular(media);
        }
        else if (genreId !== null) {
            movies = await api.byGenre(genreId, media);
        }
        const [watched, queued] = await Promise.all([library.watchedKeys(), library.watchlistKeys()]);
        clear(results);
        if (note)
            results.append(sectionHead(headingFor(), note));
        if (movies.length === 0) {
            results.append(empty('Nothing here yet.'));
            return;
        }
        results.append(posterGrid(movies, openTitle, (movie) => {
            const key = library.key(movie.mediaType, movie.tmdbId);
            if (watched.has(key))
                return 'Seen';
            if (queued.has(key))
                return 'Queued';
            return null;
        }));
    }
    catch (error) {
        clear(results);
        results.append(el('p', { class: 'error-note', text: message(error) }));
    }
}
function headingFor() {
    if (rail === 'for-you')
        return 'For you';
    if (rail === 'trending')
        return 'Trending';
    if (rail === 'popular')
        return 'Popular';
    return 'By genre';
}
/** The header search box renders into the Discover view. */
export function mountSearch(root, query) {
    const results = el('div', { class: 'results' });
    root.append(sectionHead(`Results for “${query}”`, null, button('Clear search', () => {
        window.dispatchEvent(new CustomEvent('mt:clear-search'));
    })), results);
    const controller = new AbortController();
    results.append(spinner('Searching'));
    void (async () => {
        try {
            const [page, watched, queued] = await Promise.all([
                api.search(query, 1, controller.signal),
                library.watchedKeys(),
                library.watchlistKeys(),
            ]);
            clear(results);
            if (page.results.length === 0) {
                results.append(empty(`Nothing matched “${query}”.`));
                return;
            }
            results.append(posterGrid(page.results, openTitle, (movie) => {
                const key = library.key(movie.mediaType, movie.tmdbId);
                if (watched.has(key))
                    return 'Seen';
                if (queued.has(key))
                    return 'Queued';
                return null;
            }));
            if (page.totalPages > 1) {
                let page_ = 1;
                const more = button('Load more', () => {
                    page_ += 1;
                    more.disabled = true;
                    void api
                        .search(query, page_)
                        .then((next) => {
                        results.append(posterGrid(next.results, openTitle));
                        more.disabled = page_ >= next.totalPages;
                    })
                        .catch((error) => toast(message(error), 'error'));
                }, 'ghost');
                root.append(el('div', { class: 'centre' }, [more]));
            }
        }
        catch (error) {
            if (controller.signal.aborted)
                return;
            clear(results);
            results.append(el('p', { class: 'error-note', text: message(error) }));
        }
    })();
    return () => controller.abort();
}
