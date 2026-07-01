# Infinite Scroll for List Views — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the paginated list bar with windowed (virtualized) infinite scroll for the Album grid and table views, backed by a reusable controller that scales to tens of thousands of rows.

**Architecture:** A new `useInfiniteListController` hook fetches `dataProvider.getList` in fixed batches and accumulates `ids`/`data`, tracking `total` from `X-Total-Count`. Two presentation shells consume it: `InfiniteGrid` (wraps album tiles in react-virtuoso `VirtuosoGrid`) and `InfiniteDatagrid` (renders a real `<table>` via react-virtuoso `TableVirtuoso`, cloning react-admin field elements per visible row — the same technique react-admin's `DatagridBody` uses internally, but windowed). `AlbumList` swaps its paged `<List>` data flow for the infinite controller and drops the pagination bar.

**Tech Stack:** React 17, react-admin 3.19.12 (no built-in `<InfiniteList>`), Material-UI v4, react-virtuoso 4.18.10, Vitest + @testing-library/react-hooks.

## Global Constraints

- Target React **17.0.2** — react-virtuoso **4.18.10** (peer `react: >=16||>=17||>=18||>=19`, verified).
- react-admin **3.19.12**, Material-UI **v4** — no react-admin v4 APIs (`<InfiniteList>`, `useInfiniteGetList`) exist here.
- Data fetching goes through `dataProvider.getList(resource, { pagination: { page, perPage }, sort: { field, order }, filter })` → resolves `{ data: Record[], total: number }`. Do NOT bypass the data provider (the wrapper adds library + `missing:false` filters).
- Tests run with `npm test` (Vitest, `--watch=false`) from `ui/`. Hook tests use `renderHook`/`act` from `@testing-library/react-hooks` and mock `react-admin`'s `useDataProvider` per the pattern in `ui/src/common/useRating.test.js`.
- Lint is zero-tolerance: `npm run lint` must pass with `--max-warnings 0`. Run `npm run prettier` before committing.
- Scope of THIS plan: the shared mechanism + **Album** grid & table only. Rolling the shells out to Songs/Artists/Playlists/etc. is a follow-up plan (see "Follow-up" at the end).

---

### Task 1: Add react-virtuoso dependency

**Files:**
- Modify: `ui/package.json` (dependencies)
- Modify: `ui/package-lock.json` (generated)

**Interfaces:**
- Produces: the `react-virtuoso` module (`Virtuoso`, `VirtuosoGrid`, `TableVirtuoso`) for later tasks.

- [ ] **Step 1: Install the dependency**

Run from `ui/`:
```bash
npm install react-virtuoso@4.18.10 --save-exact
```

- [ ] **Step 2: Verify it resolves and imports**

Run from `ui/`:
```bash
node -e "console.log(Object.keys(require('react-virtuoso')).filter(k=>/Virtuoso/.test(k)))"
```
Expected: an array containing `Virtuoso`, `VirtuosoGrid`, `TableVirtuoso`.

- [ ] **Step 3: Confirm the build still boots**

Run from `ui/`: `npm run lint`
Expected: exit 0 (no new warnings).

- [ ] **Step 4: Commit**

```bash
git add ui/package.json ui/package-lock.json
git commit -m "build(ui): add react-virtuoso for list virtualization"
```

---

### Task 2: `useInfiniteListController` hook

The pure data engine: batched fetch + accumulation + reset-on-key-change. Fully testable in isolation.

**Files:**
- Create: `ui/src/common/useInfiniteListController.js`
- Test: `ui/src/common/useInfiniteListController.test.js`

**Interfaces:**
- Consumes: `useDataProvider` from `react-admin` → `{ getList }`.
- Produces:
  ```js
  useInfiniteListController({ resource, sort, filter, batchSize = 50 }) => {
    ids,          // string[] accumulated, de-duplicated, in fetch order
    data,         // { [id]: record }
    total,        // number | undefined (from getList result.total)
    loaded,       // boolean — first batch has resolved at least once
    loading,      // boolean — any fetch in flight
    loadingMore,  // boolean — a fetch beyond the first batch is in flight
    error,        // any | null
    hasMore,      // boolean — ids.length < total
    loadMore,     // () => void — fetch the next batch (no-op if loading or !hasMore)
  }
  ```
- Reset semantics: whenever `JSON.stringify({ resource, sort, filter })` changes, accumulation clears and batch 1 refetches.

- [ ] **Step 1: Write the failing tests**

```js
// ui/src/common/useInfiniteListController.test.js
import { renderHook, act } from '@testing-library/react-hooks'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useDataProvider } from 'react-admin'
import { useInfiniteListController } from './useInfiniteListController'

vi.mock('react-admin', async () => {
  const actual = await vi.importActual('react-admin')
  return { ...actual, useDataProvider: vi.fn() }
})

const makeRecords = (from, to) =>
  Array.from({ length: to - from }, (_, i) => ({ id: `id-${from + i}` }))

describe('useInfiniteListController', () => {
  let getList
  beforeEach(() => {
    vi.clearAllMocks()
    getList = vi.fn()
    useDataProvider.mockReturnValue({ getList })
  })

  const opts = {
    resource: 'album',
    sort: { field: 'name', order: 'ASC' },
    filter: {},
    batchSize: 50,
  }

  it('fetches the first batch on mount and exposes ids/total/hasMore', async () => {
    getList.mockResolvedValueOnce({ data: makeRecords(0, 50), total: 120 })
    const { result, waitForNextUpdate } = renderHook(() =>
      useInfiniteListController(opts),
    )
    await waitForNextUpdate()
    expect(getList).toHaveBeenCalledWith('album', {
      pagination: { page: 1, perPage: 50 },
      sort: { field: 'name', order: 'ASC' },
      filter: {},
    })
    expect(result.current.ids).toHaveLength(50)
    expect(result.current.total).toBe(120)
    expect(result.current.loaded).toBe(true)
    expect(result.current.hasMore).toBe(true)
  })

  it('loadMore fetches the next page and appends', async () => {
    getList
      .mockResolvedValueOnce({ data: makeRecords(0, 50), total: 120 })
      .mockResolvedValueOnce({ data: makeRecords(50, 100), total: 120 })
    const { result, waitForNextUpdate } = renderHook(() =>
      useInfiniteListController(opts),
    )
    await waitForNextUpdate()
    act(() => result.current.loadMore())
    await waitForNextUpdate()
    expect(getList).toHaveBeenLastCalledWith('album', {
      pagination: { page: 2, perPage: 50 },
      sort: { field: 'name', order: 'ASC' },
      filter: {},
    })
    expect(result.current.ids).toHaveLength(100)
    expect(result.current.hasMore).toBe(true)
  })

  it('loadMore is a no-op when nothing more to load', async () => {
    getList.mockResolvedValueOnce({ data: makeRecords(0, 30), total: 30 })
    const { result, waitForNextUpdate } = renderHook(() =>
      useInfiniteListController(opts),
    )
    await waitForNextUpdate()
    expect(result.current.hasMore).toBe(false)
    act(() => result.current.loadMore())
    expect(getList).toHaveBeenCalledTimes(1)
  })

  it('resets accumulation and refetches page 1 when sort changes', async () => {
    getList
      .mockResolvedValueOnce({ data: makeRecords(0, 50), total: 120 })
      .mockResolvedValueOnce({ data: makeRecords(0, 50), total: 200 })
    const { result, waitForNextUpdate, rerender } = renderHook(
      (props) => useInfiniteListController(props),
      { initialProps: opts },
    )
    await waitForNextUpdate()
    rerender({ ...opts, sort: { field: 'year', order: 'DESC' } })
    await waitForNextUpdate()
    expect(getList).toHaveBeenLastCalledWith('album', {
      pagination: { page: 1, perPage: 50 },
      sort: { field: 'year', order: 'DESC' },
      filter: {},
    })
    expect(result.current.ids).toHaveLength(50)
    expect(result.current.total).toBe(200)
  })

  it('ignores a stale in-flight response after the key changes', async () => {
    let resolveFirst
    getList
      .mockImplementationOnce(
        () => new Promise((res) => (resolveFirst = res)),
      )
      .mockResolvedValueOnce({ data: makeRecords(0, 10), total: 10 })
    const { result, waitForNextUpdate, rerender } = renderHook(
      (props) => useInfiniteListController(props),
      { initialProps: opts },
    )
    // change key before first resolves
    rerender({ ...opts, filter: { name: 'x' } })
    await waitForNextUpdate()
    // now resolve the stale first request
    act(() => resolveFirst({ data: makeRecords(500, 550), total: 999 }))
    expect(result.current.ids).toHaveLength(10)
    expect(result.current.total).toBe(10)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run from `ui/`: `npx vitest run src/common/useInfiniteListController.test.js`
Expected: FAIL — "Failed to resolve import './useInfiniteListController'".

- [ ] **Step 3: Implement the hook**

```js
// ui/src/common/useInfiniteListController.js
import { useCallback, useEffect, useRef, useState } from 'react'
import { useDataProvider } from 'react-admin'

const emptyState = { ids: [], data: {}, total: undefined, page: 0 }

export const useInfiniteListController = ({
  resource,
  sort,
  filter,
  batchSize = 50,
}) => {
  const dataProvider = useDataProvider()
  const [state, setState] = useState(emptyState)
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Serialized key: any change resets accumulation.
  const key = JSON.stringify({ resource, sort, filter, batchSize })
  const keyRef = useRef(key)
  const loadingRef = useRef(false)
  const stateRef = useRef(state)
  stateRef.current = state

  const fetchPage = useCallback(
    (page, fetchKey) => {
      if (loadingRef.current) return
      loadingRef.current = true
      setLoading(true)
      dataProvider
        .getList(resource, {
          pagination: { page, perPage: batchSize },
          sort,
          filter,
        })
        .then(({ data, total }) => {
          // Ignore responses whose key is no longer current.
          if (keyRef.current !== fetchKey) return
          setState((prev) => {
            const base = page === 1 ? emptyState : prev
            const nextData = { ...base.data }
            const nextIds = [...base.ids]
            data.forEach((record) => {
              if (nextData[record.id] === undefined) nextIds.push(record.id)
              nextData[record.id] = record
            })
            return { ids: nextIds, data: nextData, total, page }
          })
          setLoaded(true)
          setError(null)
        })
        .catch((e) => {
          if (keyRef.current !== fetchKey) return
          setError(e)
        })
        .finally(() => {
          if (keyRef.current !== fetchKey) return
          loadingRef.current = false
          setLoading(false)
        })
    },
    [dataProvider, resource, sort, filter, batchSize],
  )

  // Reset + fetch batch 1 whenever the key changes (incl. first mount).
  useEffect(() => {
    keyRef.current = key
    loadingRef.current = false
    setState(emptyState)
    setLoaded(false)
    setError(null)
    fetchPage(1, key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const hasMore =
    state.total !== undefined && state.ids.length < state.total

  const loadMore = useCallback(() => {
    if (loadingRef.current || !hasMore) return
    fetchPage(stateRef.current.page + 1, keyRef.current)
  }, [fetchPage, hasMore])

  return {
    ids: state.ids,
    data: state.data,
    total: state.total,
    loaded,
    loading,
    loadingMore: loading && state.page >= 1 && loaded,
    error,
    hasMore,
    loadMore,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run from `ui/`: `npx vitest run src/common/useInfiniteListController.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Lint & commit**

```bash
npm run prettier && npm run lint
git add ui/src/common/useInfiniteListController.js ui/src/common/useInfiniteListController.test.js
git commit -m "feat(ui): add useInfiniteListController for batched list loading"
```

---

### Task 3: `InfiniteListFooter` status component

Small footer showing "loaded / total" + a spinner while fetching more, and an end marker.

**Files:**
- Create: `ui/src/common/InfiniteListFooter.jsx`
- Test: `ui/src/common/InfiniteListFooter.test.jsx`
- Modify: `ui/src/i18n/en.json` (add `ra.navigation.infinite_loaded` key)

**Interfaces:**
- Consumes: controller fields `loaded`, `total`, `loadingMore`, `hasMore`, plus `ids.length` as `count`.
- Produces: `<InfiniteListFooter count total loadingMore hasMore />` — renders `null` until `loaded` is implied by `count > 0 || total !== undefined`.

- [ ] **Step 1: Write the failing test**

```jsx
// ui/src/common/InfiniteListFooter.test.jsx
import React from 'react'
import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import { InfiniteListFooter } from './InfiniteListFooter'

vi.mock('react-admin', async () => {
  const actual = await vi.importActual('react-admin')
  return { ...actual, useTranslate: () => (k, o) => `${o.count} of ${o.total}` }
})

describe('InfiniteListFooter', () => {
  it('shows loaded/total counts', () => {
    render(
      <InfiniteListFooter count={50} total={120} loadingMore hasMore />,
    )
    expect(screen.getByText('50 of 120')).toBeInTheDocument()
  })

  it('renders nothing when total is undefined and count is 0', () => {
    const { container } = render(
      <InfiniteListFooter count={0} total={undefined} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run from `ui/`: `npx vitest run src/common/InfiniteListFooter.test.jsx`
Expected: FAIL — cannot resolve `./InfiniteListFooter`.

- [ ] **Step 3: Add the i18n key**

In `ui/src/i18n/en.json`, under the existing `ra.navigation` object, add:
```json
"infinite_loaded": "%{count} of %{total} loaded"
```

- [ ] **Step 4: Implement the component**

```jsx
// ui/src/common/InfiniteListFooter.jsx
import React from 'react'
import { CircularProgress } from '@material-ui/core'
import { makeStyles } from '@material-ui/core/styles'
import { useTranslate } from 'react-admin'

const useStyles = makeStyles((theme) => ({
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing(1),
    padding: theme.spacing(2),
    color: theme.palette.text.secondary,
    fontSize: '0.85em',
  },
}))

export const InfiniteListFooter = ({ count, total, loadingMore, hasMore }) => {
  const classes = useStyles()
  const translate = useTranslate()
  if (!count && total === undefined) return null
  return (
    <div className={classes.footer}>
      {loadingMore && <CircularProgress size={16} />}
      <span>
        {translate('ra.navigation.infinite_loaded', {
          count,
          total: total ?? count,
        })}
      </span>
      {!hasMore && total !== undefined && <span>·</span>}
    </div>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run from `ui/`: `npx vitest run src/common/InfiniteListFooter.test.jsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Lint & commit**

```bash
npm run prettier && npm run lint
git add ui/src/common/InfiniteListFooter.jsx ui/src/common/InfiniteListFooter.test.jsx ui/src/i18n/en.json
git commit -m "feat(ui): add InfiniteListFooter status component"
```

---

### Task 4: `InfiniteGrid` shell + wire into AlbumGridView

Windowed grid via `VirtuosoGrid`; lower-risk than the table because tiles are plain divs.

**Files:**
- Create: `ui/src/common/InfiniteGrid.jsx`
- Modify: `ui/src/album/AlbumGridView.jsx`
- Modify: `ui/src/common/index.js` (export `InfiniteGrid`, `InfiniteListFooter`, `useInfiniteListController`)

**Interfaces:**
- Consumes: `useInfiniteListController` result (`ids`, `data`, `loadMore`, `loadingMore`, `total`, `hasMore`, `loaded`), `InfiniteListFooter`.
- Produces: `<InfiniteGrid ids data cols spacing loadMore hasMore loadingMore total renderItem />` where `renderItem = (id) => ReactNode`.

- [ ] **Step 1: Implement `InfiniteGrid`**

```jsx
// ui/src/common/InfiniteGrid.jsx
import React, { forwardRef } from 'react'
import { VirtuosoGrid } from 'react-virtuoso'
import { makeStyles } from '@material-ui/core/styles'
import { InfiniteListFooter } from './InfiniteListFooter'

const useStyles = makeStyles({
  list: (props) => ({
    display: 'grid',
    gridTemplateColumns: `repeat(${props.cols}, 1fr)`,
    gap: props.spacing,
  }),
  scroller: { margin: '20px' },
})

const buildComponents = (classes) => ({
  List: forwardRef(({ style, children, ...props }, ref) => (
    <div ref={ref} className={classes.list} style={style} {...props}>
      {children}
    </div>
  )),
  Item: ({ children, ...props }) => <div {...props}>{children}</div>,
})

export const InfiniteGrid = ({
  ids,
  cols,
  spacing = 20,
  loadMore,
  hasMore,
  loadingMore,
  total,
  renderItem,
}) => {
  const classes = useStyles({ cols, spacing })
  const components = React.useMemo(() => buildComponents(classes), [classes])
  return (
    <VirtuosoGrid
      useWindowScroll
      className={classes.scroller}
      totalCount={ids.length}
      components={components}
      endReached={() => hasMore && loadMore()}
      itemContent={(index) => renderItem(ids[index])}
      overscan={600}
      // eslint-disable-next-line react/no-children-prop
    />
  )
}
```

Note: a footer under `useWindowScroll` is rendered by the caller (AlbumGridView) after the grid, since `VirtuosoGrid`'s `components.Footer` also works — either is acceptable; the caller-rendered footer keeps `InfiniteGrid` generic.

- [ ] **Step 2: Rewire `AlbumGridView.jsx` to use the controller + `InfiniteGrid`**

Replace `LoadedAlbumGrid` and `AlbumGridView` (lines 214-248) with a version driven by `useInfiniteListController`. Keep `Cover`, `AlbumGridTile`, `getColsForWidth`, and all styles unchanged. New tail of the file:

```jsx
import { useListContext } from 'react-admin'
import { InfiniteGrid, InfiniteListFooter } from '../common'
import { useInfiniteListController } from '../common/useInfiniteListController'

const LoadedAlbumGrid = ({ basePath, width }) => {
  const classes = useStyles()
  const { resource, currentSort, filterValues } = useListContext()
  const controller = useInfiniteListController({
    resource,
    sort: currentSort,
    filter: filterValues,
  })
  const { ids, data, loaded, loadMore, hasMore, loadingMore, total } =
    controller
  const isArtistView = !!(filterValues && filterValues.artist_id)

  if (!loaded) return <Loading />

  return (
    <div className={classes.root}>
      <InfiniteGrid
        ids={ids}
        cols={getColsForWidth(width)}
        spacing={20}
        loadMore={loadMore}
        hasMore={hasMore}
        loadingMore={loadingMore}
        total={total}
        renderItem={(id) => (
          <AlbumGridTile
            record={data[id]}
            basePath={basePath}
            showArtist={!isArtistView}
          />
        )}
      />
      <InfiniteListFooter
        count={ids.length}
        total={total}
        loadingMore={loadingMore}
        hasMore={hasMore}
      />
    </div>
  )
}

const AlbumGridView = (props) => <LoadedAlbumGrid {...props} />
const AlbumGridViewWithWidth = withWidth()(AlbumGridView)
export default AlbumGridViewWithWidth
```

Remove the now-unused `data`/`ids`/`loading`/`loaded` props destructuring and the old `GridList`/`GridListTile` render loop. Keep the `GridListTileBar` import (still used by `AlbumGridTile`).

- [ ] **Step 3: Export the new modules**

In `ui/src/common/index.js`, add:
```js
export * from './useInfiniteListController'
export * from './InfiniteGrid'
export * from './InfiniteListFooter'
```
(Match the file's existing export style — if it uses named re-exports like `export { X } from './x'`, follow that instead.)

- [ ] **Step 4: Manual smoke test**

Run the app (`npm start` from `ui/`, backend running), open the Album grid. Expected: albums load, scrolling near the bottom appends more without a pagination bar; footer shows "N of M loaded".

- [ ] **Step 5: Lint & commit**

```bash
npm run prettier && npm run lint
git add ui/src/common/InfiniteGrid.jsx ui/src/common/index.js ui/src/album/AlbumGridView.jsx
git commit -m "feat(ui): infinite-scroll album grid via VirtuosoGrid"
```

---

### Task 5: `InfiniteDatagrid` shell + wire into AlbumTableView

Windowed real `<table>` via `TableVirtuoso`. Renders react-admin field elements per visible row by cloning them with the row `record` — the same mechanism `DatagridBody` uses, but only for on-screen rows.

**Files:**
- Create: `ui/src/common/InfiniteDatagrid.jsx`
- Test: `ui/src/common/InfiniteDatagrid.test.jsx`
- Modify: `ui/src/album/AlbumTableView.jsx`
- Modify: `ui/src/common/index.js` (export `InfiniteDatagrid`)

**Interfaces:**
- Consumes: controller result + an array of column field elements (each a React element with a `source` and optional `label`/`sortBy`/`sortable`).
- Produces:
  ```jsx
  <InfiniteDatagrid
    resource basePath rowClick
    ids data loadMore hasMore loadingMore total
    currentSort setSort            // from useListContext
    fields={[<TextField source="name" />, ...]}
    rowClassName={(record) => string}
  />
  ```
  Each visible row renders one `<TableCell>` per field via `React.cloneElement(field, { record, basePath, resource })`. Header renders a `<TableSortLabel>` per field (when `field.props.sortable !== false`) that calls `setSort(field.props.sortBy || field.props.source)`.

- [ ] **Step 1: Write the failing test**

```jsx
// ui/src/common/InfiniteDatagrid.test.jsx
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import { TextField } from 'react-admin'
import { InfiniteDatagrid } from './InfiniteDatagrid'

// react-virtuoso renders via portals/measurement that jsdom can't size;
// stub TableVirtuoso to render all rows synchronously for the test.
vi.mock('react-virtuoso', () => ({
  TableVirtuoso: ({ totalCount, fixedHeaderContent, itemContent, data }) => (
    <table>
      <thead>{fixedHeaderContent()}</thead>
      <tbody>
        {Array.from({ length: totalCount }).map((_, i) => (
          <tr key={i}>{itemContent(i, data ? data[i] : undefined)}</tr>
        ))}
      </tbody>
    </table>
  ),
}))

describe('InfiniteDatagrid', () => {
  const base = {
    resource: 'album',
    basePath: '/album',
    ids: ['a1', 'a2'],
    data: { a1: { id: 'a1', name: 'Alpha' }, a2: { id: 'a2', name: 'Beta' } },
    total: 2,
    hasMore: false,
    loadingMore: false,
    loadMore: vi.fn(),
    currentSort: { field: 'name', order: 'ASC' },
    setSort: vi.fn(),
    fields: [<TextField key="name" source="name" />],
  }

  it('renders one row per id with field values', () => {
    render(<InfiniteDatagrid {...base} />)
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
  })

  it('calls setSort when a sortable header is clicked', () => {
    const setSort = vi.fn()
    render(<InfiniteDatagrid {...base} setSort={setSort} />)
    fireEvent.click(screen.getByText('name'))
    expect(setSort).toHaveBeenCalledWith('name')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run from `ui/`: `npx vitest run src/common/InfiniteDatagrid.test.jsx`
Expected: FAIL — cannot resolve `./InfiniteDatagrid`.

- [ ] **Step 3: Implement `InfiniteDatagrid`**

```jsx
// ui/src/common/InfiniteDatagrid.jsx
import React, { forwardRef } from 'react'
import { TableVirtuoso } from 'react-virtuoso'
import {
  Table,
  TableCell,
  TableHead,
  TableRow,
  TableBody,
  TableSortLabel,
} from '@material-ui/core'
import { useHistory } from 'react-router-dom'
import { linkToRecord } from 'react-admin'

const fieldKey = (field) => field.props.sortBy || field.props.source
const fieldLabel = (field) => field.props.label || field.props.source

const components = {
  Table: (props) => <Table {...props} stickyHeader />,
  TableHead,
  TableRow: forwardRef((props, ref) => <TableRow {...props} ref={ref} />),
  TableBody: forwardRef((props, ref) => <TableBody {...props} ref={ref} />),
}

export const InfiniteDatagrid = ({
  resource,
  basePath,
  rowClick,
  ids,
  data,
  loadMore,
  hasMore,
  loadingMore,
  total,
  currentSort,
  setSort,
  fields,
  rowClassName,
}) => {
  const history = useHistory()

  const handleRowClick = (record) => {
    if (!record) return
    if (rowClick === 'show') {
      history.push(linkToRecord(basePath, record.id, 'show'))
    } else if (typeof rowClick === 'function') {
      rowClick(record.id, basePath, record)
    }
  }

  const header = () => (
    <TableRow>
      {fields.map((field, i) => {
        const sortable = field.props.sortable !== false && !!fieldKey(field)
        const key = fieldKey(field)
        return (
          <TableCell key={key || i}>
            {sortable ? (
              <TableSortLabel
                active={currentSort?.field === key}
                direction={
                  currentSort?.field === key
                    ? currentSort.order.toLowerCase()
                    : 'asc'
                }
                onClick={() => setSort(key)}
              >
                {fieldLabel(field)}
              </TableSortLabel>
            ) : (
              fieldLabel(field)
            )}
          </TableCell>
        )
      })}
    </TableRow>
  )

  const row = (index) => {
    const record = data[ids[index]]
    if (!record) return null
    return fields.map((field, i) => (
      <TableCell
        key={fieldKey(field) || i}
        onClick={() => handleRowClick(record)}
      >
        {React.cloneElement(field, { record, basePath, resource })}
      </TableCell>
    ))
  }

  return (
    <TableVirtuoso
      useWindowScroll
      totalCount={ids.length}
      components={components}
      fixedHeaderContent={header}
      itemContent={row}
      endReached={() => hasMore && loadMore()}
      overscan={600}
      className={rowClassName ? undefined : undefined}
      aria-label={`${resource} list`}
      data-total={total}
      data-loadingmore={loadingMore ? 'true' : 'false'}
    />
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run from `ui/`: `npx vitest run src/common/InfiniteDatagrid.test.jsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Rewire `AlbumTableView.jsx`**

Keep the `useSelectedFields` column logic and the xs `SimpleList` branch **unchanged** (xs stays paginated — see Task 6; the SimpleList still reads react-admin's page-based `ListContext`). Delete the `AlbumDatagrid`/`AlbumDatagridBody`/`AlbumDatagridRow` composition (lines 60-87). Replace the `<AlbumDatagrid>` JSX (lines 174-194) with an `InfiniteDatagrid` fed by the controller. Collect the previous Datagrid children into a `fields` array and wire the controller from `useListContext`:

```jsx
import { useListContext } from 'react-admin'
import { InfiniteDatagrid } from '../common'
import { useInfiniteListController } from '../common/useInfiniteListController'

// ...inside AlbumTableView, replacing the md+ <AlbumDatagrid> return branch:
const { resource, basePath, currentSort, setSort, filterValues } =
  useListContext()
const { ids, data, loadMore, hasMore, loadingMore, total } =
  useInfiniteListController({
    resource,
    sort: currentSort,
    filter: filterValues,
  })

const fields = [
  <CoverArtAvatar key="cover" source="id" variant="square" sortable={false} />,
  <TextField key="name" source="name" />,
  ...columns,
  <AlbumContextMenu
    key="ctx"
    source="starred_at"
    sortByOrder="DESC"
    sortable={config.enableFavourites}
    className={classes.contextMenu}
    label={
      config.enableFavourites && (
        <FavoriteBorderIcon fontSize="small" className={classes.columnIcon} />
      )
    }
  />,
]

return (
  <>
    <InfiniteDatagrid
      resource={resource}
      basePath={basePath}
      rowClick="show"
      ids={ids}
      data={data}
      loadMore={loadMore}
      hasMore={hasMore}
      loadingMore={loadingMore}
      total={total}
      currentSort={currentSort}
      setSort={setSort}
      fields={fields}
      rowClassName={(record) =>
        clsx(classes.row, record?.missing && classes.missingRow)
      }
    />
    <InfiniteListFooter
      count={ids.length}
      total={total}
      loadingMore={loadingMore}
      hasMore={hasMore}
    />
  </>
)
```

`columns` is the existing `useSelectedFields(...)` result (an array of field elements). Import `InfiniteListFooter` alongside `InfiniteDatagrid`. **Row drag-and-drop** (the old `AlbumDatagridRow` `useDrag`) is intentionally deferred to the follow-up — `InfiniteDatagrid` renders plain rows here; note "table row drag deferred" in the commit body.

- [ ] **Step 6: Manual smoke test**

Album table view: rows load, headers sort (resetting the list), scrolling appends, no pagination bar, footer shows counts.

- [ ] **Step 7: Lint & commit**

```bash
npm run prettier && npm run lint
git add ui/src/common/InfiniteDatagrid.jsx ui/src/common/InfiniteDatagrid.test.jsx ui/src/common/index.js ui/src/album/AlbumTableView.jsx
git commit -m "feat(ui): infinite-scroll album table via TableVirtuoso"
```

---

### Task 6: Remove the pagination bar from AlbumList (md+ only)

Both album **md+** views now drive their own infinite controller, so hide the bar for md+ while keeping the react-admin pager for the xs `SimpleList` (converted in the follow-up). Do NOT touch `common/List.jsx` — other resources still paginate until the follow-up rolls the shells out to them.

**Files:**
- Modify: `ui/src/album/AlbumList.jsx` (make `pagination` conditional on xs; lines 176-182, 244-249)

**Interfaces:**
- Consumes: `withWidth`-provided `width` (already destructured in `AlbumList`).
- Produces: Album `<List>` with no pagination bar on md+; xs keeps `AlbumListPagination`.

- [ ] **Step 1: Make pagination conditional in `AlbumList.jsx`**

Add an xs check and gate the `pagination` prop. Keep `AlbumListPagination`, `useAlbumsPerPage`, and `perPage` (all still feed the xs SimpleList's page-based controller and provide `currentSort`/`filterValues` context the infinite views read). Replace the `pagination={...}` prop (lines 244-249) with:

```jsx
import { useMediaQuery } from '@material-ui/core'
// ...in AlbumList:
const isXsmall = useMediaQuery((theme) => theme.breakpoints.down('xs'))
// ...on <List>:
pagination={
  isXsmall ? (
    <AlbumListPagination
      rowsPerPageOptions={perPageOptions}
      albumListType={albumListType}
    />
  ) : (
    false
  )
}
```

- [ ] **Step 2: Verify**

Run from `ui/`: `npx vitest run && npm run lint`
Expected: all tests pass; lint clean.

- [ ] **Step 3: Manual smoke test**

Desktop Album grid AND table: no pagination bar; both infinite-scroll; view toggle still switches modes. Resize to a phone width: xs SimpleList still shows its pager (unchanged). Visit another resource (e.g. Artists): its pagination bar is unchanged.

- [ ] **Step 4: Commit**

```bash
git add ui/src/album/AlbumList.jsx
git commit -m "feat(ui): drop pagination bar from album list on desktop"
```

---

> **Note:** `useAlbumsPerPage` and `common/List.jsx` are intentionally left in place — they still serve the xs Album SimpleList and every not-yet-converted resource. They are removed in the follow-up plan once all resources (and the xs branches) are converted to infinite scroll.

---

## Follow-up (separate plan)

Once the Album reference is proven, a second plan rolls the shells out to the remaining resources — Songs, Artists, Playlists (and playlist tracks), Radios, Shares, Users, Libraries, Missing, Plugins, Transcodings — each swapping its Datagrid for `InfiniteDatagrid` (and `SimpleList` fallbacks for `Virtuoso`), and adding scroll-position restoration per resource. That work is repetitive application of the shells built here and should be its own plan/PR to keep review focused.

## Notes on risk

- The highest-risk surface is `InfiniteDatagrid` ↔ react-admin field cloning + row drag-and-drop (Task 5). Field components (`TextField`, `NumberField`, `DateField`, `CoverArtAvatar`, `RatingField`, `AlbumContextMenu`) read `record` from props, so cloning with `{ record }` is the same contract `DatagridBody` relies on. If drag-and-drop proves awkward inside `TableVirtuoso` rows, land the table without row-drag first (Task 5 Step 5 already allows deferring it) and add it in the follow-up.
- Bulk selection is disabled on the album list (`bulkActionButtons={false}`), so `InfiniteDatagrid` need not implement selection for this plan; the follow-up adds selection for resources that use it.
