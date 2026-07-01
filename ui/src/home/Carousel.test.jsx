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
