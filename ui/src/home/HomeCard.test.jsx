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
