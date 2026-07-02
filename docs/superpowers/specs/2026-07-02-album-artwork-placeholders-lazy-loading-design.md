# Album Artwork Placeholders + Native Lazy-Loading

**Date:** 2026-07-02
**Status:** Approved design — pending implementation plan

## Summary

Throughout the app, cover art currently shows an empty/blank block while the
image loads, and every cover is fetched up front regardless of whether it is on
screen. This change does two things:

1. **Placeholder** — give every cover a calm, theme-aware neutral block while its
   image is in flight, with the image fading in on load. No more blank boxes
   (the album grid is the worst offender — it renders a fully transparent box).
2. **Native lazy-loading** — let the browser fetch covers progressively
   (only those near the viewport) using native `<img loading="lazy">`, instead
   of the current custom `fetch()` → blob → manual queue pipeline.

## Goals

- Replace the blank loading block with a neutral placeholder + fade-in
  everywhere cover art is shown.
- Load covers progressively (viewport-based), so large lists don't request every
  image at once.
- Reduce custom code: remove the bespoke image pipeline where the browser can do
  the job natively.
- Keep behavior consistent across all cover-art surfaces.

## Non-Goals

- **No server changes.** The server already serves cover art with
  `Cache-Control: public, max-age=315360000` and substitutes stock art for
  records without their own (see "Key facts" below).
- **No manual "force overflow images to load once visible ones finish."** This
  fights native lazy-loading and directly undermines the progressive-loading
  goal. The browser's built-in scroll-ahead + connection-aware loading is the
  correct version of this idea, so we lean on it.
- **No custom "missing art" icon.** The server already returns Navidrome's
  official stock art for records with no cover; inventing our own client
  fallback would be inconsistent with the rest of the app.

## Key facts that make this safe (verified in the codebase)

