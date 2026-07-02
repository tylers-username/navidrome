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
vi.mock('./HomeCard', () => ({
  HomeCardSkeleton: ({ variant }) => (
    <div data-testid="skeleton" data-variant={variant} />
  ),
}))

describe('Shelf', () => {
  beforeEach(() => vi.clearAllMocks())

  const renderCard = (record) => <div key={record.id}>{record.name}</div>

  it('shows the header and skeleton cards while loading', () => {
    mockUseGetList.mockReturnValue({ ids: [], data: {}, loaded: false })
    render(
      <Shelf
        title="Recent"
        resource="album"
        sort={{}}
        filter={{}}
        renderCard={renderCard}
      />,
    )
    // Title renders immediately (it comes from props, not the pending query),
    // and the shelf reserves space with skeleton cards instead of collapsing.
    expect(screen.getByText('Recent')).toBeInTheDocument()
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0)
  })

  it('renders circle skeletons when variant is circle', () => {
    mockUseGetList.mockReturnValue({ ids: [], data: {}, loaded: false })
    render(
      <Shelf
        title="Artists"
        resource="artist"
        sort={{}}
        filter={{}}
        variant="circle"
        renderCard={renderCard}
      />,
    )
    expect(screen.getAllByTestId('skeleton')[0]).toHaveAttribute(
      'data-variant',
      'circle',
    )
  })

  it('returns null when loaded but empty', () => {
    mockUseGetList.mockReturnValue({ ids: [], data: {}, loaded: true })
    const { container } = render(
      <Shelf
        title="Recent"
        resource="album"
        sort={{}}
        filter={{}}
        renderCard={renderCard}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders title, show-all link, and cards when populated', () => {
    mockUseGetList.mockReturnValue({
      ids: ['1', '2'],
      data: {
        1: { id: '1', name: 'Album One' },
        2: { id: '2', name: 'Album Two' },
      },
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
    expect(screen.getByText('Show all')).toHaveAttribute(
      'href',
      '/album/recentlyAdded',
    )
    expect(screen.getByText('Album One')).toBeInTheDocument()
    expect(screen.getByText('Album Two')).toBeInTheDocument()
  })

  // useGetList returns `ids` (per-query) and `data` (a per-resource record pool)
  // from independent store slices. The pool is pruned on a stale-while-revalidate
  // cycle, on deletes, and by concurrent queries against the same resource — so an
  // id in `ids` can have no record in `data`. The home page hits this because many
  // shelves share the `album` resource. Missing records must be skipped, not passed
  // to renderCard (which would crash on record.name).
  it('skips ids whose record is missing from data', () => {
    mockUseGetList.mockReturnValue({
      ids: ['1', '2', '3'],
      data: {
        1: { id: '1', name: 'Album One' },
        // id '2' is in ids but absent from the record pool
        3: { id: '3', name: 'Album Three' },
      },
      loaded: true,
    })
    render(
      <Shelf
        title="Recently Added"
        resource="album"
        sort={{ field: 'recently_added', order: 'DESC' }}
        filter={{}}
        renderCard={renderCard}
      />,
    )
    expect(screen.getByText('Album One')).toBeInTheDocument()
    expect(screen.getByText('Album Three')).toBeInTheDocument()
  })
})
