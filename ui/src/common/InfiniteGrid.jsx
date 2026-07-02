import React, { forwardRef } from 'react'
import { VirtuosoGrid } from 'react-virtuoso'
import { makeStyles } from '@material-ui/core/styles'

const useStyles = makeStyles({
  list: (props) => ({
    display: 'grid',
    gridTemplateColumns: `repeat(${props.cols}, 1fr)`,
    gap: props.spacing,
  }),
  scroller: { margin: '20px' },
})

const buildComponents = (classes) => {
  const List = forwardRef(({ style, children, ...props }, ref) => (
    <div ref={ref} className={classes.list} style={style} {...props}>
      {children}
    </div>
  ))
  List.displayName = 'InfiniteGridList'
  const Item = ({ children, ...props }) => <div {...props}>{children}</div>
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
