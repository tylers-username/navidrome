# Home Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a personalized Home landing page to the Navidrome web UI with horizontal-scrolling shelves (recently added/played albums, favorite artists/albums, recent artists/songs/playlists), each linking to an existing list view.

**Architecture:** A react-admin `dashboard` component (`Home`) composed of independent, self-fetching `Shelf` components, each rendering a `Carousel` of `HomeCard`s. Two one-line backend filter additions expose "recently played" for songs and artists using play data Navidrome already records. "Show all" reuses existing list views.

**Tech Stack:** React 17 + react-admin v3 + Material-UI v4 (UI, tested with Vitest + Testing Library); Go + squirrel + Ginkgo/Gomega (persistence).

## Global Constraints

- UI package manager: npm. UI tests run with **Vitest** (`import { describe, it, expect, vi } from 'vitest'`), not Jest.
- Follow existing file conventions: `.jsx` for components, `makeStyles` for styling, named exports for components, default export for page-level `Home`.
- Cover art URLs come from `subsonic.getCoverArtUrl(record, config.uiCoverArtSize, square)`.
- Favorites UI must be gated behind `config.enableFavourites`.
- Go persistence code lives in package `persistence`; `recentlyPlayedFilter` (defined in `persistence/album_repository.go`) is package-private and reusable directly.
- Work happens on branch `feat/home-screen` (already checked out). Commit after every task.
- The "recently played" shelves always pair `filter={recently_played:true}` with `sort=play_date` — the annotation join required for the `play_date` column is triggered by the annotation filter, exactly as albums do today.

---

## Task 1: Backend — expose `recently_played` filter for songs

**Files:**
- Modify: `persistence/mediafile_repository.go` (the `mediaFileFilter()` map, ~line 98)
- Test: `persistence/mediafile_repository_test.go`

**Interfaces:**
- Consumes: `recentlyPlayedFilter(string, any) Sqlizer` from `persistence/album_repository.go` (returns `Gt{"play_count": 0}`); `(*mediaFileRepository).IncPlayCount(id string, timestamp time.Time) error`.
- Produces: media_file REST/dataProvider filter key `recently_played` (boolean) that returns only songs with `play_count > 0`.

- [ ] **Step 1: Write the failing test**

Add inside the top-level `Describe("MediaRepository", ...)` block in `persistence/mediafile_repository_test.go`:

```go
	Describe("recently_played filter", func() {
		var repo model.MediaFileRepository
		var playedID string

		BeforeEach(func() {
			ctx := request.WithUser(log.NewContext(context.TODO()), model.User{ID: "userid", UserName: "johndoe"})
			repo = NewMediaFileRepository(ctx, GetDBXBuilder())
			// Song id "1001" exists in the seed data; register a play for this user.
			playedID = "1001"
			Expect(repo.IncPlayCount(playedID, time.Now())).To(Succeed())
		})

		It("returns only songs with at least one play", func() {
			res, err := repo.GetAll(model.QueryOptions{
				Filters: squirrel.Eq{"annotation.play_count": nil},
			})
			Expect(err).ToNot(HaveOccurred())
			_ = res // sanity: unfiltered query with annotation join works

			played, err := repo.GetAll(model.QueryOptions{
				Sort:    "play_date",
				Order:   "desc",
				Filters: recentlyPlayedFilter("recently_played", "true"),
			})
			Expect(err).ToNot(HaveOccurred())
			ids := make([]string, 0, len(played))
			for _, mf := range played {
				ids = append(ids, mf.ID)
				Expect(mf.PlayCount).To(BeNumerically(">", 0))
			}
			Expect(ids).To(ContainElement(playedID))
		})
	})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `go test ./persistence/ -run TestPersistence -ginkgo.focus="recently_played filter" 2>&1 | tail -20`
Expected: FAIL — the `recently_played` filter is not registered, so the query errors or returns unfiltered results (test assertion on `PlayCount > 0` / `ContainElement` fails).

- [ ] **Step 3: Register the filter**

In `persistence/mediafile_repository.go`, inside `mediaFileFilter()`'s `filters` map (after the `"starred"` entry), add:

```go
		"recently_played": recentlyPlayedFilter,
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `go test ./persistence/ -run TestPersistence -ginkgo.focus="recently_played filter" 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 5: Run the full persistence suite to check for regressions**

Run: `go test ./persistence/... 2>&1 | tail -15`
Expected: PASS (ok navidrome/persistence)

- [ ] **Step 6: Commit**

```bash
git add persistence/mediafile_repository.go persistence/mediafile_repository_test.go
git commit -m "feat(persistence): add recently_played filter to media_file repository"
```

---

## Task 2: Backend — expose `recently_played` filter for artists

**Files:**
- Modify: `persistence/artist_repository.go` (the `registerModel(...)` filter map, ~line 137)
- Test: `persistence/artist_repository_test.go`

**Interfaces:**
- Consumes: `recentlyPlayedFilter` (same as Task 1); `(*artistRepository).IncPlayCount(id string, timestamp time.Time) error`.
- Produces: artist REST/dataProvider filter key `recently_played` (boolean) returning only artists with `play_count > 0`.

- [ ] **Step 1: Write the failing test**

Add a new `Describe` block inside the top-level `Describe("ArtistRepository", ...)` in `persistence/artist_repository_test.go`:

```go
	Describe("recently_played filter", func() {
		var repo model.ArtistRepository
		var playedID string

		BeforeEach(func() {
			ctx := request.WithUser(GinkgoT().Context(), model.User{ID: "userid", UserName: "johndoe"})
			repo = NewArtistRepository(ctx, GetDBXBuilder())
			// Artist id "3" (Beatles) exists in seed data; register a play.
			playedID = "3"
			Expect(repo.IncPlayCount(playedID, time.Now())).To(Succeed())
		})

		It("returns only artists with at least one play", func() {
			played, err := repo.GetAll(model.QueryOptions{
				Sort:    "play_date",
				Order:   "desc",
				Filters: recentlyPlayedFilter("recently_played", "true"),
			})
			Expect(err).ToNot(HaveOccurred())
			ids := make([]string, 0, len(played))
			for _, ar := range played {
				ids = append(ids, ar.ID)
				Expect(ar.PlayCount).To(BeNumerically(">", 0))
			}
			Expect(ids).To(ContainElement(playedID))
		})
	})
