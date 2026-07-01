# Infinite Scroll for List Views (Grid + Table)

**Date:** 2026-07-01
**Status:** Approved design — pending implementation plan

## Summary

Replace the paginated "Items per page / 1–18 of 100 / NEXT" bar on every list view
with **lazy loading (infinite scroll)** for both the grid and table (Datagrid)
views. The design must remain fast for libraries with **tens of thousands of
entries**, so rendering is **windowed (virtualized)**: only the rows/tiles
currently on screen are mounted in the DOM.

Applies to **all** list resources: Albums (grid + table), Songs, Artists,
Playlists (and playlist tracks), Radios, Shares, Users, Libraries, Missing,
Plugins, Transcodings.

## Goals

- Remove the MUI `TablePagination` bar from all list views.
- Infinite scroll: fetch the next batch as the user approaches the end of the
  loaded set.
- Keep the DOM small regardless of total list size (windowed virtualization),
  so 10k–100k+ item lists scroll smoothly.
- Preserve existing list behaviors: sortable column headers, filters/search,
  column selection, bulk selection, row drag-and-drop (react-dnd), expandable
  rows, missing-row styling, and the mobile `SimpleList` fallbacks.
- Single reusable mechanism shared across every resource.

## Non-Goals

- No backend changes. The native REST API already supports offset/limit via
  `_start`/`_end` and returns `X-Total-Count`.
- No change to sorting/filtering semantics.
- Not upgrading react-admin to v4 (which has a built-in `<InfiniteList>`); we
  build the equivalent on top of react-admin 3.x.

## Current State (for context)

- **Stack:** react-admin `^3.19.12`, Material-UI v4, React 17, data provider
  `ra-data-json-server` hitting the Go backend at `/api`.
- react-admin **3.x has no `<InfiniteList>`** — this is a custom build.
- Pagination wrapper: `ui/src/common/Pagination.jsx` (wraps RA `<Pagination>`);
  default `perPage` set in `ui/src/common/List.jsx`; album page sizing in
  `ui/src/common/useAlbumsPerPage.jsx`.
- **Only the Album list has a grid/table toggle** (`ui/src/album/AlbumList.jsx`
  switches on `state.albumView.grid`). All other resources are Datagrid-only
  with a `SimpleList` fallback on xs.
- Grid: `ui/src/album/AlbumGridView.jsx` uses MUI `GridList`/`GridListTile`
  (columns per breakpoint via `getColsForWidth`). Renders only the current
  page's `ids`; no virtualization.
- Table: `ui/src/album/AlbumTableView.jsx` and others use the RA composition
  pattern (custom `Datagrid` + `DatagridBody` + `DatagridRow`) plus
  `useSelectedFields` for column selection.
- Data flow: RA list controller → `dataProvider.getList` → `_start`/`_end` +
  `X-Total-Count`. No existing infinite scroll or virtualization anywhere.

## Approach

Use **`react-virtuoso`** for windowing plus a **shared infinite-list
controller** hook.

`react-virtuoso` is chosen because it is the one library that cleanly windows
*both* view shapes we need:

- `TableVirtuoso` windows a **real `<table>`** with a sticky header and variable
  row heights — preserving our semantic markup, column alignment, and CSS while
  only mounting on-screen rows.
- `VirtuosoGrid` windows the album grid with responsive columns.
- Both expose an `endReached` callback used to trigger the next fetch.

Rejected alternatives:

- **`react-window`** — no table primitive; would force replacing the `<table>`
  with absolutely-positioned divs, breaking sticky headers, column alignment,
  and existing CSS. Much more custom code and regression risk.
- **Bounded-window append (no virtualization)** — caps DOM at ~N by evicting
  off-screen rows; simpler but causes re-fetch/scroll-jump when scrolling back
  up and still mounts hundreds of heavy rows. Weaker on the stated
  tens-of-thousands concern.

## Components

### 1. `useInfiniteListController(resource, options)`

A new hook (`ui/src/common/useInfiniteListController.js`) that replaces the
paged list controller for these views.

Responsibilities:

- Read current **sort**, **filter/search**, and library/permission filters from
  react-admin's list params (redux) so behavior matches today.
- Fetch in fixed **batches** via `dataProvider.getList` (batch size internal,
  e.g. 50 — decoupled from any user-visible "per page").
- Maintain accumulated `ids: string[]` and `data: Record<id, record>`, plus
  `total` (from `X-Total-Count`), `loading`, `loadingMore`, `hasMore`, and
  `error`.
