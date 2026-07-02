import { useCallback, useEffect, useRef, useState } from 'react'
import { useDataProvider } from 'react-admin'

const emptyState = { ids: [], data: {}, total: undefined, page: 0 }

export const useInfiniteListController = ({
  resource,
  sort,
  filter,
  batchSize = 50,
}) => {
  const dataProvider = useDataProvider()
  const [state, setState] = useState(emptyState)
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)

  // Serialized key: any change resets accumulation.
  const key = JSON.stringify({ resource, sort, filter })
  const keyRef = useRef(key)
  const loadingRef = useRef(false)
  const stateRef = useRef(state)
  stateRef.current = state

  const fetchPage = useCallback(
    (page, fetchKey) => {
      if (loadingRef.current) return
      loadingRef.current = true
      setLoading(true)
      if (page > 1) setLoadingMore(true)
      dataProvider
        .getList(resource, {
          pagination: { page, perPage: batchSize },
          sort,
          filter,
        })
        .then(({ data, total }) => {
          // Ignore responses whose key is no longer current.
          if (keyRef.current !== fetchKey) return
          setState((prev) => {
            const base = page === 1 ? emptyState : prev
            const nextData = { ...base.data }
            const nextIds = [...base.ids]
            data.forEach((record) => {
              if (nextData[record.id] === undefined) nextIds.push(record.id)
              nextData[record.id] = record
            })
            return { ids: nextIds, data: nextData, total, page }
          })
          setLoaded(true)
          setError(null)
        })
        .catch((e) => {
          if (keyRef.current !== fetchKey) return
          setError(e)
        })
        .finally(() => {
          if (keyRef.current !== fetchKey) return
          loadingRef.current = false
          setLoading(false)
          setLoadingMore(false)
        })
    },
    [dataProvider, resource, sort, filter, batchSize],
  )

  // Reset + fetch batch 1 whenever the key changes (incl. first mount).
  useEffect(() => {
    keyRef.current = key
    loadingRef.current = false
    setState(emptyState)
    setLoaded(false)
    setError(null)
    setLoadingMore(false)
    fetchPage(1, key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const hasMore = state.total !== undefined && state.ids.length < state.total

  const loadMore = useCallback(() => {
    if (loadingRef.current || !hasMore) return
    fetchPage(stateRef.current.page + 1, keyRef.current)
  }, [fetchPage, hasMore])

  return {
    ids: state.ids,
    data: state.data,
    total: state.total,
    loaded,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
  }
}