- **Server returns real images, cached for 10 years.**
  `server/subsonic/media_retrieval.go:82` sets
  `cache-control: public, max-age=315360000`. Cover URLs are cache-busted by
  `_: record.updatedAt` (`ui/src/subsonic/index.js:83`). So the browser HTTP
  cache serves remounts instantly — **no flicker** when React-Admin remounts
  list rows. This is the *entire* stated reason the custom
  `useImageUrl` blob-cache exists ("so React Admin refreshes ... don't re-fetch
  images"), and it is now redundant.
- **Auth is in the query string**, so a plain `<img src={url}>` loads directly —
  no headers/fetch needed.
- **Stock art is server-side.** `core/artwork/artwork.go:44`
  `GetOrPlaceholder` substitutes `PlaceholderAlbumArt` / `PlaceholderArtistArt`
  for records with no cover. `getCoverArt` returns **200 with the stock image**,
  not an error. So "no cover art" is not a client concern.

## Three loading states (and who owns each)

| State | Owner | Result |
|---|---|---|
| **Loading** (request in flight) | **Client (this change)** | Neutral placeholder block |
| **No cover art** (record has none) | **Server** (already done) | Navidrome stock art, arrives as a normal image |
| **Genuine failure** (404 bad id, network drop, auth) | Thin client `onError` | Neutral block stays visible (rare) |

## Current State (for context)

All cover art flows through `ui/src/common/useImageUrl.js` — a custom hook that:

- `fetch()`es the image, converts to a blob URL, caches in a module-level `Map`
  (max 300, ref-counted, LRU-ish eviction).
- Throttles to **4 concurrent fetches** via a manual queue (comment: reserve
  HTTP/1.1 connections for API calls).
- Aborts in-flight requests on unmount.
- Returns `{ imgUrl, loading, error }`.

There is **no** `loading="lazy"` and no viewport awareness — every cover is
eventually fetched, even far offscreen.

Consumers (4):

- `ui/src/album/AlbumGridView.jsx` — `Cover`. Uses `loading` to fade in over a
  **transparent** container (the blank-box bug). **Primary target.**
- `ui/src/home/HomeCard.jsx` — `HomeCard`. Uses `loading` to fade in over a gray
  background (`#333`/`#eee`).
- `ui/src/common/CoverArtAvatar.jsx` — MUI `Avatar`, transparent while loading.
- `ui/src/radio/RadioList.jsx` — `CoverArtField`. **Special case:** only fetches
  when `record.uploadedImage` is set; otherwise uses a client-side
  `RADIO_PLACEHOLDER_IMAGE`. Does *not* rely on server stock art.

## Design

### 1. Loading pipeline — go native

Render covers as native lazy images instead of hook-driven blobs:

```jsx
<img
  loading="lazy"
  src={coverUrl}          // direct getCoverArt URL (auth in query string)
  fetchpriority="low"     // let data/API requests win the connection pool
  onLoad={handleLoad}     // trigger fade-in
  onError={handleError}   // keep neutral block visible (rare)
/>
```

- **Progressive loading** is free: the browser only fetches covers near the
  viewport and throttles by its own connection pool. This replaces the manual
  4-concurrent queue.
- **No remount flicker**: the 10-year cache + `updatedAt` busting means the HTTP
  cache serves instantly.
- `fetchpriority="low"` preserves the intent of the old concurrency cap
  (reserve connections for API), which matters mainly on HTTP/1.1.
- **Delete** `ui/src/common/useImageUrl.js` and its `common/index.js` export
  once all consumers are migrated. Remove/replace its test.

### 2. Shared `CoverImage` component

Create `ui/src/common/CoverImage.jsx` — a small presentational component that
owns the placeholder + fade + error behavior for the bare-`<img>` surfaces
(grid, home), so the behavior lives in one place:

- Props: `src`, `alt`, `className`, plus whatever the callers need to style
  size/shape (callers keep their own geometry classes; `CoverImage` only owns
  the placeholder background, fade transition, and load/error state).
- Renders a neutral placeholder block behind the image (theme-aware:
  `#333` dark / `#eee` light — reuse HomeCard's existing values).
- Tracks a `loaded` boolean via `onLoad`; applies the existing
  `opacity 0.3s ease-in-out` fade (image starts at `opacity: 0`, goes to `1`).
- **Cached-image gotcha:** an image served from HTTP cache can be `complete`
  before React attaches `onLoad`, leaving it stuck invisible. On mount, if the
  `<img>` ref's `.complete` is already true, set `loaded` immediately. This
  matters because our images are aggressively cached.
- `onError`: leave the placeholder block visible; do not swap in a custom icon.

Export it from `ui/src/common/index.js`.

### 3. Migration per consumer

- **AlbumGridView** (`Cover`): replace the hook + bare `<img>` with `CoverImage`.
  Keep the `withContentRect` sizing and drag ref. This fixes the transparent
  blank box.
- **HomeCard**: replace the hook + `<img>` with `CoverImage`. Its existing gray
  `art` background becomes the placeholder (folded into `CoverImage`). The
  `HomeCardSkeleton` shimmer (data-loading shelf state) is unchanged.
- **CoverArtAvatar**: drop the hook; use MUI `Avatar` with a direct `src` and
  `imgProps={{ loading: 'lazy' }}` (MUI v4 forwards `imgProps` to the underlying
  `<img>`). Add a neutral background while loading instead of the transparent
  `avatarEmpty`. (An avatar is not a bare `<img>`, so it does not use
  `CoverImage`.)
- **RadioList** (`CoverArtField`): drop the hook. When `uploadedImage` is set,
  use the direct URL with `imgProps={{ loading: 'lazy' }}`; otherwise keep
  `RADIO_PLACEHOLDER_IMAGE` exactly as today. Radio behavior is otherwise
  unchanged.

### 4. No per-cover skeleton shimmer

A shimmer on every tile in a long scrolling grid is visually noisy. The
placeholder is a calm static neutral block. The existing `HomeCardSkeleton`
shimmer stays scoped to the shelf *data*-loading state only.

## Testing

- Update the existing `ui/src/home/HomeCard.test.jsx` (already modified in the
  working tree) for the native `<img>` + placeholder behavior.
- Add `ui/src/common/CoverImage.test.jsx`: renders placeholder before load,
  fades in on `onLoad`, handles the already-`complete` (cached) case, and keeps
  the placeholder on `onError`.
- Remove or replace `useImageUrl`'s test when the hook is deleted.
- Manual/visual check: album grid, home shelves, table-view avatars, and radio
  list all show the placeholder then the image, with no blank boxes and no
  flicker on list refresh/remount.

## Risks & mitigations

- **Loss of the 4-concurrent cap on HTTP/1.1.** Native lazy-loading already
  bounds in-flight requests to roughly a viewport's worth of covers, and
  `fetchpriority="low"` yields the connection pool to API/XHR. Acceptable, and
  how most web apps behave; HTTP/2 deployments are unaffected.
- **`loading="lazy"` + fade double-hiding.** If the fade CSS hides an image that
  the browser also defers, ensure the placeholder block (not a hidden image) is
  what's visible while deferred; the image only fades in once it actually loads.
- **Cached `complete` image never fires `onLoad`.** Handled explicitly in
  `CoverImage` (see §2).
