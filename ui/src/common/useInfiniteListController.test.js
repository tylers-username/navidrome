import { renderHook, act } from '@testing-library/react-hooks'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useDataProvider } from 'react-admin'
import { useInfiniteListController } from './useInfiniteListController'

vi.mock('react-admin', async () => {
  const actual = await vi.importActual('react-admin')
  return { ...actual, useDataProvider: vi.fn() }
})

const makeRecords = (from, to) =>
  Array.from({ length: to - from }, (_, i) => ({ id: `id-${from + i}` }))

describe('useInfiniteListController', () => {
  let getList
  beforeEach(() => {
    vi.clearAllMocks()
    getList = vi.fn()
    useDataProvider.mockReturnValue({ getList })
  })

  const opts = {
    resource: 'album',
    sort: { field: 'name', order: 'ASC' },
    filter: {},
    batchSize: 50,
  }

  it('fetches the first batch on mount and exposes ids/total/hasMore', async () => {
    getList.mockResolvedValueOnce({ data: makeRecords(0, 50), total: 120 })
    const { result, waitForNextUpdate } = renderHook(() =>
      useInfiniteListController(opts),
    )
    await waitForNextUpdate()
    expect(getList).toHaveBeenCalledWith('album', {
      pagination: { page: 1, perPage: 50 },
      sort: { field: 'name', order: 'ASC' },
      filter: {},
    })
    expect(result.current.ids).toHaveLength(50)
    expect(result.current.total).toBe(120)
    expect(result.current.loaded).toBe(true)
    expect(result.current.hasMore).toBe(true)
  })

  it('loadMore fetches the next page and appends', async () => {
    getList
      .mockResolvedValueOnce({ data: makeRecords(0, 50), total: 120 })
      .mockResolvedValueOnce({ data: makeRecords(50, 100), total: 120 })
    const { result, waitForNextUpdate } = renderHook(() =>
      useInfiniteListController(opts),
    )
    await waitForNextUpdate()
    act(() => result.current.loadMore())
    await waitForNextUpdate()
    expect(getList).toHaveBeenLastCalledWith('album', {
      pagination: { page: 2, perPage: 50 },
      sort: { field: 'name', order: 'ASC' },
      filter: {},
    })
    expect(result.current.ids).toHaveLength(100)
    expect(result.current.hasMore).toBe(true)
  })

  it('loadMore is a no-op when nothing more to load', async () => {
    getList.mockResolvedValueOnce({ data: makeRecords(0, 30), total: 30 })
    const { result, waitForNextUpdate } = renderHook(() =>
      useInfiniteListController(opts),
    )
    await waitForNextUpdate()
    expect(result.current.hasMore).toBe(false)
    act(() => result.current.loadMore())
    expect(getList).toHaveBeenCalledTimes(1)
  })

  it('resets accumulation and refetches page 1 when sort changes', async () => {
    getList
      .mockResolvedValueOnce({ data: makeRecords(0, 50), total: 120 })
      .mockResolvedValueOnce({ data: makeRecords(0, 50), total: 200 })
    const { result, waitForNextUpdate, rerender } = renderHook(
      (props) => useInfiniteListController(props),
      { initialProps: opts },
    )
    await waitForNextUpdate()
    rerender({ ...opts, sort: { field: 'year', order: 'DESC' } })
    await waitForNextUpdate()
    expect(getList).toHaveBeenLastCalledWith('album', {
      pagination: { page: 1, perPage: 50 },
      sort: { field: 'year', order: 'DESC' },
      filter: {},
    })
    expect(result.current.ids).toHaveLength(50)
    expect(result.current.total).toBe(200)
  })

  it('ignores a stale in-flight response after the key changes', async () => {
    let resolveFirst
    getList
      .mockImplementationOnce(() => new Promise((res) => (resolveFirst = res)))
      .mockResolvedValueOnce({ data: makeRecords(0, 10), total: 10 })
    const { result, waitForNextUpdate, rerender } = renderHook(
      (props) => useInfiniteListController(props),
      { initialProps: opts },
    )
    // change key before first resolves
    rerender({ ...opts, filter: { name: 'x' } })
    await waitForNextUpdate()
    // now resolve the stale first request
    act(() => resolveFirst({ data: makeRecords(500, 550), total: 999 }))
    expect(result.current.ids).toHaveLength(10)
    expect(result.current.total).toBe(10)
  })
})
