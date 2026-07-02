import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { CoverImage } from './CoverImage'

describe('CoverImage', () => {
  it('renders a native lazy-loaded image', () => {
    render(<CoverImage src="http://example/art.png" alt="Dark Side" />)
    const img = screen.getByAltText('Dark Side')
    expect(img).toHaveAttribute('src', 'http://example/art.png')
    expect(img).toHaveAttribute('loading', 'lazy')
  })

  it('starts hidden and reveals the image on load', () => {
    render(<CoverImage src="http://example/art.png" alt="cover" />)
    const img = screen.getByAltText('cover')
    // Before load, the placeholder shows through (image faded out).
    expect(img.className).toMatch(/loading/)
    fireEvent.load(img)
    expect(img.className).not.toMatch(/loading/)
  })

  it('forwards the ref to the container and applies className/imgClassName', () => {
    const ref = React.createRef()
    render(
      <CoverImage
        ref={ref}
        src="http://example/art.png"
        alt="cover"
        className="my-container"
        imgClassName="my-img"
      />,
    )
    expect(ref.current).toBeInstanceOf(HTMLDivElement)
    expect(ref.current.className).toMatch(/my-container/)
    expect(screen.getByAltText('cover').className).toMatch(/my-img/)
  })

  it('omits src when none is provided (placeholder only)', () => {
    render(<CoverImage alt="empty" />)
    expect(screen.getByAltText('empty')).not.toHaveAttribute('src')
  })
})
