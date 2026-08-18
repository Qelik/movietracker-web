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
/** A horizontal bar chart — the same shape serves genres, decades and scores. */
export function barList(rows, formatValue = (value) => String(value)) {
    const peak = Math.max(1, ...rows.map((row) => row.value));
    return el('div', { class: 'bars' }, rows.map((row) => el('div', { class: 'bar-row' }, [
        el('span', { class: 'bar-label', text: row.label }),
        el('span', { class: 'bar-track' }, [
            el('span', { class: 'bar-fill', style: `width:${Math.max(2, (row.value / peak) * 100)}%` }),
        ]),
        el('span', { class: 'bar-value', text: row.caption ?? formatValue(row.value) }),
    ])));
}
