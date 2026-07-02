import React, { forwardRef } from 'react'
import { TableVirtuoso } from 'react-virtuoso'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableSortLabel,
} from '@material-ui/core'
import { useHistory } from 'react-router-dom'
import { linkToRecord } from 'react-admin'

const fieldKey = (field) => field.props.sortBy || field.props.source
const fieldLabel = (field) => field.props.label || field.props.source

// Always render a sticky header, regardless of caller-supplied props.
const VirtuosoTable = forwardRef((props, ref) => (
  <Table {...props} ref={ref} stickyHeader />
))
VirtuosoTable.displayName = 'InfiniteDatagridTable'

// TableVirtuoso passes the row's data item (here: the record id, since we
// pass `data={ids}`) as `item`, and whatever we pass as `context` on
// TableVirtuoso as `context`. We use that to look up the record and compute
// the per-row className, since `itemContent` only controls the <td> cells,
// not the <tr> itself.
const VirtuosoTableRow = forwardRef(({ item, context, ...props }, ref) => {
  const record = context?.data?.[item]
  const className = context?.rowClassName
    ? context.rowClassName(record)
    : undefined
  return <TableRow {...props} ref={ref} className={className} />
})
VirtuosoTableRow.displayName = 'InfiniteDatagridRow'

const components = {
  Table: VirtuosoTable,
  TableHead,
  TableBody,
  TableRow: VirtuosoTableRow,
}

export const InfiniteDatagrid = ({
  resource,
  basePath,
  rowClick,
  ids,
  data,
  loadMore,
  hasMore,
  loadingMore,
  currentSort,
  setSort,
  fields,
  rowClassName,
}) => {
  const history = useHistory()

  const handleRowClick = (record) => {
    if (!record) return
    if (rowClick === 'show') {
      history.push(linkToRecord(basePath, record.id, 'show'))
    } else if (typeof rowClick === 'function') {
      rowClick(record.id, basePath, record)
    }
  }

  const header = () => (
    <TableRow>
      {fields.map((field, i) => {
        const key = fieldKey(field)
        const sortable = field.props.sortable !== false && !!key
        return (
          <TableCell key={key || i}>
            {sortable ? (
              <TableSortLabel
                active={currentSort?.field === key}
                direction={
                  currentSort?.field === key
                    ? currentSort.order.toLowerCase()
                    : 'asc'
                }
                onClick={() => setSort(key)}
              >
                {fieldLabel(field)}
              </TableSortLabel>
            ) : (
              fieldLabel(field)
            )}
          </TableCell>
        )
      })}
    </TableRow>
  )

  const itemContent = (index, id) => {
    const record = data[id]
    if (!record) return null
    return fields.map((field, i) => (
      <TableCell
        key={fieldKey(field) || i}
        onClick={() => handleRowClick(record)}
      >
        {React.cloneElement(field, { record, basePath, resource })}
      </TableCell>
    ))
  }

  return (
    <TableVirtuoso
      useWindowScroll
      data={ids}
      components={components}
      fixedHeaderContent={header}
      itemContent={itemContent}
      context={{ data, rowClassName }}
      endReached={() => hasMore && loadMore()}
      overscan={600}
      aria-label={`${resource} list`}
    />
  )
}
