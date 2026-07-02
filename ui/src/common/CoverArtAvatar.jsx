import { useRecordContext } from 'react-admin'
import { Avatar } from '@material-ui/core'
import { makeStyles } from '@material-ui/core/styles'
import clsx from 'clsx'
import config from '../config'
import subsonic from '../subsonic'
import { coverPlaceholderColor } from './coverPlaceholder'

const useStyles = makeStyles((theme) => ({
  avatar: {
    width: '55px',
    height: '55px',
    // Neutral placeholder while the native lazy image loads.
    backgroundColor: coverPlaceholderColor(theme),
  },
  square: {
    borderRadius: '4px',
  },
}))

export const CoverArtAvatar = ({
  record: recordProp,
  variant = 'circular',
}) => {
  const classes = useStyles()
  const recordContext = useRecordContext()
  const record = recordProp || recordContext
  const square = variant !== 'circular'
  const url = record
    ? subsonic.getCoverArtUrl(record, config.uiCoverArtSize, square)
    : null
  if (!record) return null
  return (
    <Avatar
      src={url || undefined}
      variant={variant}
      className={clsx(classes.avatar, square && classes.square)}
      imgProps={{ loading: 'lazy' }}
      alt={record.name}
    >
      {/* Empty child prevents default person icon over the neutral background */}
      <span />
    </Avatar>
  )
}

CoverArtAvatar.defaultProps = { label: '', sortable: false }
