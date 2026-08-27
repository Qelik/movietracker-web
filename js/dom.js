/** Small DOM helpers. No framework: the app is a handful of screens over one API. */
export function el(tag, attributes = {}, children = []) {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) {
        if (value === null || value === undefined || value === false)
            continue;
        if (name === 'class')
            node.className = String(value);
        // No `html` escape hatch on purpose. Nothing used it, and an innerHTML sink
        // sitting in the one helper every screen builds through is how a TMDB
        // synopsis or a shared list name ends up executing. Text only.
        else if (name === 'text')
            node.textContent = String(value);
        else if (value === true)
            node.setAttribute(name, '');
        else
            node.setAttribute(name, String(value));
    }
    for (const child of children) {
        if (child === null || child === undefined)
            continue;
        node.append(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return node;
}
export function clear(node) {
    node.replaceChildren();
}
export function byId(id) {
    const node = document.getElementById(id);
    if (!node)
        throw new Error(`Missing element #${id}`);
    return node;
}
/** A brief message at the foot of the screen. Errors stay up twice as long. */
let toastTimer;
export function toast(message, kind = 'info') {
    const node = byId('toast');
    node.textContent = message;
    node.className = `toast ${kind}`;
    node.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
        node.hidden = true;
    }, kind === 'error' ? 5200 : 2600);
}
export function spinner(label = 'Loading') {
    return el('div', { class: 'loading', role: 'status' }, [
        el('span', { class: 'spin', 'aria-hidden': 'true' }),
        el('span', { text: label }),
    ]);
}
export function empty(message, action) {
    return el('div', { class: 'empty' }, [el('p', { text: message }), action ?? null]);
}
let openModals = 0;
/** A dialog stack — a film opened from inside a list has to sit above it. */
export function modal(options) {
    const backdrop = el('div', { class: 'modal-backdrop' });
    const close = () => {
        backdrop.remove();
        openModals = Math.max(0, openModals - 1);
        document.body.classList.toggle('modal-open', openModals > 0);
        document.removeEventListener('keydown', onKey);
        options.onClose?.();
    };
    const onKey = (event) => {
        // Only the topmost dialog answers Escape.
        if (event.key === 'Escape' && backdrop.parentElement?.lastElementChild === backdrop) {
            event.stopPropagation();
            close();
        }
    };
    const dialog = el('div', {
        class: `modal${options.wide ? ' wide' : ''}`,
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': options.title,
    }, [
        el('header', { class: 'modal-head' }, [
            el('h3', { text: options.title }),
            (() => {
                const button = el('button', { class: 'icon-btn', 'aria-label': 'Close' }, ['✕']);
                button.addEventListener('click', close);
                return button;
            })(),
        ]),
        el('div', { class: 'modal-body' }, [options.body]),
        options.actions?.length ? el('footer', { class: 'modal-foot' }, options.actions) : null,
    ]);
    backdrop.append(dialog);
    backdrop.addEventListener('click', (event) => {
        if (event.target === backdrop)
            close();
    });
    document.addEventListener('keydown', onKey);
    document.body.append(backdrop);
    openModals += 1;
    document.body.classList.add('modal-open');
    // Focus the first control so keyboard users are not left on the page behind.
    const focusable = dialog.querySelector('input, textarea, select, button:not(.icon-btn)');
    focusable?.focus();
    return close;
}
export function confirmModal(options) {
    return new Promise((resolve) => {
        let settled = false;
        const finish = (answer) => {
            if (settled)
                return;
            settled = true;
            resolve(answer);
            close();
        };
        const cancel = el('button', { class: 'ghost', text: 'Cancel' });
        cancel.addEventListener('click', () => finish(false));
        const confirm = el('button', {
            class: options.destructive ? 'primary danger' : 'primary',
            text: options.confirmLabel ?? 'Confirm',
        });
        confirm.addEventListener('click', () => finish(true));
        const close = modal({
            title: options.title,
            body: el('p', { text: options.message }),
            actions: [cancel, confirm],
            onClose: () => finish(false),
        });
    });
}
export function button(label, handler, className = 'ghost') {
    const node = el('button', { class: className, type: 'button' }, [label]);
    node.addEventListener('click', handler);
    return node;
}
/** Runs an async action with the button disabled, so nothing double-fires. */
export function busy(node, work) {
    if (node.disabled)
        return Promise.resolve(undefined);
    const label = node.textContent;
    node.disabled = true;
    node.classList.add('working');
    return work().finally(() => {
        node.disabled = false;
        node.classList.remove('working');
        if (label !== null)
            node.textContent = label;
    });
}
/** `append` that ignores nulls, so callers can inline conditional children. */
export function add(parent, ...children) {
    for (const child of children) {
        if (child === null || child === undefined)
            continue;
        parent.append(child);
    }
}
