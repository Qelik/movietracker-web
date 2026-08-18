/**
 * The film / show sheet.
 *
 * Everything you can do to one title lives here: watchlist, viewings, rating,
 * review, tags, lists, seasons and what to watch next. Opened from every screen
 * in the app, so it takes only an id and loads the rest itself.
 */
import * as api from './api.js';
import { add, button, busy, clear, confirmModal, el, modal, spinner, toast } from './dom.js';
import { field, input, posterCard, select, textarea } from './components.js';
import { backdropUrl, formatDay, formatRuntime, mediaLabel, plural, posterUrl, scoreLabel, starsFor, today, } from './format.js';
import * as library from './library.js';
/** Opens the sheet. Safe to call from inside another sheet — dialogs stack. */
export function openTitle(ref) {
    const body = el('div', { class: 'title-sheet' }, [spinner('Loading title')]);
    const close = modal({ title: ref.title ?? 'Title', body, wide: true });
    void render(body, ref, close);
}
async function render(body, ref, close) {
    let detail;
    let state;
    let allTags;
    let titleTags;
    try {
        ;
        [detail, state, allTags, titleTags] = await Promise.all([
            api.titleDetail(ref.mediaType, ref.tmdbId),
            library.stateFor(ref.mediaType, ref.tmdbId),
            library.getTags(),
            api.tagsFor(ref.mediaType, ref.tmdbId),
        ]);
    }
    catch (error) {
        clear(body);
        body.append(el('p', { class: 'error-note', text: describe(error) }));
        return;
    }
    const redraw = async () => {
        state = await library.stateFor(detail.mediaType, detail.tmdbId);
        titleTags = await api.tagsFor(detail.mediaType, detail.tmdbId);
        allTags = await library.getTags();
        paint();
    };
    const paint = () => {
        clear(body);
        add(body, heroFor(detail), actionsFor(detail, state, redraw, close), ratingBlock(detail, state, redraw), viewingsBlock(detail, state, redraw), detail.mediaType === 'tv' && detail.seasons.length > 0 ? seasonsBlock(detail, redraw) : null, tagsBlock(detail, allTags, titleTags, redraw), castBlock(detail), 
        // Films only: /movies/:id/similar is a film endpoint, and a show's id
        // passed to it answers about an unrelated film with the same number.
        detail.mediaType === 'movie' ? similarBlock(detail) : null);
    };
    paint();
}
function describe(error) {
    return error instanceof Error ? error.message : 'Something went wrong';
}
function heroFor(detail) {
    const backdrop = backdropUrl(detail.backdropPath);
    const poster = posterUrl(detail.posterPath, 'w342');
    const facts = [];
    if (detail.releaseYear)
        facts.push(String(detail.releaseYear));
    facts.push(mediaLabel(detail.mediaType));
    const runtime = formatRuntime(detail.runtimeMinutes);
    if (runtime)
        facts.push(runtime);
    if (detail.mediaType === 'tv' && detail.seasonCount) {
        facts.push(plural(detail.seasonCount, 'season'));
    }
    if (detail.seriesStatus)
        facts.push(detail.seriesStatus);
    return el('div', { class: 'title-hero' }, [
        backdrop
            ? el('div', { class: 'hero-backdrop', style: `background-image:url("${backdrop}")` })
            : null,
        el('div', { class: 'hero-body' }, [
            poster
                ? el('img', { class: 'hero-poster', src: poster, alt: '', loading: 'lazy' })
                : el('div', { class: 'hero-poster placeholder', 'aria-hidden': 'true' }, ['🎬']),
            el('div', { class: 'hero-text' }, [
                el('h2', { text: detail.title }),
                el('p', { class: 'hero-facts', text: facts.join(' · ') }),
                detail.genres.length
                    ? el('div', { class: 'tag-strip' }, detail.genres.map((genre) => el('span', { class: 'pill', text: genre.name })))
                    : null,
                detail.directors.length
                    ? el('p', {
                        class: 'muted',
                        text: `${detail.mediaType === 'tv' ? 'Created by' : 'Directed by'} ${detail.directors
                            .map((person) => person.name)
                            .join(', ')}`,
                    })
                    : null,
                detail.overview ? el('p', { class: 'overview', text: detail.overview }) : null,
            ]),
        ]),
    ]);
}
function actionsFor(detail, state, redraw, closeSheet) {
    const onWatchlist = state.onWatchlist !== null;
    const watchlistButton = button(onWatchlist ? 'On watchlist ✓' : '+ Watchlist', () => void busy(watchlistButton, async () => {
        try {
            if (onWatchlist) {
                await api.removeFromWatchlist(detail.mediaType, detail.tmdbId);
                toast('Removed from your watchlist');
            }
            else {
                await api.addToWatchlist(detail.mediaType, detail.tmdbId);
                toast('Added to your watchlist');
            }
            library.invalidate(['watchlist']);
            await redraw();
        }
        catch (error) {
            toast(describe(error), 'error');
        }
    }), onWatchlist ? 'ghost active' : 'ghost');
    const logButton = button(detail.mediaType === 'tv' ? 'Log episode' : 'Log viewing', () => openLogSheet(detail, redraw), 'primary');
    const listButton = button('Add to list…', () => openAddToList(detail), 'ghost');
    return el('div', { class: 'sheet-actions' }, [
        logButton,
        watchlistButton,
        listButton,
        button('Close', closeSheet, 'ghost'),
    ]);
}
// MARK: Rating
function ratingBlock(detail, state, redraw) {
    const current = state.rating;
    const stars = el('div', { class: 'stars', role: 'group', 'aria-label': 'Your rating' });
    for (let score = 1; score <= 10; score += 1) {
        const filled = current !== null && current.score >= score;
        const half = score % 2 === 1;
        const star = el('button', {
            class: `star ${half ? 'left' : 'right'}${filled ? ' filled' : ''}`,
            type: 'button',
            'aria-label': `Rate ${scoreLabel(score)}`,
            title: scoreLabel(score),
        }, ['★']);
        star.addEventListener('click', () => void busy(star, async () => {
            try {
                await api.rate(detail.mediaType, detail.tmdbId, score, current?.review ?? null);
                library.invalidate(['ratings']);
                await redraw();
                toast(`Rated ${scoreLabel(score)}`);
            }
            catch (error) {
                toast(describe(error), 'error');
            }
        }));
        stars.append(star);
    }
    const review = textarea({ placeholder: 'What did you make of it?', maxlength: 5000 });
    review.value = current?.review ?? '';
    const save = button('Save review', () => void busy(save, async () => {
        if (!current && review.value.trim() === '') {
            toast('Give it a rating first — a review hangs off one.', 'error');
            return;
        }
        try {
            await api.rate(detail.mediaType, detail.tmdbId, current?.score ?? 6, review.value.trim() || null);
            library.invalidate(['ratings']);
            await redraw();
            toast('Review saved');
        }
        catch (error) {
            toast(describe(error), 'error');
        }
    }), 'primary');
    const remove = current
        ? button('Clear rating', () => void busy(remove, async () => {
            if (!(await confirmModal({
                title: 'Clear rating',
                message: `Remove your rating and review of ${detail.title}?`,
                confirmLabel: 'Clear',
                destructive: true,
            }))) {
                return;
            }
            try {
                await api.unrate(detail.mediaType, detail.tmdbId);
                library.invalidate(['ratings']);
                await redraw();
                toast('Rating cleared');
            }
            catch (error) {
                toast(describe(error), 'error');
            }
        }))
        : null;
    return el('section', { class: 'sheet-block' }, [
        el('h3', { text: 'Your rating' }),
        el('div', { class: 'rating-row' }, [
            stars,
            el('span', {
                class: 'rating-value',
                text: current ? `${starsFor(current.score)} — ${scoreLabel(current.score)}` : 'Not rated',
            }),
        ]),
        review,
        el('div', { class: 'row-actions' }, [save, remove]),
    ]);
}
// MARK: Viewings
function viewingsBlock(detail, state, redraw) {
    const rows = state.viewings.map((entry) => viewingRow(entry, redraw));
    return el('section', { class: 'sheet-block' }, [
        el('h3', { text: `Your viewings${state.viewings.length ? ` (${state.viewings.length})` : ''}` }),
        rows.length
            ? el('ul', { class: 'plain-list' }, rows)
            : el('p', { class: 'muted', text: 'Nothing logged yet.' }),
    ]);
}
function viewingRow(entry, redraw) {
    const label = entry.mediaType === 'tv' && entry.seasonNumber !== null && entry.episodeNumber !== null
        ? `S${entry.seasonNumber}E${entry.episodeNumber} · ${formatDay(entry.watchedOn)}`
        : formatDay(entry.watchedOn);
    const edit = button('Edit', () => openEditViewing(entry, redraw), 'ghost small');
    const remove = button('Delete', () => void busy(remove, async () => {
        if (!(await confirmModal({
            title: 'Delete viewing',
            message: 'This removes the viewing from your diary. Your rating stays.',
            confirmLabel: 'Delete',
            destructive: true,
        }))) {
            return;
        }
        try {
            await api.deleteViewing(entry.id);
            library.invalidate(['diary']);
            await redraw();
            toast('Viewing deleted');
        }
        catch (error) {
            toast(describe(error), 'error');
        }
    }), 'ghost small danger');
    return el('li', { class: 'viewing-row' }, [
        el('span', {}, [
            el('strong', { text: label }),
            entry.isRewatch ? el('span', { class: 'pill small', text: 'Rewatch' }) : null,
        ]),
        el('span', { class: 'row-actions' }, [edit, remove]),
    ]);
}
function openEditViewing(entry, redraw) {
    const date = input('date', { value: entry.watchedOn, max: today() });
    const rewatch = input('checkbox');
    rewatch.checked = entry.isRewatch;
    const save = button('Save', () => void busy(save, async () => {
        try {
            await api.updateViewing(entry.id, { watchedOn: date.value, isRewatch: rewatch.checked });
            library.invalidate(['diary']);
            await redraw();
            close();
            toast('Viewing updated');
        }
        catch (error) {
            toast(describe(error), 'error');
        }
    }), 'primary');
    const close = modal({
        title: 'Edit viewing',
        body: el('div', { class: 'form' }, [
            field('Watched on', date),
            el('label', { class: 'check' }, [rewatch, el('span', { text: 'This was a rewatch' })]),
        ]),
        actions: [button('Cancel', () => close()), save],
    });
}
/** Log a viewing: a date, and for a show which episode. */
function openLogSheet(detail, redraw) {
    const date = input('date', { value: today(), max: today() });
    const quick = el('div', { class: 'row-actions' }, [
        button('Today', () => {
            date.value = today();
        }, 'ghost small'),
        detail.releaseDate
            ? button(`Release day (${detail.releaseDate})`, () => {
                date.value = detail.releaseDate;
            }, 'ghost small')
            : null,
    ]);
    const seasonPicker = detail.mediaType === 'tv'
        ? select(detail.seasons
            .filter((season) => season.seasonNumber > 0)
            .map((season) => ({
            value: String(season.seasonNumber),
            label: `${season.name} (${plural(season.episodeCount, 'episode')})`,
        })), String(detail.seasons.find((season) => season.seasonNumber > 0)?.seasonNumber ?? 1))
        : null;
    const episodePicker = detail.mediaType === 'tv' ? input('number', { min: 1, value: 1 }) : null;
    const wholeSeason = input('checkbox');
    const save = button('Log it', () => void busy(save, async () => {
        try {
            if (detail.mediaType === 'tv' && seasonPicker) {
                const seasonNumber = Number(seasonPicker.value);
                if (wholeSeason.checked) {
                    const result = await api.logSeason({
                        tmdbId: detail.tmdbId,
                        seasonNumber,
                        watchedOn: date.value,
                    });
                    toast(result.added === 0
                        ? 'Every episode of that season was already logged.'
                        : `Logged ${plural(result.added, 'episode')}.`);
                }
                else {
                    await api.logViewing({
                        mediaType: 'tv',
                        tmdbId: detail.tmdbId,
                        seasonNumber,
                        episodeNumber: Number(episodePicker?.value ?? 1),
                        watchedOn: date.value,
                    });
                    toast('Episode logged');
                }
            }
            else {
                await api.logViewing({
                    mediaType: detail.mediaType,
                    tmdbId: detail.tmdbId,
                    watchedOn: date.value,
                });
                toast('Viewing logged');
            }
            library.invalidate(['diary']);
            await redraw();
            close();
        }
        catch (error) {
            toast(describe(error), 'error');
        }
    }), 'primary');
    const body = el('div', { class: 'form' }, [
        field('Watched on', date),
        quick,
        seasonPicker ? field('Season', seasonPicker) : null,
        episodePicker ? field('Episode', episodePicker) : null,
        detail.mediaType === 'tv'
            ? el('label', { class: 'check' }, [
                wholeSeason,
                el('span', { text: 'Log the whole season (skips episodes already logged)' }),
            ])
            : null,
    ]);
    if (episodePicker && seasonPicker) {
        const syncEpisodeVisibility = () => {
            const hidden = wholeSeason.checked;
            episodePicker.closest('label')?.toggleAttribute('hidden', hidden);
        };
        wholeSeason.addEventListener('change', syncEpisodeVisibility);
    }
    const close = modal({
        title: `Log ${detail.title}`,
        body,
        actions: [button('Cancel', () => close()), save],
    });
}
// MARK: Seasons
function seasonsBlock(detail, redraw) {
    const block = el('section', { class: 'sheet-block' }, [el('h3', { text: 'Seasons' })]);
    for (const season of detail.seasons) {
        const open = el('details', { class: 'season' }, [
            el('summary', {}, [
                el('span', { text: season.name }),
                el('span', { class: 'muted', text: plural(season.episodeCount, 'episode') }),
            ]),
        ]);
        let loaded = false;
        open.addEventListener('toggle', () => {
            if (!open.open || loaded)
                return;
            loaded = true;
            const holder = el('div', { class: 'episode-list' }, [spinner('Loading episodes')]);
            open.append(holder);
            void api
                .seasonEpisodes(detail.tmdbId, season.seasonNumber)
                .then(async (episodes) => {
                const watched = new Set((await library.getDiary())
                    .filter((entry) => entry.mediaType === 'tv' && entry.tmdbId === detail.tmdbId)
                    .map((entry) => `${entry.seasonNumber}:${entry.episodeNumber}`));
                clear(holder);
                if (episodes.length === 0) {
                    holder.append(el('p', { class: 'muted', text: 'TMDB lists no episodes for this season.' }));
                    return;
                }
                for (const episode of episodes) {
                    const seen = watched.has(`${episode.seasonNumber}:${episode.episodeNumber}`);
                    const log = button(seen ? 'Logged ✓' : 'Log', () => void busy(log, async () => {
                        try {
                            await api.logViewing({
                                mediaType: 'tv',
                                tmdbId: detail.tmdbId,
                                seasonNumber: episode.seasonNumber,
                                episodeNumber: episode.episodeNumber,
                                watchedOn: today(),
                            });
                            library.invalidate(['diary']);
                            log.textContent = 'Logged ✓';
                            log.classList.add('active');
                            await redraw();
                        }
                        catch (error) {
                            toast(describe(error), 'error');
                        }
                    }), seen ? 'ghost small active' : 'ghost small');
                    holder.append(el('div', { class: 'episode-row' }, [
                        el('span', {
                            class: 'episode-name',
                            text: `${episode.episodeNumber}. ${episode.name}`,
                        }),
                        el('span', { class: 'muted', text: formatRuntime(episode.runtimeMinutes) ?? '' }),
                        log,
                    ]));
                }
            })
                .catch((error) => {
                clear(holder);
                holder.append(el('p', { class: 'error-note', text: describe(error) }));
            });
        });
        block.append(open);
    }
    return block;
}
// MARK: Tags
function tagsBlock(detail, allTags, titleTags, redraw) {
    const selected = new Set(titleTags.map((tag) => tag.id));
    const chips = el('div', { class: 'chip-row wrap' });
    for (const tag of allTags) {
        const chip = el('button', {
            class: `chip${selected.has(tag.id) ? ' active' : ''}`,
            type: 'button',
            text: tag.name,
            'aria-pressed': selected.has(tag.id) ? 'true' : 'false',
        });
        chip.addEventListener('click', () => void busy(chip, async () => {
            if (selected.has(tag.id))
                selected.delete(tag.id);
            else
                selected.add(tag.id);
            try {
                await api.setTags(detail.mediaType, detail.tmdbId, [...selected]);
                await redraw();
            }
            catch (error) {
                toast(describe(error), 'error');
            }
        }));
        chips.append(chip);
    }
    const name = input('text', { placeholder: 'New tag', maxlength: 40 });
    const add = button('Add', () => void busy(add, async () => {
        const value = name.value.trim();
        if (!value)
            return;
        try {
            const tag = await api.createTag(value);
            selected.add(tag.id);
            await api.setTags(detail.mediaType, detail.tmdbId, [...selected]);
            library.invalidate(['tags']);
            name.value = '';
            await redraw();
        }
        catch (error) {
            toast(describe(error), 'error');
        }
    }));
    return el('section', { class: 'sheet-block' }, [
        el('h3', { text: 'Your tags' }),
        allTags.length ? chips : el('p', { class: 'muted', text: 'No tags yet.' }),
        el('div', { class: 'inline-form' }, [name, add]),
    ]);
}
function castBlock(detail) {
    if (detail.topCast.length === 0)
        return null;
    return el('section', { class: 'sheet-block' }, [
        el('h3', { text: 'Cast' }),
        el('div', { class: 'chip-row wrap' }, detail.topCast.map((person) => el('span', {
            class: 'pill',
            text: person.character ? `${person.name} — ${person.character}` : person.name,
        }))),
    ]);
}
function similarBlock(detail) {
    const block = el('section', { class: 'sheet-block' }, [
        el('h3', { text: 'More like this' }),
    ]);
    const rail = el('div', { class: 'poster-rail' }, [spinner('Loading')]);
    block.append(rail);
    void api
        .similar(detail.tmdbId)
        .then((page) => {
        clear(rail);
        const results = page.results.slice(0, 12);
        if (results.length === 0) {
            rail.append(el('p', { class: 'muted', text: 'Nothing to suggest.' }));
            return;
        }
        for (const movie of results)
            rail.append(posterCard(movie, openTitle));
    })
        .catch(() => {
        clear(rail);
        rail.append(el('p', { class: 'muted', text: 'Suggestions are unavailable right now.' }));
    });
    return block;
}
// MARK: Lists
function openAddToList(detail) {
    const body = el('div', { class: 'form' }, [spinner('Loading your lists')]);
    const close = modal({ title: `Add ${detail.title} to a list`, body });
    void api
        .lists()
        .then(({ owned, shared }) => {
        const writable = [...owned, ...shared.filter((list) => list.role === 'editor')];
        clear(body);
        if (writable.length === 0) {
            body.append(el('p', { class: 'muted', text: 'You have no lists you can add to. Make one on the Lists tab.' }));
            return;
        }
        const picker = select(writable.map((list) => ({ value: list.id, label: list.name })), writable[0]?.id ?? '');
        const note = input('text', { placeholder: 'Why this one? (optional)', maxlength: 300 });
        const add = button('Add', () => void busy(add, async () => {
            try {
                await api.addListItem(picker.value, detail.mediaType, detail.tmdbId, note.value.trim() || null);
                toast('Added to the list');
                close();
            }
            catch (error) {
                toast(describe(error), 'error');
            }
        }), 'primary');
        body.append(field('List', picker), field('Note', note), el('div', { class: 'row-actions' }, [add]));
    })
        .catch((error) => {
        clear(body);
        body.append(el('p', { class: 'error-note', text: describe(error) }));
    });
}
