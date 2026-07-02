import React, { forwardRef } from 'react'
import { VirtuosoGrid } from 'react-virtuoso'
import { makeStyles } from '@material-ui/core/styles'

// VirtuosoGrid measures item/list geometry to window the grid, and only
// supports a flex-wrap layout for that measurement (a CSS `display:grid`
// container collapses its cells to full width). We reproduce the original
// MUI GridList look with flex-wrap: each item is `100/cols` of the row
// (minus the inter-item gaps), which matches `getColsForWidth`.
const useStyles = makeStyles({
  scroller: { margin: '20px' },
  list: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: (props) => `${props.spacing}px`,
  },
  item: {
    boxSizing: 'border-box',
    width: (props) =>
      `calc((100% - ${(props.cols - 1) * props.spacing}px) / ${props.cols})`,
  },
})

const buildComponents = (classes) => {
  const List = forwardRef(({ style, children, ...props }, ref) => (
    <div ref={ref} className={classes.list} style={style} {...props}>
      {children}
    </div>
  ))
  List.displayName = 'InfiniteGridList'
  const Item = ({ children, ...props }) => (
    <div className={classes.item} {...props}>
      {children}
    </div>
  )
  Item.displayName = 'InfiniteGridItem'
  return { List, Item }
}

export const InfiniteGrid = ({
  ids,
  cols,
  spacing = 20,
  loadMore,
  hasMore,
  loadingMore,
  total,
  renderItem,
}) => {
  const classes = useStyles({ cols, spacing })
  const components = React.useMemo(() => buildComponents(classes), [classes])
  return (
    <VirtuosoGrid
      useWindowScroll
      className={classes.scroller}
      totalCount={ids.length}
      components={components}
      endReached={() => hasMore && loadMore()}
      itemContent={(index) => renderItem(ids[index])}
      overscan={600}
    />
  )
}
