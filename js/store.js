const listeners = new Map();
export function on(topic, handler) {
    const set = listeners.get(topic) ?? new Set();
    set.add(handler);
    listeners.set(topic, set);
    return () => set.delete(handler);
}
export function emit(topic) {
    for (const handler of listeners.get(topic) ?? [])
        handler();
}
