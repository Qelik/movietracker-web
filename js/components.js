/** Pieces shared by more than one screen. */
import { el } from './dom.js';
import { posterUrl, subtitleFor } from './format.js';
/** A poster with its title underneath, keyboard-activatable. */
export function posterCard(movie, onOpen, badge) {
    const url = posterUrl(movie.posterPath);
    const art = url
        ? el('img', {
            class: 'poster-img',
            src: url,
            alt: '',
            loading: 'lazy',
            decoding: 'async',
        })
        : el('div', { class: 'poster-img placeholder', 'aria-hidden': 'true' }, [
            el('span', { text: movie.mediaType === 'tv' ? '📺' : '🎬' }),
        ]);
    const card = el('button', {
        class: 'poster-card',
        type: 'button',
        'aria-label': `${movie.title}${movie.releaseYear ? `, ${movie.releaseYear}` : ''}`,
    }, [
        el('span', { class: 'poster-frame' }, [
            art,
            badge ? el('span', { class: 'poster-badge', text: badge }) : null,
            movie.mediaType === 'tv' ? el('span', { class: 'poster-kind', text: 'TV' }) : null,
        ]),
        el('span', { class: 'poster-title', text: movie.title }),
        el('span', { class: 'poster-sub', text: subtitleFor(movie) }),
    ]);
    card.addEventListener('click', () => onOpen(movie));
    return card;
}
export function posterGrid(movies, onOpen, badgeFor) {
    return el('div', { class: 'poster-grid' }, movies.map((movie) => posterCard(movie, onOpen, badgeFor?.(movie) ?? null)));
}
/** A row of mutually exclusive chips. Returns the row; selection is caller state. */
export function chipRow(options, selected, onSelect, extraClass = '') {
    const row = el('div', { class: `chip-row ${extraClass}`.trim(), role: 'tablist' });
    for (const option of options) {
        const chip = el('button', {
            class: `chip${option.value === selected ? ' active' : ''}`,
            type: 'button',
            role: 'tab',
            'aria-selected': option.value === selected ? 'true' : 'false',
            text: option.label,
        });
        chip.addEventListener('click', () => onSelect(option.value));
        row.append(chip);
    }
    return row;
}
export function sectionHead(title, note, action) {
    return el('div', { class: 'section-head' }, [
        el('div', {}, [
            el('h3', { text: title }),
            note ? el('p', { class: 'muted', text: note }) : null,
        ]),
        action ?? null,
    ]);
}
export function field(label, control, hint) {
    const id = control.id || `f${Math.random().toString(36).slice(2, 9)}`;
    control.id = id;
    return el('label', { class: 'field', for: id }, [
        el('span', { class: 'field-label', text: label }),
        control,
        hint ? el('span', { class: 'field-hint', text: hint }) : null,
    ]);
}
export function input(type, attributes = {}) {
    return el('input', { class: 'input', type, ...attributes });
}
export function textarea(attributes = {}) {
    return el('textarea', { class: 'input', rows: 4, ...attributes });
}
export function select(options, selected) {
    const node = el('select', { class: 'input select' });
    for (const option of options) {
        node.append(el('option', { value: option.value, selected: option.value === selected }, [option.label]));
    }
    return node;
}
/**
 * A single progress bar: a track, and the numbers beside it.
 *
 * Beside, not inside. The label used to sit centred over the bar, so at a third
 * full the text straddled the edge of the fill and changed contrast halfway
 * through itself — "13 of 29" with the 13 on one background and the rest on
 * another. This is the same track the bar chart above uses, for the same
 * reason: there is no need for two kinds of bar in one app.
 *
 * `done` is 0-1 and is clamped, because a caller that has miscounted should
 * produce a full bar rather than one overflowing its own track.
 */
export function progressBar(done, label, description) {
    const share = Math.min(Math.max(done, 0), 1);
    return el('div', { class: 'progress-row' }, [
        el('span', {
            class: 'bar-track',
            role: 'progressbar',
            'aria-valuemin': '0',
            'aria-valuemax': '100',
            'aria-valuenow': String(Math.round(share * 100)),
            // Screen readers get the sentence; the visible label is two numbers
            // and a preposition, which on its own says nothing about what of.
            'aria-label': description,
        }, [
            // A floor of 2% only once there is something to show. Genuine zero
            // stays empty — a sliver of fill on a show nobody has started reads as
            // progress that has not happened.
            el('span', {
                class: 'bar-fill',
                style: `width:${share === 0 ? 0 : Math.max(2, share * 100)}%`,
            }),
        ]),
        el('span', { class: 'progress-count', text: label }),
    ]);
}
/** A horizontal bar chart — the same shape serves genres, decades and scores. */
export function barList(rows, options = {}) {
    const format = options.format ?? ((value) => String(value));
    const whole = options.outOf ?? Math.max(1, ...rows.map((row) => row.value));
    return el('div', { class: 'bars' }, rows.map((row) => {
        const share = whole === 0 ? 0 : Math.min(Math.max(row.value / whole, 0), 1);
        return el('div', { class: 'bar-row' }, [
            el('span', { class: 'bar-label', text: row.label }),
            el('span', {
                class: 'bar-track',
                role: 'img',
                // The visible number is beside the bar; this says what it is of,
                // which the bar alone cannot.
                'aria-label': `${row.label}: ${row.caption ?? format(row.value)}`,
            }, [
                // A floor of 2% so a small-but-real value is still visible, but
                // only once there is something to show: a sliver on a genre with
                // nothing in it would be reporting viewing that did not happen.
                el('span', {
                    class: 'bar-fill',
                    style: `width:${share === 0 ? 0 : Math.max(2, share * 100)}%`,
                }),
            ]),
            el('span', { class: 'bar-value', text: row.caption ?? format(row.value) }),
        ]);
    }));
}
