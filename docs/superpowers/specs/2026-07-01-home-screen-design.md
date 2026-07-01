# Home Screen — Design Spec

**Date:** 2026-07-01
**Status:** Draft for review
**Author:** Tyler (with Claude)

## 1. Summary

Add a personalized **Home** screen to the Navidrome web UI. It becomes the
default landing page (`/`) and presents a vertical stack of horizontal-scrolling
**shelves** (Spotify/Netflix style): recently added albums, recently played
albums, favorite artists, favorite albums, recent artists, recent songs, and
recent playlists. Each shelf has a title, a **"Show all"** link that opens the
corresponding existing list view, and a row of cards with hover-to-play.

Two supporting backend changes make the "recent artists" and "recent songs"
shelves possible, using play history that Navidrome already records.

## 2. Goals / Non-goals

**Goals**
- A Home page that surfaces the user's favorites and recent activity at a glance.
- Horizontal, touch/scroll-friendly carousels with a "Show all" affordance.
- Reuse existing Navidrome list views for "Show all" (no new full-page grids).
- Make "recent artists" and "recent songs" real, backed by play history.
- Ensure plays from external clients feed the recent shelves (as best we can).

**Non-goals**
- No new dedicated full-page grid views (we reuse existing list pages).
- No recommendation engine / "made for you" / discovery mixes.
- No redesign of existing list/detail pages.
- No change to how favorites (stars) or ratings work.

## 3. UX / Layout

The page renders shelves top-to-bottom in this order. **Favorites and recent
shelves hide themselves entirely when they have zero items** — so a new user who
has favorited nothing and played nothing sees only what's populated (at minimum,
Recently Added). If *every* shelf is empty (fresh install, empty library), the
page shows a friendly empty state linking to the library.

| # | Shelf title       | Card shape | Hidden when empty |
|---|-------------------|-----------|-------------------|
| 1 | Recently Added    | square    | no (fallback)     |
| 2 | Recently Played   | square    | yes               |
| 3 | Favorite Artists  | circle    | yes (+ favourites flag) |
| 4 | Favorite Albums   | square    | yes (+ favourites flag) |
| 5 | Recent Artists    | circle    | yes               |
| 6 | Recent Songs      | square    | yes               |
| 7 | Recent Playlists  | square    | yes               |

**Shelf anatomy** (matches the provided Spotify reference):
- Title on the left; **"Show all"** link on the right.
- A horizontal row of cards; left/right chevron buttons + scroll-snap; native
  touch scroll on mobile.
