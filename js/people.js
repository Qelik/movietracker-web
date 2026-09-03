/**
 * Somebody else's profile: who they are, whether you follow them, and what
 * they have been watching.
 *
 * A sheet rather than a tab, because it is always opened from somewhere — a
 * feed row, a shared list's member list — and going back should land you where
 * you were.
 */
import * as api from './api.js';
import { sectionHead } from './components.js';
import { busy, button, clear, el, modal, spinner, toast } from './dom.js';
import { feedRow } from './feed.js';
export function openProfile(handle) {
    const body = el('div', { class: 'person-sheet' }, [spinner('Loading')]);
    modal({ title: `@${handle}`, body, wide: true });
    void render(body, handle);
}
async function render(body, handle) {
    let view;
    try {
        view = await api.profile(handle);
    }
    catch (error) {
        clear(body);
        body.append(el('p', {
            class: 'error-note',
            text: error instanceof Error ? error.message : 'Something went wrong',
        }));
        return;
    }
    clear(body);
    const name = view.user.displayName?.trim() || `@${view.user.handle}`;
    body.append(el('div', { class: 'person-head' }, [
        el('div', { class: 'person-text' }, [
            el('h2', { text: name }),
            el('p', { class: 'hero-facts', text: `@${view.user.handle}` }),
            el('p', {
                class: 'muted',
                text: `${view.counts.followers} following them · ${view.counts.following} they follow`,
            }),
        ]),
    ]));
    if (!view.isSelf) {
        body.append(el('div', { class: 'row-actions' }, [followButton(view, body, handle)]));
    }
    if (!view.canSeeActivity) {
        body.append(el('p', {
            class: 'muted',
            // Distinguished from "has watched nothing", which is a different fact.
            text: view.isFollowing
                ? 'This account keeps its viewing private.'
                : 'Follow to see what they watch, if they share it.',
        }));
        return;
    }
    body.append(sectionHead('Recently'));
    if (view.activity.length === 0) {
        body.append(el('p', { class: 'muted', text: 'Nothing logged yet.' }));
        return;
    }
    body.append(el('div', { class: 'credit-list' }, view.activity.map((item) => feedRow(item, false))));
}
function followButton(view, body, handle) {
    const following = view.isFollowing === true;
    const node = button(following ? 'Following ✓' : 'Follow', () => void busy(node, async () => {
        try {
            if (following) {
                await api.unfollow(handle);
                toast(`Unfollowed @${handle}`);
            }
            else {
                await api.follow(handle);
                toast(`Following @${handle}`);
            }
            // Redrawn rather than toggled in place: following can change what the
            // rest of the sheet is allowed to show.
            await render(body, handle);
        }
        catch (error) {
            toast(error instanceof Error ? error.message : 'Something went wrong', 'error');
        }
    }), following ? 'ghost active' : 'primary');
    return node;
}
