/**
 * Lists: your own, the ones shared with you, and everything you can do inside
 * one — add films, vote on them, invite people, hand out a share code.
 *
 * What a role may do is enforced by the server; hiding the controls here is a
 * courtesy, not the boundary.
 */
import * as api from '../api.js';
import { field, input, sectionHead, select, textarea } from '../components.js';
import { busy, button, clear, confirmModal, el, empty, modal, spinner, toast } from '../dom.js';
import { formatDay, plural, posterUrl, subtitleFor, today } from '../format.js';
import { emit, on } from '../store.js';
import { openTitle } from '../title.js';
export function mount(root) {
    const body = el('div');
    root.append(el('div', { class: 'view-actions' }, [
        button('New list', () => openCreate(() => void load(body)), 'primary'),
        button('Join with a code', () => openRedeem(() => void load(body)), 'ghost'),
    ]), body);
    void load(body);
    return on('lists', () => void load(body));
}
function message(error) {
    return error instanceof Error ? error.message : 'Something went wrong';
}
async function load(body) {
    clear(body);
    body.append(spinner('Loading your lists'));
    try {
        const { owned, shared } = await api.lists();
        clear(body);
        if (owned.length === 0 && shared.length === 0) {
            body.append(empty('No lists yet. Make one for a film night, or join one with a code.'));
            return;
        }
        if (owned.length) {
            body.append(el('h3', { class: 'month-head', text: 'Your lists' }));
            body.append(el('div', { class: 'card-grid' }, owned.map((list) => card(list, body))));
        }
        if (shared.length) {
            body.append(el('h3', { class: 'month-head', text: 'Shared with you' }));
            body.append(el('div', { class: 'card-grid' }, shared.map((list) => card(list, body))));
        }
    }
    catch (error) {
        clear(body);
        body.append(el('p', { class: 'error-note', text: message(error) }));
    }
}
function card(list, body) {
    const open = el('button', { class: 'list-card', type: 'button' }, [
        el('span', { class: 'list-name', text: list.name }),
        list.description ? el('span', { class: 'muted', text: list.description }) : null,
        el('span', { class: 'list-meta' }, [
            el('span', { class: 'pill small', text: list.role }),
            el('span', { class: 'muted', text: plural(list.itemCount, 'title') }),
            el('span', { class: 'muted', text: plural(list.memberCount, 'member') }),
        ]),
    ]);
    open.addEventListener('click', () => openList(list.id, () => void load(body)));
    return open;
}
function openCreate(done) {
    const name = input('text', { placeholder: 'Friday night', maxlength: 80 });
    const description = textarea({ placeholder: 'What is it for? (optional)', maxlength: 500, rows: 3 });
    const save = button('Create', () => void busy(save, async () => {
        if (!name.value.trim()) {
            toast('A list needs a name', 'error');
            return;
        }
        try {
            const list = await api.createList(name.value.trim(), description.value.trim() || null);
            close();
            done();
            openList(list.id, done);
        }
        catch (error) {
            toast(message(error), 'error');
        }
    }), 'primary');
    const close = modal({
        title: 'New list',
        body: el('div', { class: 'form' }, [field('Name', name), field('Description', description)]),
        actions: [button('Cancel', () => close()), save],
    });
}
function openRedeem(done) {
    const code = input('text', { placeholder: 'ABCD-EFGH-JKMN', maxlength: 40 });
    const join = button('Join', () => void busy(join, async () => {
        const value = code.value.trim().replace(/\s|-/g, '');
        if (!value)
            return;
        try {
            const { list } = await api.redeemShareCode(value);
            close();
            done();
            toast(`Joined ${list.name}`);
            openList(list.id, done);
        }
        catch (error) {
            toast(message(error), 'error');
        }
    }), 'primary');
    const close = modal({
        title: 'Join a list',
        body: el('div', { class: 'form' }, [
            field('Share code', code, 'The twelve characters the list owner sent you.'),
        ]),
        actions: [button('Cancel', () => close()), join],
    });
}
// MARK: One list
export function openList(id, done) {
    const body = el('div', { class: 'list-sheet' }, [spinner('Loading list')]);
    const close = modal({ title: 'List', body, wide: true, onClose: done });
    const refresh = async () => {
        try {
            const { list, items } = await api.listDetail(id);
            clear(body);
            body.append(header(list, refresh, close, done), decideBlock(list), itemsBlock(list, items, refresh), nightsBlock(list), membersBlock(list, refresh));
        }
        catch (error) {
            clear(body);
            body.append(el('p', { class: 'error-note', text: message(error) }));
        }
    };
    void refresh();
}
/**
 * "So what are we watching?"
 *
 * The last step in a shared list, and the one nobody wants to take
 * responsibility for. Nothing is recorded, so rolling again is free — which is
 * how the decision actually gets made.
 */