```

> If artist id `"3"` is not present in the seed data, run
> `go test ./persistence/ -run TestPersistence -ginkgo.focus="ArtistRepository"` output or inspect
> `persistence/*seed*`/test setup and substitute a real seeded artist id.

- [ ] **Step 2: Run the test to verify it fails**

Run: `go test ./persistence/ -run TestPersistence -ginkgo.focus="recently_played filter" 2>&1 | tail -20`
Expected: FAIL — filter not registered for artists.

- [ ] **Step 3: Register the filter**

In `persistence/artist_repository.go`, inside the `registerModel(&model.Artist{}, map[string]filterFunc{...})` map (after the `"starred"` entry), add:

```go
		"recently_played": recentlyPlayedFilter,
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `go test ./persistence/ -run TestPersistence -ginkgo.focus="recently_played filter" 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 5: Run the full persistence suite**

Run: `go test ./persistence/... 2>&1 | tail -15`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add persistence/artist_repository.go persistence/artist_repository_test.go
git commit -m "feat(persistence): add recently_played filter to artist repository"
```

---

## Task 3: UI — `Carousel` horizontal-scroll component

**Files:**
- Create: `ui/src/home/Carousel.jsx`
- Test: `ui/src/home/Carousel.test.jsx`

**Interfaces:**
- Produces: `export const Carousel = ({ children }) => ...` — a horizontal scroller with left/right chevron buttons (`aria-label="scroll left"` / `"scroll right"`). Chevrons call `element.scrollBy` on a ref.

- [ ] **Step 1: Write the failing test**

Create `ui/src/home/Carousel.test.jsx`:

```jsx
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Carousel } from './Carousel'

describe('Carousel', () => {
  it('renders its children', () => {
    render(
      <Carousel>
        <div>Card A</div>
        <div>Card B</div>
      </Carousel>,
    )
    expect(screen.getByText('Card A')).toBeInTheDocument()
    expect(screen.getByText('Card B')).toBeInTheDocument()
  })

  it('scrolls right when the right chevron is clicked', () => {
    const scrollBy = vi.fn()
    // jsdom does not implement scrollBy; stub it on the prototype.
    Element.prototype.scrollBy = scrollBy
    render(
      <Carousel>
        <div>Card A</div>
      </Carousel>,
    )
    fireEvent.click(screen.getByLabelText('scroll right'))
    expect(scrollBy).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd ui && npx vitest run src/home/Carousel.test.jsx 2>&1 | tail -20`
Expected: FAIL — `Cannot find module './Carousel'`.

- [ ] **Step 3: Implement the component**

Create `ui/src/home/Carousel.jsx`:

```jsx
import React, { useRef } from 'react'
import { IconButton } from '@material-ui/core'
import { makeStyles } from '@material-ui/core/styles'
import ChevronLeftIcon from '@material-ui/icons/ChevronLeft'
import ChevronRightIcon from '@material-ui/icons/ChevronRight'

const useStyles = makeStyles({
  root: {
    position: 'relative',
    '&:hover $chevron': { opacity: 1 },
  },
  scroller: {
    display: 'flex',
    gap: '16px',
    overflowX: 'auto',
    scrollBehavior: 'smooth',
    scrollSnapType: 'x proximity',
    paddingBottom: '8px',
    '& > *': { scrollSnapAlign: 'start' },
    '&::-webkit-scrollbar': { display: 'none' },
    scrollbarWidth: 'none',
    msOverflowStyle: 'none',
  },
  chevron: {
    position: 'absolute',
    top: '30%',
    zIndex: 2,
    opacity: 0,
    transition: 'opacity 150ms ease-out',
    backgroundColor: 'rgba(0,0,0,0.6)',
    color: '#fff',
    '&:hover': { backgroundColor: 'rgba(0,0,0,0.8)' },
  },
  left: { left: 0 },
  right: { right: 0 },
})

export const Carousel = ({ children }) => {
  const classes = useStyles()
  const ref = useRef(null)

  const scroll = (direction) => {
    const el = ref.current
    if (el) {
      el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' })
    }
  }

  return (
    <div className={classes.root}>
      <IconButton
        aria-label="scroll left"
        className={`${classes.chevron} ${classes.left}`}
        size="small"
        onClick={() => scroll(-1)}
      >
        <ChevronLeftIcon />
      </IconButton>
      <div className={classes.scroller} ref={ref}>
        {children}
      </div>
      <IconButton
        aria-label="scroll right"
        className={`${classes.chevron} ${classes.right}`}
        size="small"
        onClick={() => scroll(1)}
      >
        <ChevronRightIcon />
      </IconButton>
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd ui && npx vitest run src/home/Carousel.test.jsx 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ui/src/home/Carousel.jsx ui/src/home/Carousel.test.jsx
git commit -m "feat(ui): add horizontal Carousel component for home screen"
```

---

## Task 4: UI — `HomeCard` presentational card

**Files:**
- Create: `ui/src/home/HomeCard.jsx`
- Test: `ui/src/home/HomeCard.test.jsx`

**Interfaces:**
- Consumes: `subsonic.getCoverArtUrl`, `config.uiCoverArtSize`, `useImageUrl` and `OverflowTooltip` from `../common`.
- Produces:
  `export const HomeCard = ({ record, title, subtitle, variant = 'square', to, onClick, overlay }) => ...`
  - `variant`: `'square'` (rounded rect) or `'circle'` (round artwork).
  - `to`: when set, the card is a `react-router-dom` `Link`; otherwise a `div` with `onClick` (role="button").
  - `overlay`: node shown over the artwork on hover (play button / context menu).
  - `title`/`subtitle`: display strings (songs pass `record.title`; albums/artists pass `record.name`).

- [ ] **Step 1: Write the failing test**

Create `ui/src/home/HomeCard.test.jsx`:

```jsx
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { HomeCard } from './HomeCard'

vi.mock('../subsonic', () => ({
  default: { getCoverArtUrl: vi.fn(() => 'http://example/art.png') },
}))
vi.mock('../config', () => ({ default: { uiCoverArtSize: 300 } }))
vi.mock('../common', () => ({
  useImageUrl: vi.fn(() => ({ imgUrl: 'http://example/art.png', loading: false })),
  OverflowTooltip: ({ children }) => children,
}))
vi.mock('react-router-dom', () => ({
  Link: ({ children, to }) => <a href={to}>{children}</a>,
}))

describe('HomeCard', () => {
  const record = { id: 'a1', name: 'Dark Side' }

  it('renders title and subtitle', () => {
    render(<HomeCard record={record} title="Dark Side" subtitle="Pink Floyd" />)
    expect(screen.getByText('Dark Side')).toBeInTheDocument()
    expect(screen.getByText('Pink Floyd')).toBeInTheDocument()
  })

  it('renders a link when `to` is provided', () => {
    render(<HomeCard record={record} title="Dark Side" to="/album/a1/show" />)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/album/a1/show')
  })

  it('calls onClick when clicked without `to`', () => {
    const onClick = vi.fn()
    render(<HomeCard record={record} title="Song X" onClick={onClick} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd ui && npx vitest run src/home/HomeCard.test.jsx 2>&1 | tail -20`
Expected: FAIL — `Cannot find module './HomeCard'`.

- [ ] **Step 3: Implement the component**

Create `ui/src/home/HomeCard.jsx`:

```jsx
import React from 'react'
import { Link } from 'react-router-dom'
import { Typography } from '@material-ui/core'
import { makeStyles } from '@material-ui/core/styles'
import clsx from 'clsx'
import subsonic from '../subsonic'
import config from '../config'
import { useImageUrl, OverflowTooltip } from '../common'

const useStyles = makeStyles((theme) => ({
  card: {
    width: 160,
    flex: '0 0 auto',
    textDecoration: 'none',
    cursor: 'pointer',
    color: 'inherit',
    '&:hover $overlay, &:focus-within $overlay': { opacity: 1 },
  },
  artContainer: { position: 'relative', width: 160, height: 160 },
  art: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transition: 'opacity 0.3s ease-in-out',
    backgroundColor: theme.palette.type === 'dark' ? '#333' : '#eee',
  },
  square: { borderRadius: 6 },
  circle: { borderRadius: '50%' },
  artLoading: { opacity: 0 },
  overlay: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    display: 'flex',
    opacity: 0,
    transition: 'opacity 150ms ease-out',
    color: '#fff',
  },
  title: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: 600,
    color: theme.palette.text.primary,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
  subtitle: {
    fontSize: 12,
    color: theme.palette.text.secondary,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
}))

export const HomeCard = ({
  record,
  title,
  subtitle,
  variant = 'square',
  to,
  onClick,
  overlay,
}) => {
  const classes = useStyles()
  const square = variant !== 'circle'
  const url = subsonic.getCoverArtUrl(record, config.uiCoverArtSize, square)
  const { imgUrl, loading } = useImageUrl(url)

  const body = (
    <>
      <div className={classes.artContainer}>
        <img
          src={imgUrl || undefined}
          alt={title}
          className={clsx(
            classes.art,
            square ? classes.square : classes.circle,
            loading && classes.artLoading,
          )}
        />
        {overlay && <div className={classes.overlay}>{overlay}</div>}
      </div>
      <OverflowTooltip title={title}>
        <Typography className={classes.title}>{title}</Typography>
      </OverflowTooltip>
      {subtitle && (
        <Typography className={classes.subtitle}>{subtitle}</Typography>
      )}
    </>
  )

  if (to) {
    return (
      <Link className={classes.card} to={to}>
        {body}
      </Link>
    )
  }
  return (
    <div className={classes.card} role="button" tabIndex={0} onClick={onClick}>
      {body}
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd ui && npx vitest run src/home/HomeCard.test.jsx 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ui/src/home/HomeCard.jsx ui/src/home/HomeCard.test.jsx
git commit -m "feat(ui): add HomeCard presentational component"
```

---

## Task 5: UI — `Shelf` self-fetching shelf

**Files:**
- Create: `ui/src/home/Shelf.jsx`
- Test: `ui/src/home/Shelf.test.jsx`

**Interfaces:**
- Consumes: `useGetList(resource, pagination, sort, filter)`, `useTranslate`, `Link` from `react-admin`; `Carousel` from `./Carousel`.
- Produces:
  `export const Shelf = ({ title, showAllLink, resource, sort, filter, perPage = 20, renderCard }) => ...`
  - Calls `useGetList(resource, { page: 1, perPage }, sort, filter)`.
  - Returns `null` until loaded and returns `null` when the result is empty (shelf hides itself).
  - Otherwise renders a header (`title` + a "Show all" `Link` to `showAllLink`) and a `Carousel` of `ids.map((id) => renderCard(data[id]))`.

- [ ] **Step 1: Write the failing test**

Create `ui/src/home/Shelf.test.jsx`:

```jsx
import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Shelf } from './Shelf'

const mockUseGetList = vi.fn()

vi.mock('react-admin', () => ({
  useGetList: (...args) => mockUseGetList(...args),
  useTranslate: () => (key, opts) => (opts && opts._) || key,
  Link: ({ children, to }) => <a href={to}>{children}</a>,
}))
vi.mock('./Carousel', () => ({
  Carousel: ({ children }) => <div data-testid="carousel">{children}</div>,
}))

describe('Shelf', () => {
  beforeEach(() => vi.clearAllMocks())

  const renderCard = (record) => <div key={record.id}>{record.name}</div>

  it('returns null while loading', () => {
    mockUseGetList.mockReturnValue({ ids: [], data: {}, loaded: false })
    const { container } = render(
      <Shelf title="Recent" resource="album" sort={{}} filter={{}} renderCard={renderCard} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('returns null when loaded but empty', () => {
    mockUseGetList.mockReturnValue({ ids: [], data: {}, loaded: true })
    const { container } = render(
      <Shelf title="Recent" resource="album" sort={{}} filter={{}} renderCard={renderCard} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders title, show-all link, and cards when populated', () => {
    mockUseGetList.mockReturnValue({
      ids: ['1', '2'],
      data: { 1: { id: '1', name: 'Album One' }, 2: { id: '2', name: 'Album Two' } },
      loaded: true,
    })
    render(
      <Shelf
        title="Recently Added"
        showAllLink="/album/recentlyAdded"
        resource="album"
        sort={{ field: 'recently_added', order: 'DESC' }}
        filter={{}}
        renderCard={renderCard}
      />,
    )
    expect(screen.getByText('Recently Added')).toBeInTheDocument()
    expect(screen.getByText('Show all')).toHaveAttribute('href', '/album/recentlyAdded')
    expect(screen.getByText('Album One')).toBeInTheDocument()
    expect(screen.getByText('Album Two')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd ui && npx vitest run src/home/Shelf.test.jsx 2>&1 | tail -20`
Expected: FAIL — `Cannot find module './Shelf'`.

- [ ] **Step 3: Implement the component**

Create `ui/src/home/Shelf.jsx`:

```jsx
import React from 'react'
import { useGetList, useTranslate, Link } from 'react-admin'
import { Typography } from '@material-ui/core'
import { makeStyles } from '@material-ui/core/styles'
import { Carousel } from './Carousel'

const useStyles = makeStyles((theme) => ({
  root: { margin: '28px 20px' },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 12,
  },
  title: { fontSize: 22, fontWeight: 700, color: theme.palette.text.primary },
  showAll: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    textDecoration: 'none',
    color: theme.palette.text.secondary,
  },
}))

export const Shelf = ({
  title,
  showAllLink,
  resource,
  sort,
  filter,
  perPage = 20,
  renderCard,
}) => {
  const classes = useStyles()
  const translate = useTranslate()
  const { ids, data, loaded } = useGetList(
    resource,
    { page: 1, perPage },
    sort,
    filter,
  )

  if (!loaded) return null
  if (!ids || ids.length === 0) return null

  return (
    <div className={classes.root}>
      <div className={classes.header}>
        <Typography className={classes.title}>{title}</Typography>
        {showAllLink && (
          <Link to={showAllLink} className={classes.showAll}>
            {translate('home.showAll', { _: 'Show all' })}
          </Link>
        )}
      </div>
      <Carousel>{ids.map((id) => renderCard(data[id]))}</Carousel>
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd ui && npx vitest run src/home/Shelf.test.jsx 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ui/src/home/Shelf.jsx ui/src/home/Shelf.test.jsx
git commit -m "feat(ui): add self-fetching Shelf component that hides when empty"
```

---

## Task 6: UI — `Home` page composition

**Files:**
- Create: `ui/src/home/Home.jsx`
- Create: `ui/src/home/index.js`
- Test: `ui/src/home/Home.test.jsx`

**Interfaces:**
- Consumes: `Shelf` (Task 5), `HomeCard` (Task 4); `PlayButton`, `AlbumContextMenu`, `ArtistContextMenu`, `SongContextMenu` from `../common`; `playTracks` from `../actions`; `linkToRecord`, `useTranslate`, `Title` from `react-admin`; `useDispatch` from `react-redux`; `config`.
- Produces: `export default Home` — the dashboard page. `index.js` re-exports it: `export { default } from './Home'`.

**Card renderer contract (defined here, used by each `Shelf`):**
- `albumCard(record)` → square `HomeCard`, links to `/album/{id}/show`, overlay = `PlayButton` + `AlbumContextMenu`, subtitle = `record.albumArtist`.
- `artistCard(translate)(record)` → circle `HomeCard`, links to `/artist/{id}/show`, overlay = `ArtistContextMenu`, subtitle = translated "Artist".
- `playlistCard(record)` → square `HomeCard`, links to `/playlist/{id}/show`, subtitle = `record.ownerName`.
- `songCard(dispatch)(record)` → square `HomeCard`, `onClick` dispatches `playTracks({ [id]: record }, [id])`, overlay = `SongContextMenu`, subtitle = `record.artist`.

- [ ] **Step 1: Write the failing test**

Create `ui/src/home/Home.test.jsx`:

```jsx
import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import Home from './Home'

// Capture the props each Shelf is rendered with.
const shelfProps = []
vi.mock('./Shelf', () => ({
  Shelf: (props) => {
    shelfProps.push(props)
    return <div data-testid="shelf">{props.title}</div>
  },
}))
vi.mock('../config', () => ({ default: { enableFavourites: true } }))
vi.mock('react-redux', () => ({ useDispatch: () => vi.fn() }))
vi.mock('../actions', () => ({ playTracks: vi.fn() }))
vi.mock('../common', () => ({
  PlayButton: () => null,
  AlbumContextMenu: () => null,
  ArtistContextMenu: () => null,
  SongContextMenu: () => null,
}))
vi.mock('react-admin', () => ({
  Title: () => null,
  useTranslate: () => (key, opts) => (opts && opts._) || key,
  linkToRecord: (base, id, view) => `${base}/${id}/${view}`,
}))

describe('Home', () => {
  it('renders all seven shelves in order when favourites are enabled', () => {
    render(<Home />)
    const titles = screen.getAllByTestId('shelf').map((n) => n.textContent)
    expect(titles).toEqual([
      'Recently Added',
      'Recently Played',
      'Your favorite artists',
      'Your favorite albums',
      'Recent artists',
      'Recent songs',
      'Recent playlists',
    ])
  })

  it('points each shelf at the right resource and show-all target', () => {
    shelfProps.length = 0
    render(<Home />)
    const byTitle = Object.fromEntries(shelfProps.map((p) => [p.title, p]))
    expect(byTitle['Recently Added'].resource).toBe('album')
    expect(byTitle['Recently Added'].showAllLink).toBe('/album/recentlyAdded')
    expect(byTitle['Recent songs'].resource).toBe('song')
    expect(byTitle['Recent songs'].filter).toEqual({ recently_played: true })
    expect(byTitle['Recent artists'].resource).toBe('artist')
    expect(byTitle['Recent playlists'].resource).toBe('playlist')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd ui && npx vitest run src/home/Home.test.jsx 2>&1 | tail -20`
Expected: FAIL — `Cannot find module './Home'`.

- [ ] **Step 3: Implement the page**

Create `ui/src/home/Home.jsx`:

```jsx
import React from 'react'
import { Title, useTranslate, linkToRecord } from 'react-admin'
import { useDispatch } from 'react-redux'
import { Shelf } from './Shelf'
import { HomeCard } from './HomeCard'
import {
  PlayButton,
  AlbumContextMenu,
  ArtistContextMenu,
  SongContextMenu,
} from '../common'
import { playTracks } from '../actions'
import config from '../config'

const albumCard = (record) => (
  <HomeCard
    key={record.id}
    record={record}
    title={record.name}
    subtitle={record.albumArtist}
    variant="square"
    to={linkToRecord('/album', record.id, 'show')}
    overlay={
      <>
        <PlayButton record={record} size="small" />
        <AlbumContextMenu record={record} color="white" />
      </>
    }
  />
)

const artistCard = (translate) => (record) => (
  <HomeCard
    key={record.id}
    record={record}
    title={record.name}
    subtitle={translate('home.typeArtist', { _: 'Artist' })}
    variant="circle"
    to={linkToRecord('/artist', record.id, 'show')}
    overlay={<ArtistContextMenu record={record} color="white" />}
  />
)

const playlistCard = (record) => (
  <HomeCard
    key={record.id}
    record={record}
    title={record.name}
    subtitle={record.ownerName}
    variant="square"
    to={linkToRecord('/playlist', record.id, 'show')}
  />
)

const songCard = (dispatch) => (record) => (
  <HomeCard
    key={record.id}
    record={record}
    title={record.title}
    subtitle={record.artist}
    variant="square"
    onClick={() => dispatch(playTracks({ [record.id]: record }, [record.id]))}
    overlay={<SongContextMenu record={record} />}
  />
)

const STARRED_ARTISTS = '/artist?filter=%7B%22starred%22%3Atrue%7D&sort=starred_at&order=DESC'
const RECENT_ARTISTS = '/artist?filter=%7B%22recently_played%22%3Atrue%7D&sort=play_date&order=DESC'
const RECENT_SONGS = '/song?filter=%7B%22recently_played%22%3Atrue%7D&sort=play_date&order=DESC'

const Home = () => {
  const translate = useTranslate()
  const dispatch = useDispatch()
  const renderArtist = artistCard(translate)
  const renderSong = songCard(dispatch)

  return (
    <>
      <Title title="Navidrome" />
      <Shelf
        title={translate('home.recentlyAdded', { _: 'Recently Added' })}
        showAllLink="/album/recentlyAdded"
        resource="album"
        sort={{ field: 'recently_added', order: 'DESC' }}
        filter={{}}
        renderCard={albumCard}
      />
      <Shelf
        title={translate('home.recentlyPlayed', { _: 'Recently Played' })}
        showAllLink="/album/recentlyPlayed"
        resource="album"
        sort={{ field: 'play_date', order: 'DESC' }}
        filter={{ recently_played: true }}
        renderCard={albumCard}
      />
      {config.enableFavourites && (
        <Shelf
          title={translate('home.favoriteArtists', { _: 'Your favorite artists' })}
          showAllLink={STARRED_ARTISTS}
          resource="artist"
          sort={{ field: 'starred_at', order: 'DESC' }}
          filter={{ starred: true }}
          renderCard={renderArtist}
        />
      )}
      {config.enableFavourites && (
        <Shelf
          title={translate('home.favoriteAlbums', { _: 'Your favorite albums' })}
          showAllLink="/album/starred"
          resource="album"
          sort={{ field: 'starred_at', order: 'DESC' }}
          filter={{ starred: true }}
          renderCard={albumCard}
        />
      )}
      <Shelf
        title={translate('home.recentArtists', { _: 'Recent artists' })}
        showAllLink={RECENT_ARTISTS}
        resource="artist"
        sort={{ field: 'play_date', order: 'DESC' }}
        filter={{ recently_played: true }}
        renderCard={renderArtist}
      />
      <Shelf
        title={translate('home.recentSongs', { _: 'Recent songs' })}
        showAllLink={RECENT_SONGS}
        resource="song"
        sort={{ field: 'play_date', order: 'DESC' }}
        filter={{ recently_played: true }}
        renderCard={renderSong}
      />
      <Shelf
        title={translate('home.recentPlaylists', { _: 'Recent playlists' })}
        showAllLink="/playlist"
        resource="playlist"
        sort={{ field: 'updatedAt', order: 'DESC' }}
        filter={{}}
        renderCard={playlistCard}
      />
    </>
  )
}

export default Home
```

- [ ] **Step 4: Create the barrel export**

Create `ui/src/home/index.js`:

```js
export { default } from './Home'
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd ui && npx vitest run src/home/Home.test.jsx 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add ui/src/home/Home.jsx ui/src/home/index.js ui/src/home/Home.test.jsx
git commit -m "feat(ui): compose Home page with recent and favorite shelves"
```

---

## Task 7: UI — wire Home as the dashboard, add menu entry and translations

**Files:**
- Modify: `ui/src/App.jsx` (import `Home`, pass `dashboard={Home}` to `<RAAdmin>`)
- Modify: `ui/src/layout/Menu.jsx` (add a Home `MenuItemLink` to `/`)
- Modify: `ui/src/i18n/en.json` (add `menu.home` and the `home` section)

**Interfaces:**
- Consumes: `Home` default export from `./home` (Task 6).
- Produces: Home renders at `/` after login; a "Home" item appears at the top of the sidebar; `home.*` translation keys resolve.

- [ ] **Step 1: Add translation keys**

In `ui/src/i18n/en.json`, add a `"home"` key to the `"menu"` object (alongside `"personal"`):

```json
    "home": "Home",
```

Then add a new top-level `"home"` section (sibling of `"menu"`):

```json
  "home": {
    "showAll": "Show all",
    "typeArtist": "Artist",
    "recentlyAdded": "Recently Added",
    "recentlyPlayed": "Recently Played",
    "favoriteArtists": "Your favorite artists",
    "favoriteAlbums": "Your favorite albums",
    "recentArtists": "Recent artists",
    "recentSongs": "Recent songs",
    "recentPlaylists": "Recent playlists"
  },
```

- [ ] **Step 2: Register Home as the dashboard**

In `ui/src/App.jsx`, add the import near the other page imports (after `import customRoutes from './routes'`):

```jsx
import Home from './home'
```

Then add the `dashboard` prop to `<RAAdmin>` (in the `Admin` component's return, alongside `layout={Layout}`):

```jsx
      dashboard={Home}
```

- [ ] **Step 3: Add the Home menu item**

In `ui/src/layout/Menu.jsx`, add an import for an icon at the top with the other icon imports:

```jsx
import HomeIcon from '@material-ui/icons/Home'
```

Then, inside the returned `<div className={clsx(...)}>`, immediately after `{open && <LibrarySelector />}` and before the album `<SubMenu>`, add:

```jsx
      <MenuItemLink
        to="/"
        exact
        activeClassName={classes.active}
        primaryText={translate('menu.home', { _: 'Home' })}
        leftIcon={<HomeIcon />}
        sidebarIsOpen={open}
        dense={dense}
      />
```

- [ ] **Step 4: Run the UI test suite for the home folder + a lint/build check**

Run: `cd ui && npx vitest run src/home 2>&1 | tail -20`
Expected: PASS (all home component tests green)

Run: `cd ui && npx eslint src/home src/App.jsx src/layout/Menu.jsx 2>&1 | tail -20`
Expected: no errors

- [ ] **Step 5: Manual smoke test (documented, run if a dev server is available)**

```bash
# From repo root, with a populated Navidrome DB:
#   make dev   (or the project's UI dev command)
# Then: log in -> confirm you land on Home at '/#/'
#   - Recently Added and Recently Played album shelves show
#   - Favorite shelves appear only if you have starred artists/albums
#   - "Show all" on each shelf opens the matching list view
#   - Sidebar shows a "Home" entry at the top
```

- [ ] **Step 6: Commit**

```bash
git add ui/src/App.jsx ui/src/layout/Menu.jsx ui/src/i18n/en.json
git commit -m "feat(ui): make Home the default dashboard and add sidebar entry"
```

---

## Task 8 (Deferred / separate plan): external-client play logging fallback

Spec §6.3 proposes an **opt-in, off-by-default** fallback that registers a play
from `/rest/stream` requests for clients that never scrobble. This is **out of
scope for this plan** and should be its own spec+plan for these reasons:

- It is independent of the Home screen: the recent shelves are already populated
  by every scrobbling Subsonic client (the same pipeline behind "Recently Played
  albums"), so this plan produces working software without it.
- It carries data-quality risk (double counting, partial/skip plays) that needs
  its own design pass: config flag, play-time threshold reuse
  (`core/scrobbler/play_tracker.go` uses 50%-of-duration / 4-minute), and
  dedup against scrobbles for the same client/track/window.
- The spec lists it as an open question pending reviewer confirmation.

**Action:** once the reviewer confirms they want it, brainstorm/spec it separately
and write a dedicated plan. Do not implement it as part of the Home screen.

---

## Self-Review

**Spec coverage:**
- §3 shelves, order, hide-when-empty, card shapes → Tasks 5 (hide-when-empty), 6 (order + shapes + interactions). ✓
- §3 all-empty friendly state → **intentionally simplified**: each shelf hides
  when empty, so an empty library shows an empty page. A dedicated all-empty
  message was dropped as YAGNI for v1 (only occurs on an empty library); noted
  here as a known, accepted simplification rather than a silent omission.
- §4 component architecture (Home/Shelf/Carousel/cards) → Tasks 3–6. ✓
- §5 data sources & Show-all targets → Task 6 (exact sort/filter/links). ✓
- §6.1 recently_played for songs/artists → Tasks 1–2. ✓
- §6.2 recent playlists sort → verified already resolvable (`updatedAt` sorts in
  the existing PlaylistList datagrid); no code change needed. ✓
- §6.3 external-play fallback → Task 8, deferred to its own plan. ✓
- §7 routing + menu → Task 7. ✓
- §8 testing (Go persistence + UI Shelf/Carousel/Home) → Tasks 1–6 each ship tests. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases" left; every code step shows
complete code. The only conditional note (artist seed id `"3"`) includes explicit
fallback instructions.

**Type/name consistency:** `HomeCard` props (`record, title, subtitle, variant,
to, onClick, overlay`) are defined in Task 4 and used identically in Task 6.
`Shelf` props (`title, showAllLink, resource, sort, filter, perPage, renderCard`)
defined in Task 5, used identically in Task 6. `Carousel({ children })` from Task
3 used in Task 5. `recentlyPlayedFilter` referenced consistently in Tasks 1–2.
Translation keys (`home.showAll`, `home.typeArtist`, `home.recent*`,
`home.favorite*`, `menu.home`) defined in Task 7 and consumed in Tasks 5–6.
