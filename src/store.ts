/**
 * A one-line event bus.
 *
 * Logging a film from the Discover tab has to be visible on the Diary tab, and
 * neither knows about the other. Views subscribe while they are on screen and
 * re-fetch when something changes.
 */
type Topic = 'library' | 'lists' | 'notifications' | 'profile'

const listeners = new Map<Topic, Set<() => void>>()

export function on(topic: Topic, handler: () => void): () => void {
  const set = listeners.get(topic) ?? new Set()
  set.add(handler)
  listeners.set(topic, set)
  return () => set.delete(handler)
}

export function emit(topic: Topic): void {
  for (const handler of listeners.get(topic) ?? []) handler()
}
