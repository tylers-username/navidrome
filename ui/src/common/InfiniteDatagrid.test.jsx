import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import { TextField } from 'react-admin'
import { InfiniteDatagrid } from './InfiniteDatagrid'

// react-virtuoso renders via portals/measurement that jsdom can't size;
// stub TableVirtuoso to render synchronously. Route rows through the real
// `components.TableRow` (with `item`/`context` props, as react-virtuoso
// does) so per-row behavior driven by context (e.g. rowClassName) is
// actually exercised by the test.
vi.mock('react-virtuoso', () => ({
  TableVirtuoso: ({
    data,
    components,
    fixedHeaderContent,
    itemContent,
    context,
  }) => {
    const Row = components.TableRow
    return (
      <table>
        <thead>{fixedHeaderContent()}</thead>
        <tbody>
          {data.map((item, index) => (
            <Row key={item} item={item} context={context}>
              {itemContent(index, item, context)}
            </Row>
          ))}
        </tbody>
      </table>
    )
  },
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

  it('applies rowClassName to the row via context, e.g. for missing albums', () => {
    const props = {
      ...base,
      ids: ['a1', 'a2'],
      data: {
        a1: { id: 'a1', name: 'Alpha', missing: false },
        a2: { id: 'a2', name: 'Beta', missing: true },
      },
      rowClassName: (record) => (record?.missing ? 'missingRow' : 'row'),
    }
    render(<InfiniteDatagrid {...props} />)

    const alphaRow = screen.getByText('Alpha').closest('tr')
    const betaRow = screen.getByText('Beta').closest('tr')

    expect(alphaRow).toHaveClass('row')
    expect(alphaRow).not.toHaveClass('missingRow')
    expect(betaRow).toHaveClass('missingRow')
  })
})
