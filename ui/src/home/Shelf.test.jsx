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
