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
