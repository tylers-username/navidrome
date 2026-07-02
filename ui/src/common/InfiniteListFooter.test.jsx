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
    render(<InfiniteListFooter count={50} total={120} loadingMore hasMore />)
    expect(screen.getByText('50 of 120')).toBeInTheDocument()
  })

  it('renders nothing when total is undefined and count is 0', () => {
    const { container } = render(
      <InfiniteListFooter count={0} total={undefined} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
