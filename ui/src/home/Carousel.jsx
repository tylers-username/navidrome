import React, { useRef } from 'react'
import { IconButton } from '@material-ui/core'
import { makeStyles } from '@material-ui/core/styles'
import ChevronLeftIcon from '@material-ui/icons/ChevronLeft'
import ChevronRightIcon from '@material-ui/icons/ChevronRight'

const useStyles = makeStyles({
  root: {
    position: 'relative',
    // Grid with a minmax(0, 1fr) track lets the scroller shrink below its
    // intrinsic (all-cards-wide) size. Without this, the flex scroller's
    // width propagates up to react-admin's content column (a flex item with
    // the default min-width: auto), which refuses to shrink and overflows the
    // page horizontally instead of scrolling internally.
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    '&:hover $chevron': { opacity: 1 },
  },
  scroller: {
    minWidth: 0,
    display: 'flex',
    gap: '16px',
    overflowX: 'auto',
    // Keep horizontal overscroll inside the carousel so swiping past the
    // start/end doesn't chain to the browser's back/forward navigation
    // (e.g. the macOS two-finger swipe-to-go-back gesture).
    overscrollBehaviorX: 'contain',
    scrollBehavior: 'smooth',
    scrollSnapType: 'x proximity',
    paddingBottom: '8px',
    '& > *': { scrollSnapAlign: 'start' },
    '&::-webkit-scrollbar': { display: 'none' },
    scrollbarWidth: 'none',
    msOverflowStyle: 'none',
  },
  chevron: {
    position: 'absolute',
    top: '30%',
    zIndex: 2,
    opacity: 0,
    transition: 'opacity 150ms ease-out',
    backgroundColor: 'rgba(0,0,0,0.6)',
    color: '#fff',
    '&:hover': { backgroundColor: 'rgba(0,0,0,0.8)' },
  },
  left: { left: 0 },
  right: { right: 0 },
})

export const Carousel = ({ children }) => {
  const classes = useStyles()
  const ref = useRef(null)

  const scroll = (direction) => {
    const el = ref.current
    if (el) {
      el.scrollBy({
        left: direction * el.clientWidth * 0.8,
        behavior: 'smooth',
      })
    }
  }

  return (
    <div className={classes.root}>
      <IconButton
        aria-label="scroll left"
        className={`${classes.chevron} ${classes.left}`}
        size="small"
        onClick={() => scroll(-1)}
      >
        <ChevronLeftIcon />
      </IconButton>
      <div className={classes.scroller} ref={ref}>
        {children}
      </div>
      <IconButton
        aria-label="scroll right"
        className={`${classes.chevron} ${classes.right}`}
        size="small"
        onClick={() => scroll(1)}
      >
        <ChevronRightIcon />
      </IconButton>
    </div>
  )
}