function decideBlock(list) {
    const result = el('div');
    const roll = button('Pick something', () => void busy(roll, async () => {
        try {
            const decision = await api.decideForList(list.id);
            clear(result);
            result.append(decisionCard(decision));
        }
        catch (error) {
            clear(result);
            result.append(el('p', { class: 'muted', text: message(error) }));
        }
    }), 'ghost');
    return el('section', { class: 'sheet-block' }, [
        el('div', { class: 'row-actions' }, [roll]),
        result,
    ]);
}
function decisionCard(decision) {
    const poster = posterUrl(decision.movie?.posterPath ?? null, 'w185');
    const pick = decision.pick;
    const card = el('button', { class: 'credit-row decision', type: 'button' }, [
        poster
            ? el('img', { class: 'credit-poster', src: poster, alt: '', loading: 'lazy' })
            : el('div', { class: 'credit-poster placeholder', 'aria-hidden': 'true' }, ['🎲']),
        el('div', { class: 'credit-body' }, [
            el('span', { class: 'muted small', text: 'Tonight' }),
            el('span', { class: 'credit-title', text: pick.title }),
            el('span', {
                class: 'muted small',
                text: `${pick.yes} yes · ${pick.maybe} maybe · ${pick.no} no`,
            }),
        ]),
    ]);
    card.addEventListener('click', () => openTitle({ mediaType: pick.mediaType, tmdbId: pick.tmdbId, title: pick.title }));
    const block = el('div', { class: 'stack' }, [card]);
    // Said out loud, because a pick somebody has already objected to needs that
    // fact attached rather than arriving as an instruction.
    if (decision.vetoesIgnored) {
        block.append(el('p', {
            class: 'muted small',
            text: 'Everything on this list has a no against it, so this one was picked anyway.',
        }));
    }
    return block;
}
/**
 * Proposed nights, kept apart from what to watch.
 *
 * Two arguments, and folding them together means settling both before you can
 * settle either.
 */