- Artist cards are **circular**; album/playlist/song cards are **square**.
- Each card shows artwork, a primary label (name/title), and a secondary label
  (e.g. "Artist", or the track's artist for songs).

**Card interactions** (reuse existing behaviors from `common/`):
- Hover → play-button overlay (`common/PlayButton.jsx`).
- Click → the entity's show page (`AlbumShow`, `ArtistShow`, `PlaylistShow`).
  Songs have no show page, so clicking a song card **plays** it.
- Three-dot context menu (`AlbumContextMenu`, `ArtistContextMenu`,
  `SongContextMenu`).
- Favorite heart (`common/LoveButton.jsx`), gated by `config.enableFavourites`.

## 4. Frontend architecture

React-admin v3 app under `ui/src`. New code lives in a new `ui/src/home/`
folder, modeled on the existing custom-route page `ui/src/personal/Personal.jsx`.

- **`Home.jsx`** — top-level page. Renders the shelves in order and owns the
  all-empty state. Contains no data-fetching logic of its own.
- **`Shelf.jsx`** — reusable, self-contained shelf. Props:
  `{ title, showAllLink, resource, sort, filter, perPage, CardComponent }`.
  - Fetches its own data via react-admin `useGetList(resource, { pagination:
    { page: 1, perPage }, sort, filter })`.
  - Renders the header (title + "Show all") and a `Carousel` of `CardComponent`.
  - **Returns `null` when it has zero items** (after loading), so empty shelves
    disappear. Shows a lightweight skeleton/placeholder while loading.
- **`Carousel.jsx`** — presentational horizontal scroll container: chevron
  buttons, CSS scroll-snap, no data concerns.
- **Card components** — reuse the `Cover` / `AlbumGridTile` pattern from
  `ui/src/album/AlbumGridView.jsx` (drag support, `subsonic.getCoverArtUrl`,
  hover play). Add an **artist (circular) variant** and reuse existing
  `common/CoverArtAvatar.jsx` where appropriate. Cover art for all entity types
  is produced by `subsonic.getCoverArtUrl(record, size, square)`.

**Why per-shelf fetching (chosen approach):** each shelf owns one `useGetList`,
so shelves load independently (one slow/empty query never blocks the others),
stay isolated and independently testable, and integrate with react-admin's
cache. Rejected alternatives: fetching everything in `Home` and passing down
(more coupling, head-of-line blocking); using Subsonic `getStarred2` for
favorites (bypasses the react-admin dataProvider/cache the rest of the app uses).

## 5. Shelf data sources & "Show all" targets

All queries go through the native `/api` dataProvider. Params mirror the existing
`ui/src/album/albumLists.jsx` definitions where they already exist.

| # | Shelf | resource | sort / filter | "Show all" → |
|---|-------|----------|---------------|--------------|
| 1 | Recently Added   | `album`    | `sort=recently_added&order=DESC` | `#/album/recentlyAdded` |
| 2 | Recently Played  | `album`    | `sort=play_date&order=DESC&filter={"recently_played":true}` | `#/album/recentlyPlayed` |
| 3 | Favorite Artists | `artist`   | `sort=starred_at&order=DESC&filter={"starred":true}` | artist list, `starred` filter |
| 4 | Favorite Albums  | `album`    | `sort=starred_at&order=DESC&filter={"starred":true}` | `#/album/starred` |
| 5 | Recent Artists   | `artist`   | `sort=play_date&order=DESC&filter={"recently_played":true}` | artist list, recent sort *(new)* |
| 6 | Recent Songs     | `song`     | `sort=play_date&order=DESC&filter={"recently_played":true}` | song list, recent sort *(new)* |
| 7 | Recent Playlists | `playlist` | `sort=updatedAt&order=DESC` | `#/playlist` |

- Shelves 3 & 4 are additionally gated behind `config.enableFavourites`.
- `perPage` ≈ 20 per shelf.
- Shelves 5 & 6 depend on the backend additions in §6.
- The "Show all" links for shelves 5 & 6 use the same new filter/sort, so the
  list views they open are consistent with the shelf.

## 6. Backend changes

### 6.1 Expose "recently played" for songs and artists

Today only albums expose a `recently_played` filter and `play_date` sort; songs
expose only `recently_added`, and artists expose neither. The underlying data
already exists: `incPlay` (`core/scrobbler/play_tracker.go:441`) increments
`play_count` + `play_date` on the song, its album, **and** its artist in the
`annotation` table on every registered play.

Mirror the album pattern (`persistence/album_repository.go`,
`recentlyPlayedFilter` = `Gt{"play_count": 0}`):

- **`persistence/mediafile_repository.go`** — register
  `"recently_played": recentlyPlayedFilter` in `mediaFileFilter()`, and ensure
  `play_date` is usable as a sort key (add a sort mapping if the direct column
  reference is not already resolved).
- **`persistence/artist_repository.go`** — register the `recently_played` filter
  and a `play_date` sort in `registerModel` / `setSortMappings`.
- Table-qualify `play_count` / `play_date` (e.g. `annotation.play_count`) to
  avoid ambiguous-column errors on the joined annotation table.

### 6.2 Recent playlists sort

`persistence/playlist_repository.go` currently maps only `owner_name`. Add a sort
mapping so the UI can request recently-updated playlists (map the UI's
`updatedAt` to the `updated_at` column if the dataProvider does not already
resolve it).

### 6.3 External-client play logging ("as best we can")

**Foundation (already works):** plays registered via the Subsonic `scrobble`
endpoint (`submission=true`, `server/subsonic/media_annotation.go:158`) flow
through `incPlay` and populate song/album/artist play history. Any external
Subsonic client with scrobbling enabled (DSub, Symfonium, play:Sub, Feishin,
etc.) already feeds the recent shelves — this is the same pipeline behind today's
"Recently Played albums." No change required for these clients; document that
scrobbling should be enabled in the client.

**Gap:** `/rest/stream` (`server/subsonic/stream.go:20`) does not itself register
a play, so a client that only streams and never scrobbles leaves no history.

**Decision (pending user confirmation on review):** add an **opt-in,
off-by-default** config-gated fallback that registers a play from `/rest/stream`
requests for non-scrobbling clients, to "try as best we can." To protect
play-count accuracy it must:
- be **disabled by default** (new config flag, e.g. `RecordPlaysFromStream`);
- only count after a **play-time/position threshold** consistent with the
  existing scrobble threshold (50% of duration or 4 minutes, see
  `play_tracker.go`);
- **dedupe against scrobbles** for the same client/track/time window so a client
  that both streams and scrobbles is not double-counted.

> **Open question for reviewer:** keep this fallback in scope (opt-in), or drop
> it and rely solely on the scrobble pipeline? It is isolated from the rest of
> the feature and can be removed without affecting the Home screen.

## 7. Routing & navigation

- **`ui/src/App.jsx`** — pass `dashboard={Home}` to `<RAAdmin>` so Home renders
  at `/` and is the post-login landing page. Existing `/album` redirect behavior
  is unchanged; "Recently Added albums" remains reachable via the Albums menu.
- **`ui/src/layout/Menu.jsx`** — add a **Home** `MenuItemLink` (to `/`) at the
  top of the sidebar.

## 8. Testing

**Go (persistence)** — mirror existing album-repo tests:
- `mediafile_repository` and `artist_repository`: `recently_played` filter
  returns only items with plays; `play_date` sort orders by most-recent play.
- If the §6.3 fallback is kept: tests for the threshold gate, the off-by-default
  behavior, and scrobble dedup.

**UI (Jest / React Testing Library)** — follow existing UI test patterns:
- `Shelf`: renders cards from data; **returns null when empty**; respects the
  `config.enableFavourites` gate for favorites shelves; renders the "Show all"
  link to the correct target.
- `Carousel`: chevron scrolling / scroll-snap behavior.
- `Home`: composes shelves in order; renders the all-empty state when every
  shelf is empty.

## 9. Files touched (summary)

**New:** `ui/src/home/Home.jsx`, `ui/src/home/Shelf.jsx`,
`ui/src/home/Carousel.jsx`, card component(s), and their tests.

**Modified:** `ui/src/App.jsx` (dashboard), `ui/src/layout/Menu.jsx` (menu item),
`persistence/mediafile_repository.go`, `persistence/artist_repository.go`,
`persistence/playlist_repository.go` (+ tests). Optionally (§6.3):
`server/subsonic/stream.go` / play-tracker + config flag.

## 10. Open questions / decisions to confirm

1. **§6.3 external-play fallback** — keep the opt-in stream-based fallback, or
   rely solely on the scrobble pipeline? (Currently specced as opt-in,
   off-by-default.)
2. **Shelf order** — the order in §3 follows the user's stated list; confirm or
   reorder.
3. **Items per shelf** — `perPage ≈ 20`; confirm.
