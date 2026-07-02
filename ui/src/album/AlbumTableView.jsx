import React, { useMemo } from 'react'
import {
  DateField,
  NumberField,
  TextField,
  FunctionField,
  useListContext,
} from 'react-admin'
import { useMediaQuery } from '@material-ui/core'
import FavoriteBorderIcon from '@material-ui/icons/FavoriteBorder'
import { makeStyles } from '@material-ui/core/styles'
import {
  ArtistLinkField,
  CoverArtAvatar,
  DurationField,
  RangeField,
  SimpleList,
  AlbumContextMenu,
  RatingField,
  useSelectedFields,
  SizeField,
  InfiniteDatagrid,
  InfiniteListFooter,
  useInfiniteListController,
} from '../common'
import config from '../config'
import clsx from 'clsx'

const useStyles = makeStyles({
  columnIcon: {
    marginLeft: '3px',
    marginTop: '-2px',
    verticalAlign: 'text-top',
  },
  row: {
    '&:hover': {
      '& $contextMenu': {
        visibility: 'visible',
      },
      '& $ratingField': {
        visibility: 'visible',
      },
    },
  },
  missingRow: {
    opacity: 0.3,
  },
  tableCell: {
    width: '17.5%',
  },
  contextMenu: {
    visibility: 'hidden',
  },
  ratingField: {
    visibility: 'hidden',
  },
})

const AlbumTableView = ({
  hasShow,
  hasEdit,
  hasList,
  syncWithLocation,
  ...rest
}) => {
  const classes = useStyles()
  const isDesktop = useMediaQuery((theme) => theme.breakpoints.up('md'))
  const isXsmall = useMediaQuery((theme) => theme.breakpoints.down('xs'))

  const toggleableFields = useMemo(() => {
    return {
      artist: <ArtistLinkField source="albumArtist" />,
      songCount: isDesktop && (
        <NumberField source="songCount" sortByOrder={'DESC'} />
      ),
      playCount: isDesktop && (
        <NumberField source="playCount" sortByOrder={'DESC'} />
      ),
      year: (
        <RangeField source={'year'} sortBy={'max_year'} sortByOrder={'DESC'} />
      ),
      mood: isDesktop && (
        <FunctionField
          source="mood"
          render={(r) => r.tags?.mood?.[0] || ''}
          sortable={false}
        />
      ),
      duration: isDesktop && <DurationField source="duration" />,
      size: isDesktop && <SizeField source="size" />,
      rating: config.enableStarRating && (
        <RatingField
          source={'rating'}
          resource={'album'}
          sortByOrder={'DESC'}
          className={classes.ratingField}
        />
      ),
      createdAt: isDesktop && <DateField source="createdAt" showTime />,
    }
  }, [classes.ratingField, isDesktop])

  const columns = useSelectedFields({
    resource: 'album',
    columns: toggleableFields,
    defaultOff: ['createdAt', 'size', 'mood'],
  })

  const { resource, basePath, currentSort, setSort, filterValues } =
    useListContext()
  const { ids, data, loadMore, hasMore, loadingMore, total } =
    useInfiniteListController({
      resource,
      sort: currentSort,
      filter: filterValues,
    })

  const fields = [
    <CoverArtAvatar
      key="cover"
      source="id"
      variant="square"
      sortable={false}
    />,
    <TextField key="name" source="name" />,
    ...columns,
    <AlbumContextMenu
      key="ctx"
      source="starred_at"
      sortByOrder="DESC"
      sortable={config.enableFavourites}
      className={classes.contextMenu}
      label={
        config.enableFavourites && (
          <FavoriteBorderIcon fontSize="small" className={classes.columnIcon} />
        )
      }
    />,
  ]

  return isXsmall ? (
    <SimpleList
      primaryText={(r) => r.name}
      secondaryText={(r) => (
        <>
          {r.albumArtist}
          {config.enableStarRating && (
            <>
              <br />
              <RatingField
                record={r}
                sortByOrder={'DESC'}
                source={'rating'}
                resource={'album'}
                size={'small'}
              />
            </>
          )}
        </>
      )}
      tertiaryText={(r) => (
        <>
          <RangeField record={r} source={'year'} sortBy={'max_year'} />
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
        </>
      )}
      leftIcon={(r) => (
        <span style={{ marginRight: '8px' }}>
          <CoverArtAvatar record={r} variant="square" />
        </span>
      )}
      linkType={'show'}
      rightIcon={(r) => <AlbumContextMenu record={r} />}
      {...rest}
    />
  ) : (
    <>
      <InfiniteDatagrid
        resource={resource}
        basePath={basePath}
        rowClick={'show'}
        ids={ids}
        data={data}
        loadMore={loadMore}
        hasMore={hasMore}
        loadingMore={loadingMore}
        total={total}
        currentSort={currentSort}
        setSort={setSort}
        fields={fields}
        rowClassName={(record) =>
          clsx(classes.row, record?.missing && classes.missingRow)
        }
      />
      <InfiniteListFooter
        count={ids.length}
        total={total}
        loadingMore={loadingMore}
        hasMore={hasMore}
      />
    </>
  )
}

export default AlbumTableView
