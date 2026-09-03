/**
 * The person sheet: a director's or actor's work, and how much of it you have
 * seen.
 *
 * Opened from the cast and crew rows on a title, which is where the question
 * comes up — "what else has she been in" — and where it used to go unanswered
 * because a name on that screen was just text.
 */
import * as api from './api.js';
import { add, clear, el, modal, spinner } from './dom.js';
import { sectionHead } from './components.js';
import { formatDay, plural, posterUrl, scoreLabel } from './format.js';
import { openTitle } from './title.js';
export function openPerson(tmdbId, name) {
    const body = el('div', { class: 'person-sheet' }, [spinner('Loading')]);
    modal({ title: name ?? 'Person', body, wide: true });
    void render(body, tmdbId);
}
async function render(body, tmdbId) {
    let page;
    try {
        page = await api.person(tmdbId);
    }
    catch (error) {
        clear(body);
        body.append(el('p', {
            class: 'error-note',
            text: error instanceof Error ? error.message : 'Something went wrong',
        }));
        return;
    }
    let lens = 'all';
    const paint = () => {
        clear(body);
        add(body, header(page), lensBar(page, lens, (next) => {
            lens = next;
            paint();
        }), filmography(page, lens));
    };
    paint();
}
function header(page) {
    const { person, seen } = page;
    const portrait = posterUrl(person.profilePath, 'w185');
    const facts = [];
    if (person.knownForDepartment)
        facts.push(person.knownForDepartment);
    if (person.birthday) {
        // Someone who has died gets a span, not an age: an age implies alive.
        facts.push(person.deathday
            ? `${formatDay(person.birthday)} – ${formatDay(person.deathday)}`
            : `Born ${formatDay(person.birthday)}`);
    }
    if (person.placeOfBirth)
        facts.push(person.placeOfBirth);
    return el('div', { class: 'person-head' }, [
        portrait
            ? el('img', { class: 'person-portrait', src: portrait, alt: '', loading: 'lazy' })
            : el('div', { class: 'person-portrait placeholder', 'aria-hidden': 'true' }, ['👤']),
        el('div', { class: 'person-text' }, [
            el('h2', { text: person.name }),
            facts.length ? el('p', { class: 'hero-facts', text: facts.join(' · ') }) : null,
            el('p', { class: 'seen-line', text: seenLine(seen) }),
            person.biography ? el('p', { class: 'overview clamp', text: person.biography }) : null,
        ]),
    ]);
}
/**
 * The headline number, phrased so it never claims a total it does not have.
 * TMDB counts announced projects as credits, so "6 of 14" includes films
 * nobody could have watched — saying "credits" rather than "films" keeps that
 * honest without dropping rows the filmography should still list.
 */
function seenLine(seen) {
    if (seen.total === 0)
        return 'No credits on TMDB.';
    if (seen.watched === 0)
        return `You have not logged any of these ${seen.total} credits.`;
    return `You have watched ${seen.watched} of ${seen.total} credits.`;
}
function lensBar(page, lens, pick) {
    const hasActing = page.credits.some((credit) => credit.isCast);
    const hasCrew = page.credits.some((credit) => !credit.isCast);
    const options = [{ value: 'all', label: 'Everything' }];
    // Only offered when the person actually did both, so the bar never shows a
    // tab that filters to nothing.
    if (hasActing && hasCrew) {
        options.push({ value: 'acting', label: 'Acting' }, { value: 'crew', label: 'Crew' });
    }
    options.push({ value: 'seen', label: 'Watched' }, { value: 'unseen', label: 'Not seen' });
    const row = el('div', { class: 'chip-row secondary' });
    for (const option of options) {
        const chip = el('button', {
            class: option.value === lens ? 'chip active' : 'chip',
            type: 'button',
            text: option.label,
        });
        chip.addEventListener('click', () => pick(option.value));
        row.append(chip);
    }
    return row;
}
function applyLens(credits, lens) {
    switch (lens) {
        case 'acting':
            return credits.filter((credit) => credit.isCast);
        case 'crew':
            return credits.filter((credit) => !credit.isCast);
        case 'seen':
            return credits.filter((credit) => credit.viewings > 0);
        case 'unseen':
            return credits.filter((credit) => credit.viewings === 0);
        default:
            return credits;
    }
}
function filmography(page, lens) {
    const rows = applyLens(page.credits, lens);
    const block = el('section', { class: 'sheet-block' }, [
        sectionHead('Filmography', plural(rows.length, 'credit')),
    ]);
    if (rows.length === 0) {
        block.append(el('p', { class: 'muted', text: 'Nothing under that filter.' }));
        return block;
    }
    block.append(el('div', { class: 'credit-list' }, rows.map(creditRow)));
    return block;
}
function creditRow(credit) {
    const poster = posterUrl(credit.posterPath, 'w185');
    const meta = [];
    if (credit.releaseYear)
        meta.push(String(credit.releaseYear));
    if (credit.roles.length)
        meta.push(credit.roles.join(', '));
    if (credit.episodeCount)
        meta.push(plural(credit.episodeCount, 'episode'));
    const marks = el('div', { class: 'credit-marks' }, [
        credit.viewings > 0
            ? el('span', {
                class: 'pill good',
                // A rewatch count is worth showing; "watched 1 time" is not.
                text: credit.viewings > 1 ? `Watched ×${credit.viewings}` : 'Watched',
            })
            : null,
        credit.score !== null ? el('span', { class: 'pill', text: scoreLabel(credit.score) }) : null,
        credit.onWatchlist && credit.viewings === 0
            ? el('span', { class: 'pill', text: 'On watchlist' })
            : null,
    ]);
    const row = el('button', { class: 'credit-row', type: 'button' }, [
        poster
            ? el('img', { class: 'credit-poster', src: poster, alt: '', loading: 'lazy' })
            : el('div', { class: 'credit-poster placeholder', 'aria-hidden': 'true' }, ['🎬']),
        el('div', { class: 'credit-body' }, [
            el('span', { class: 'credit-title', text: credit.title }),
            meta.length ? el('span', { class: 'muted small', text: meta.join(' · ') }) : null,
            marks,
        ]),
    ]);
    row.addEventListener('click', () => openTitle(credit));
    return row;
}