- Expose `loadMore()` (fetches the next batch, no-op while a fetch is in flight
  or when `!hasMore`).
- **Reset** accumulation and scroll-to-top whenever sort, filter, or search
  changes (so results stay correct and ordered).
- Expose a react-admin-shaped **`ListContext`** value (`ids`, `data`, `total`,
  `resource`, `currentSort`, `setSort`, `filterValues`, selection state, etc.)
  so existing Datagrid/GridView internals consume it unchanged.

### 2. `InfiniteDatagrid`

A reusable table shell (`ui/src/common/InfiniteDatagrid.jsx`) wrapping the
existing Datagrid body in `TableVirtuoso`:

- `fixedHeaderContent` renders the existing sortable column headers (sticky).
- Row renderer delegates to the existing `*DatagridRow` components, so react-dnd
  drag, bulk-select checkboxes, expand, and missing-row styling are preserved.
- `endReached` → `loadMore()`.
- Column selection via `useSelectedFields` continues to work (headers + rows
  driven by the same field list).

### 3. `InfiniteGrid`

A reusable grid shell (`ui/src/common/InfiniteGrid.jsx`) wrapping album tiles in
`VirtuosoGrid`:

- Responsive column count computed from container width (reuse
  `getColsForWidth`).
- Renders the existing `AlbumGridTile` per item (cover, hover bar, context menu,
  drag).
- `endReached` → `loadMore()`.

### 4. Footer status + removal of pagination bar

- Remove `<Pagination>` usage from `ui/src/common/List.jsx` and per-resource
  lists.
- Replace with a lightweight footer: **"X of Y loaded"** + a spinner while
  fetching, and an end-of-list marker when `!hasMore`.
- Remove the "Items per page" selector. Retire the per-page logic in
  `useAlbumsPerPage.jsx` (grid **column count** stays width-based; per-page
  sizing is no longer needed).

### 5. Mobile fallback

The xs `SimpleList` fallbacks (songs, artists) are wrapped in Virtuoso's list
variant with the same `endReached` → `loadMore()`.

## Data Flow

1. List mounts → `useInfiniteListController` reads sort/filter from RA params →
   fetches batch 1 (`_start=0&_end=50`), stores ids/data, reads `X-Total-Count`
   for `total`.
2. User scrolls → Virtuoso fires `endReached` near the bottom → `loadMore()`
   fetches the next batch and appends to accumulated ids/data.
3. Only on-screen rows/tiles are mounted (windowing); spacers preserve scroll
   height.
4. Sort/filter/search change → controller resets accumulation, scrolls to top,
   fetches batch 1 for the new params.

## Cross-Cutting Details

- **Scroll restoration:** persist scroll position/top index per resource so
  back-navigation returns to the prior position (Virtuoso
  `initialTopMostItemIndex` / range state).
- **Sort:** clicking a column header resets accumulation and scrolls to top.
- **Empty & error states:** reuse existing react-admin empty/loading components;
  surface `error` from the controller.
- **In-flight guard:** `loadMore()` ignores calls while a fetch is pending and
  when `!hasMore`.
- **Selection:** bulk-select and the selection toolbar continue to operate over
  the accumulated ids.

## Dependency

Add `react-virtuoso` (~45KB gz) to `ui/package.json`. Verify license
(MIT-compatible) and React 17 compatibility (react-virtuoso v2/v3 support React
17).

## Testing

- **Unit** (`useInfiniteListController`): batch accumulation; reset on
  sort/filter/search change; `hasMore`/`total` derivation from `X-Total-Count`;
  in-flight/`!hasMore` guards on `loadMore()`.
- **Component:** `endReached` triggers `loadMore`; only a window of rows/tiles
  mounts for a large mocked dataset; sortable headers still dispatch `setSort`;
  drag/bulk-select props still present on rows.
- **Manual:** verify smooth scroll, correct totals, sort/filter reset, and
  scroll restoration against a large local library (tens of thousands of songs).

## Rollout / Risks

- Highest-risk surface is `TableVirtuoso` interplay with the custom
  `DatagridBody`/`DatagridRow` composition and react-dnd. Land Album views
  (grid + table) first as the reference implementation, then apply the shared
  shells to the remaining Datagrid resources.
- If `TableVirtuoso` cannot host the existing row composition cleanly, the
  fallback is bounded-window append for tables only (grid still virtualized).