function nightsBlock(list) {
    const block = el('section', { class: 'sheet-block' }, [
        sectionHead('Nights', 'When can everyone make it?'),
    ]);
    const body = el('div', { class: 'stack' }, [spinner('Loading')]);
    const date = input('date', { value: today() });
    const propose = button('Propose', () => void busy(propose, async () => {
        try {
            paint(await api.proposeNight(list.id, date.value));
        }
        catch (error) {
            toast(message(error), 'error');
        }
    }), 'ghost small');
    const paint = (nights) => {
        clear(body);
        if (nights.length === 0) {
            body.append(el('p', { class: 'muted', text: 'No nights proposed yet.' }));
            return;
        }
        body.append(...nights.map((night) => nightRow(list, night, paint)));
    };
    block.append(el('div', { class: 'inline-field' }, [field('A night', date)]), el('div', { class: 'row-actions' }, [propose]), body);
    void api
        .nights(list.id)
        .then(paint)
        .catch((error) => {
        clear(body);
        body.append(el('p', { class: 'muted', text: message(error) }));
    });
    return block;
}
function nightRow(list, night, paint) {
    const answer = (reply) => {
        const chip = el('button', {
            class: night.myReply === reply ? `chip vote active ${reply}` : 'chip vote',
            type: 'button',
            text: reply === 'yes' ? 'Free' : reply === 'maybe' ? 'Maybe' : 'Busy',
            'aria-pressed': night.myReply === reply ? 'true' : 'false',
        });
        chip.addEventListener('click', () => {
            void (async () => {
                try {
                    paint(await api.replyToNight(list.id, night.id, reply));
                }
                catch (error) {
                    toast(message(error), 'error');
                }
            })();
        });
        return chip;
    };
    const who = night.proposedBy.displayName?.trim() || `@${night.proposedBy.handle}`;
    const row = el('div', { class: 'night-row' }, [
        el('div', {}, [
            el('span', { class: 'credit-title', text: formatDay(night.onDate) }),
            el('span', {
                class: 'muted small',
                text: `${night.yes} free · ${night.maybe} maybe · ${night.no} busy · proposed by ${who}`,
            }),
        ]),
        el('div', { class: 'chip-row' }, [answer('yes'), answer('maybe'), answer('no')]),
    ]);
    return row;
}
function header(list, refresh, closeSheet, done) {
    const actions = [
        button('Add a title', () => openAddTitle(list, refresh), 'primary'),
    ];
    if (list.role === 'owner') {
        actions.push(button('Rename', () => openRename(list, refresh, done), 'ghost'));
        actions.push(button('Sharing', () => openSharing(list, refresh, done), 'ghost'));
        const remove = button('Delete list', () => void busy(remove, async () => {
            if (!(await confirmModal({
                title: 'Delete list',
                message: `Delete ${list.name} for everyone on it? This cannot be undone.`,
                confirmLabel: 'Delete',
                destructive: true,
            }))) {
                return;
            }
            try {
                await api.deleteList(list.id);
                closeSheet();
                done();
                emit('lists');
                toast('List deleted');
            }
            catch (error) {
                toast(message(error), 'error');
            }
        }), 'ghost danger');
        actions.push(remove);
    }
    return el('div', { class: 'sheet-block' }, [
        el('h2', { text: list.name }),
        list.description ? el('p', { class: 'muted', text: list.description }) : null,
        el('p', { class: 'muted' }, [
            el('span', { class: 'pill small', text: list.role }),
            ` ${plural(list.itemCount, 'title')} · ${plural(list.memberCount, 'member')}`,
        ]),
        el('div', { class: 'sheet-actions' }, actions),
    ]);
}
function canEdit(role) {
    return role === 'owner' || role === 'editor';
}
function itemsBlock(list, items, refresh) {
    const block = el('section', { class: 'sheet-block' }, [el('h3', { text: 'Titles' })]);
    if (items.length === 0) {
        block.append(el('p', { class: 'muted', text: 'Nothing on this list yet.' }));
        return block;
    }
    for (const item of items)
        block.append(itemRow(list, item, refresh));
    return block;
}
function itemRow(list, item, refresh) {
    const poster = posterUrl(item.movie?.posterPath ?? null, 'w185');
    const open = () => openTitle({ mediaType: item.mediaType, tmdbId: item.tmdbId, title: item.movie?.title });
    const thumb = el('button', {
        class: 'diary-thumb',
        type: 'button',
        'aria-label': item.movie?.title ?? `Title ${item.tmdbId}`,
    }, [
        poster ? el('img', { src: poster, alt: '', loading: 'lazy' }) : el('span', { text: '🎬' }),
    ]);
    thumb.addEventListener('click', open);
    const title = el('button', {
        class: 'link-button',
        type: 'button',
        text: item.movie?.title ?? `#${item.tmdbId}`,
    });
    title.addEventListener('click', open);
    const votes = el('div', { class: 'vote-row' });
    const options = [
        { value: 'yes', label: `Yes ${item.votes.yes}` },
        { value: 'maybe', label: `Maybe ${item.votes.maybe}` },
        { value: 'no', label: `No ${item.votes.no}` },
    ];
    for (const option of options) {
        const chosen = item.votes.myVote === option.value;
        const chip = button(option.label, () => void busy(chip, async () => {
            try {
                if (chosen)
                    await api.clearVote(list.id, item.id);
                else
                    await api.voteOn(list.id, item.id, option.value);
                await refresh();
            }
            catch (error) {
                toast(message(error), 'error');
            }
        }), `chip vote ${option.value}${chosen ? ' active' : ''}`);
        votes.append(chip);
    }
    if (item.votes.awaiting > 0) {
        votes.append(el('span', { class: 'muted', text: `${item.votes.awaiting} yet to vote` }));
    }
    const remove = canEdit(list.role)
        ? button('Remove', () => void busy(remove, async () => {
            try {
                await api.removeListItem(list.id, item.mediaType, item.tmdbId);
                await refresh();
            }
            catch (error) {
                toast(message(error), 'error');
            }
        }), 'ghost small danger')
        : null;
    return el('div', { class: 'list-item' }, [
        thumb,
        el('div', { class: 'diary-main' }, [
            title,
            el('p', { class: 'muted', text: subtitleFor(item.movie) }),
            item.note ? el('p', { class: 'wl-note', text: item.note }) : null,
            el('p', { class: 'muted small', text: `Added by ${item.addedBy.displayName ?? item.addedBy.handle}` }),
            votes,
        ]),
        remove ? el('div', { class: 'row-actions' }, [remove]) : null,
    ]);
}
function openAddTitle(list, refresh) {
    const query = input('search', { placeholder: 'Search films and shows' });
    const results = el('div', { class: 'search-results' });
    let timer;
    query.addEventListener('input', () => {
        window.clearTimeout(timer);
        const value = query.value.trim();
        if (value.length < 2) {
            clear(results);
            return;
        }
        timer = window.setTimeout(() => {
            clear(results);
            results.append(spinner('Searching'));
            void api
                .search(value)
                .then((page) => {
                clear(results);
                if (page.results.length === 0) {
                    results.append(el('p', { class: 'muted', text: 'Nothing matched.' }));
                    return;
                }
                for (const movie of page.results.slice(0, 12)) {
                    const add = button('Add', () => void busy(add, async () => {
                        try {
                            await api.addListItem(list.id, movie.mediaType, movie.tmdbId);
                            add.textContent = 'Added ✓';
                            add.classList.add('active');
                            await refresh();
                        }
                        catch (error) {
                            toast(message(error), 'error');
                        }
                    }), 'ghost small');
                    results.append(el('div', { class: 'result-row' }, [
                        el('span', { text: `${movie.title}${movie.releaseYear ? ` (${movie.releaseYear})` : ''}` }),
                        el('span', { class: 'muted', text: movie.mediaType === 'tv' ? 'Show' : 'Film' }),
                        add,
                    ]));
                }
            })
                .catch((error) => {
                clear(results);
                results.append(el('p', { class: 'error-note', text: message(error) }));
            });
        }, 280);
    });
    const close = modal({
        title: `Add to ${list.name}`,
        body: el('div', { class: 'form' }, [field('Search', query), results]),
        actions: [button('Done', () => close())],
    });
}
function openRename(list, refresh, done) {
    const name = input('text', { value: list.name, maxlength: 80 });
    const description = textarea({ rows: 3, maxlength: 500 });
    description.value = list.description ?? '';
    const save = button('Save', () => void busy(save, async () => {
        try {
            await api.updateList(list.id, {
                name: name.value.trim(),
                description: description.value.trim() || null,
            });
            await refresh();
            done();
            close();
        }
        catch (error) {
            toast(message(error), 'error');
        }
    }), 'primary');
    const close = modal({
        title: 'Rename list',
        body: el('div', { class: 'form' }, [field('Name', name), field('Description', description)]),
        actions: [button('Cancel', () => close()), save],
    });
}
function openSharing(list, refresh, done) {
    const body = el('div', { class: 'form' });
    const paint = (code) => {
        clear(body);
        body.append(el('p', {
            class: 'muted',
            text: code
                ? 'Anyone with this code can join as a viewer. Revoke it and it stops working immediately.'
                : 'No share code yet. Mint one to let someone join without an invite.',
        }));
        if (code) {
            const copy = button('Copy', () => {
                void navigator.clipboard
                    ?.writeText(code)
                    .then(() => toast('Code copied'))
                    .catch(() => toast('Could not copy — select it by hand.', 'error'));
            }, 'ghost small');
            body.append(el('div', { class: 'code-row' }, [el('code', { text: code }), copy]));
        }
        const mint = button(code ? 'Replace code' : 'Create code', () => void busy(mint, async () => {
            try {
                const next = await api.mintShareCode(list.id);
                paint(next);
                await refresh();
                done();
            }
            catch (error) {
                toast(message(error), 'error');
            }
        }), 'primary');
        const revoke = code
            ? button('Revoke', () => void busy(revoke, async () => {
                try {
                    await api.revokeShareCode(list.id);
                    paint(null);
                    await refresh();
                    done();
                }
                catch (error) {
                    toast(message(error), 'error');
                }
            }), 'ghost danger')
            : null;
        body.append(el('div', { class: 'row-actions' }, [mint, revoke]));
    };
    paint(list.shareCode);
    const close = modal({
        title: `Sharing ${list.name}`,
        body,
        actions: [button('Done', () => close())],
    });
}
function membersBlock(list, refresh) {
    const block = el('section', { class: 'sheet-block' }, [el('h3', { text: 'People' })]);
    const holder = el('div', { class: 'stack' }, [spinner('Loading members')]);
    block.append(holder);
    if (list.role === 'owner') {
        const handle = input('text', { placeholder: 'handle', maxlength: 30 });
        const role = select([
            { value: 'viewer', label: 'Viewer — can read and vote' },
            { value: 'editor', label: 'Editor — can add and remove titles' },
        ], 'viewer');
        const send = button('Invite', () => void busy(send, async () => {
            const value = handle.value.trim().toLowerCase().replace(/^@/, '');
            if (!value)
                return;
            try {
                await api.invite(list.id, value, role.value);
                handle.value = '';
                toast('Invited');
                await refresh();
            }
            catch (error) {
                toast(message(error), 'error');
            }
        }), 'ghost');
        block.append(el('div', { class: 'inline-form' }, [handle, role, send]));
    }
    void api
        .listMembers(list.id)
        .then((members) => {
        clear(holder);
        for (const member of members) {
            const controls = [];
            if (list.role === 'owner' && member.role !== 'owner') {
                const roleSelect = select([
                    { value: 'viewer', label: 'Viewer' },
                    { value: 'editor', label: 'Editor' },
                ], member.role);
                roleSelect.addEventListener('change', () => {
                    void api
                        .setMemberRole(list.id, member.userId, roleSelect.value)
                        .then(() => toast('Role updated'))
                        .catch((error) => toast(message(error), 'error'));
                });
                controls.push(roleSelect);
                const kick = button('Remove', () => void busy(kick, async () => {
                    if (!(await confirmModal({
                        title: 'Remove person',
                        message: `Remove ${member.displayName ?? member.handle} from ${list.name}?`,
                        confirmLabel: 'Remove',
                        destructive: true,
                    }))) {
                        return;
                    }
                    try {
                        await api.removeMember(list.id, member.userId);
                        await refresh();
                    }
                    catch (error) {
                        toast(message(error), 'error');
                    }
                }), 'ghost small danger');
                controls.push(kick);
            }
            holder.append(el('div', { class: 'member-row' }, [
                el('span', {}, [
                    el('strong', { text: member.displayName ?? member.handle }),
                    el('span', { class: 'muted', text: ` @${member.handle}` }),
                ]),
                el('span', { class: 'pill small', text: member.role }),
                el('span', { class: 'row-actions' }, controls),
            ]));
        }
    })
        .catch((error) => {
        clear(holder);
        holder.append(el('p', { class: 'error-note', text: message(error) }));
    });
    return block;
}
