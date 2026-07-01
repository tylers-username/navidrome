import React from 'react'
import { useGetList, useTranslate, Link } from 'react-admin'
import { Typography } from '@material-ui/core'
import { makeStyles } from '@material-ui/core/styles'
import { Carousel } from './Carousel'

const useStyles = makeStyles((theme) => ({
  root: { margin: '28px 20px' },
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
  renderCard,
}) => {
  const classes = useStyles()
  const translate = useTranslate()
  const { ids, data, loaded } = useGetList(
    resource,
    { page: 1, perPage },
    sort,
    filter,
  )

  if (!loaded || !ids || ids.length === 0) return null

  return (
    <div className={classes.root}>
      <div className={classes.header}>
        <Typography className={classes.title}>{title}</Typography>
        {showAllLink && (
          <Link to={showAllLink} className={classes.showAll}>
            {translate('home.showAll', { _: 'Show all' })}
          </Link>
        )}
      </div>
      <Carousel>{ids.map((id) => renderCard(data[id]))}</Carousel>
    </div>
  )
}
