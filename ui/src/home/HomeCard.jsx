import React from 'react'
import { Link } from 'react-router-dom'
import { Typography } from '@material-ui/core'
import { makeStyles } from '@material-ui/core/styles'
import Skeleton from '@material-ui/lab/Skeleton'
import clsx from 'clsx'
import subsonic from '../subsonic'
import config from '../config'
import { useImageUrl, OverflowTooltip } from '../common'

const useStyles = makeStyles((theme) => ({
  card: {
    width: 160,
    flex: '0 0 auto',
    textDecoration: 'none',
    cursor: 'pointer',
    color: 'inherit',
    '&:hover $overlay, &:focus-within $overlay': { opacity: 1 },
  },
  artContainer: { position: 'relative', width: 160, height: 160 },
  art: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transition: 'opacity 0.3s ease-in-out',
    backgroundColor: theme.palette.type === 'dark' ? '#333' : '#eee',
  },
  square: { borderRadius: 6 },
  circle: { borderRadius: '50%' },
  artLoading: { opacity: 0 },
  overlay: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    display: 'flex',
    opacity: 0,
    transition: 'opacity 150ms ease-out',
    color: '#fff',
  },
  title: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: 600,
    color: theme.palette.text.primary,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
  subtitle: {
    fontSize: 12,
    color: theme.palette.text.secondary,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
}))

export const HomeCard = ({
  record,
  title,
  subtitle,
  variant = 'square',
  to,
  onClick,
  overlay,
}) => {
  const classes = useStyles()
  const square = variant !== 'circle'
  const url = subsonic.getCoverArtUrl(record, config.uiCoverArtSize, square)
  const { imgUrl, loading } = useImageUrl(url)

  const body = (
    <>
      <div className={classes.artContainer}>
        <img
          src={imgUrl || undefined}
          alt={title}
          className={clsx(
            classes.art,
            square ? classes.square : classes.circle,
            loading && classes.artLoading,
          )}
        />
        {overlay && <div className={classes.overlay}>{overlay}</div>}
      </div>
      <OverflowTooltip title={title}>
        <Typography className={classes.title}>{title}</Typography>
      </OverflowTooltip>
      {subtitle && (
        <Typography className={classes.subtitle}>{subtitle}</Typography>
      )}
    </>
  )

  if (to) {
    return (
      <Link className={classes.card} to={to}>
        {body}
      </Link>
    )
  }
  return (
    <div className={classes.card} role="button" tabIndex={0} onClick={onClick}>
      {body}
    </div>
  )
}

// Placeholder rendered in a shelf while its data loads. It reuses HomeCard's
// exact style classes so the loading state and the loaded card share identical
// geometry — when the real card swaps in, nothing reflows. The Skeleton text
// lines sit inside the same Typography boxes as the real title/subtitle, so
// their heights match the loaded card line-for-line.
export const HomeCardSkeleton = ({ variant = 'square' }) => {
  const classes = useStyles()
  const square = variant !== 'circle'
  return (
    <div className={classes.card} aria-hidden="true">
      <div className={classes.artContainer}>
        <Skeleton
          variant={square ? 'rect' : 'circle'}
          width="100%"
          height="100%"
          className={square ? classes.square : undefined}
        />
      </div>
      <Typography className={classes.title}>
        <Skeleton width="80%" />
      </Typography>
      <Typography className={classes.subtitle}>
        <Skeleton width="55%" />
      </Typography>
    </div>
  )
}
