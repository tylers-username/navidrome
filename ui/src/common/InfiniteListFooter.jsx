import React from 'react'
import { CircularProgress } from '@material-ui/core'
import { makeStyles } from '@material-ui/core/styles'
import { useTranslate } from 'react-admin'

const useStyles = makeStyles((theme) => ({
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing(1),
    padding: theme.spacing(2),
    color: theme.palette.text.secondary,
    fontSize: '0.85em',
  },
}))

export const InfiniteListFooter = ({ count, total, loadingMore, hasMore }) => {
  const classes = useStyles()
  const translate = useTranslate()
  if (!count && total === undefined) return null
  return (
    <div className={classes.footer}>
      {loadingMore && <CircularProgress size={16} />}
      <span>
        {translate('ra.navigation.infinite_loaded', {
          count,
          total: total ?? count,
        })}
      </span>
      {!hasMore && total !== undefined && <span>·</span>}
    </div>
  )
}
