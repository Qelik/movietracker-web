"use strict";
/**
 * Offline shell.
 *
 * Cache-first for the app's own files, network-only for the API — a cached
 * watchlist that silently lies about what is on it is worse than an error. Bump
 * CACHE on every deploy or installed devices keep running the old code.
 */
/// <reference lib="webworker" />
// `self` is already declared by lib.webworker as the generic worker scope, so
// it is narrowed here rather than redeclared.
const worker = self;
const CACHE = 'movietracker-v5';
const SHELL = [
    './',
    './index.html',
    './styles.css',
    './manifest.webmanifest',
    './js/app.js',
];
worker.addEventListener('install', (event) => {
    event.waitUntil(caches
        .open(CACHE)
        // Individually, so one missing file does not fail the whole install.
        .then((cache) => Promise.allSettled(SHELL.map((path) => cache.add(path))))
        .then(() => worker.skipWaiting()));
});
worker.addEventListener('activate', (event) => {
    event.waitUntil(caches
        .keys()
        .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
        .then(() => worker.clients.claim()));
});
worker.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET')
        return;
    const url = new URL(request.url);
    // Never cache the API or TMDB artwork: one is user data, the other is huge.
    if (url.pathname.startsWith('/v1/') || url.hostname !== worker.location.hostname)
        return;
    event.respondWith(caches.match(request).then((hit) => {
        if (hit) {
            // Refresh in the background so the next load is current.
            void fetch(request)
                .then((response) => {
                if (response.ok)
                    void caches.open(CACHE).then((cache) => cache.put(request, response));
            })
                .catch(() => undefined);
            return hit;
        }
        return fetch(request)
            .then((response) => {
            if (response.ok && url.origin === worker.location.origin) {
                const copy = response.clone();
                void caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
        })
            .catch(async () => {
            const fallback = await caches.match('./index.html');
            if (fallback)
                return fallback;
            return new Response('Offline', { status: 503, statusText: 'Offline' });
        });
    }));
});
