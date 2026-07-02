import React from 'react'
import { useGetList, useTranslate, Link } from 'react-admin'
import { Typography, Collapse, useMediaQuery } from '@material-ui/core'
import { makeStyles } from '@material-ui/core/styles'
import { Carousel } from './Carousel'
import { HomeCardSkeleton } from './HomeCard'

// Cards shown while a shelf loads. Enough to span a typical viewport; any extras
// simply scroll off the edge of the carousel, and the real list (up to perPage)
// swaps in without changing the row's height.
const SKELETON_COUNT = 8

const useStyles = makeStyles((theme) => ({
  // Vertical spacing between shelves lives on the parent list (a flex column
  // with a row gap in Home) so it doesn't depend on margin-collapse — which
  // MUI's Collapse wrapper would otherwise break. Only the horizontal inset
  // is a shelf concern.
  root: { margin: '0 20px' },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 12,
  },
  title: { fontSize: 22, fontWeight: 700, color: theme.palette.text.primary },
  showAll: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    textDecoration: 'none',
    color: theme.palette.text.secondary,
  },
}))

export const Shelf = ({
  title,
  showAllLink,
  resource,
  sort,
  filter,
  perPage = 20,
  variant = 'square',
  renderCard,
}) => {
  const classes = useStyles()
  const translate = useTranslate()
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const { ids, data, loaded } = useGetList(
    resource,
    { page: 1, perPage },
    sort,
    filter,
  )

  // A shelf with no results is hidden entirely — but only once we know it's
  // empty. Until then it holds a full-height skeleton so the page settles into
  // its final layout up front and each shelf's cards swap in without shoving
  // the ones below it around. When the shelf does turn out empty, Collapse
  // animates it (and the space it reserved) closed instead of snapping shut.
  const isEmpty = loaded && (!ids || ids.length === 0)

  // Keep the skeletons mounted through the collapse so an empty shelf glides
  // from its full height down to nothing, rather than shrinking to a bare
  // header the instant the (empty) result lands and then collapsing from there.
  const showSkeleton = !loaded || isEmpty

  return (
    <Collapse in={!isEmpty} timeout={reduceMotion ? 0 : 260} unmountOnExit>
      <div className={classes.root}>
        <div className={classes.header}>
          <Typography className={classes.title}>{title}</Typography>
          {showAllLink && (
            <Link to={showAllLink} className={classes.showAll}>
              {translate('home.showAll', { _: 'Show all' })}
            </Link>
          )}
        </div>
        <Carousel>
          {showSkeleton
            ? Array.from({ length: SKELETON_COUNT }, (_, i) => (
                <HomeCardSkeleton key={i} variant={variant} />
              ))
            : ids.map((id) => renderCard(data[id]))}
        </Carousel>
      </div>
    </Collapse>
  )
}
