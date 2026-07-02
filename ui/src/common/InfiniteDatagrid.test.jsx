import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import { TextField } from 'react-admin'
import { InfiniteDatagrid } from './InfiniteDatagrid'

// react-virtuoso renders via portals/measurement that jsdom can't size;
// stub TableVirtuoso to render synchronously. Route rows through the real
// `components.TableRow` (with `item`/`context` props, as react-virtuoso
// does) so per-row behavior driven by context (e.g. rowClassName) is
// actually exercised by the test. We also capture the `rangeChanged` prop
// so tests can invoke it directly, simulating react-virtuoso reporting the
// last mounted row index.
let lastRangeChanged
vi.mock('react-virtuoso', () => ({
  TableVirtuoso: ({
    data,
    components,
    fixedHeaderContent,
    itemContent,
    context,
    rangeChanged,
  }) => {
    lastRangeChanged = rangeChanged
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

  it('renders the header label via FieldTitle (translated/humanized, not the raw source)', () => {
    render(<InfiniteDatagrid {...base} />)
    // No i18nProvider is registered in this test, so the default
    // TranslationContext translate() is an identity function that ignores
    // the humanized fallback and returns the translation key itself. This
    // still proves the header goes through FieldTitle's
    // resources.<resource>.fields.<source> lookup rather than rendering the
    // raw camelCase source ("name").
    expect(screen.getByText('resources.album.fields.name')).toBeInTheDocument()
    expect(screen.queryByText('name')).not.toBeInTheDocument()
  })

  it('calls setSort with the field key and its sortByOrder on first click of a new column', () => {
    const setSort = vi.fn()
    render(
      <InfiniteDatagrid
        {...base}
        setSort={setSort}
        currentSort={{ field: 'other', order: 'ASC' }}
        fields={[<TextField key="name" source="name" sortByOrder="DESC" />]}
      />,
    )
    fireEvent.click(screen.getByText('resources.album.fields.name'))
    expect(setSort).toHaveBeenCalledWith('name', 'DESC')
  })

  it('defaults to ASC on first click when the field has no sortByOrder', () => {
    const setSort = vi.fn()
    render(
      <InfiniteDatagrid
        {...base}
        setSort={setSort}
        currentSort={{ field: 'other', order: 'ASC' }}
      />,
    )
    fireEvent.click(screen.getByText('resources.album.fields.name'))
    expect(setSort).toHaveBeenCalledWith('name', 'ASC')
  })

  it('toggles ASC -> DESC when clicking the already-sorted column', () => {
    const setSort = vi.fn()
    render(
      <InfiniteDatagrid
        {...base}
        setSort={setSort}
        currentSort={{ field: 'name', order: 'ASC' }}
      />,
    )
    fireEvent.click(screen.getByText('resources.album.fields.name'))
    expect(setSort).toHaveBeenCalledWith('name', 'DESC')
  })

  it('toggles DESC -> ASC when clicking the already-sorted column', () => {
    const setSort = vi.fn()
    render(
      <InfiniteDatagrid
        {...base}
        setSort={setSort}
        currentSort={{ field: 'name', order: 'DESC' }}
      />,
    )
    fireEvent.click(screen.getByText('resources.album.fields.name'))
    expect(setSort).toHaveBeenCalledWith('name', 'ASC')
  })

  it('drives auto-load via rangeChanged (not endReached) so it works under useWindowScroll', () => {
    const loadMore = vi.fn()
    render(<InfiniteDatagrid {...base} hasMore={true} loadMore={loadMore} />)
    // Not yet near the end: no load.
    lastRangeChanged({ startIndex: 0, endIndex: 0 })
    expect(loadMore).not.toHaveBeenCalled()

    // react-virtuoso reports the last mounted row as the end of ids: load.
    lastRangeChanged({ startIndex: 0, endIndex: base.ids.length - 1 })
    expect(loadMore).toHaveBeenCalled()
  })

  it('does not auto-load past the end when hasMore is false', () => {
    const loadMore = vi.fn()
    render(<InfiniteDatagrid {...base} hasMore={false} loadMore={loadMore} />)
    lastRangeChanged({ startIndex: 0, endIndex: base.ids.length - 1 })
    expect(loadMore).not.toHaveBeenCalled()
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
