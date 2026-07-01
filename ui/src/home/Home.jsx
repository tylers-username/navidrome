import React from 'react'
import { Title, useTranslate, linkToRecord } from 'react-admin'
import { useDispatch } from 'react-redux'
import { Shelf } from './Shelf'
import { HomeCard } from './HomeCard'
import {
  PlayButton,
  AlbumContextMenu,
  ArtistContextMenu,
  SongContextMenu,
} from '../common'
import { playTracks } from '../actions'
import config from '../config'

const albumCard = (record) => (
  <HomeCard
    key={record.id}
    record={record}
    title={record.name}
    subtitle={record.albumArtist}
    variant="square"
    to={linkToRecord('/album', record.id, 'show')}
    overlay={
      <>
        <PlayButton record={record} size="small" />
        <AlbumContextMenu record={record} color="white" />
      </>
    }
  />
)

const artistCard = (translate) =>
  function ArtistCard(record) {
    return (
      <HomeCard
        key={record.id}
        record={record}
        title={record.name}
        subtitle={translate('home.typeArtist', { _: 'Artist' })}
        variant="circle"
        to={linkToRecord('/artist', record.id, 'show')}
        overlay={<ArtistContextMenu record={record} color="white" />}
      />
    )
  }

const playlistCard = (record) => (
  <HomeCard
    key={record.id}
    record={record}
    title={record.name}
    subtitle={record.ownerName}
    variant="square"
    to={linkToRecord('/playlist', record.id, 'show')}
  />
)

const songCard = (dispatch) =>
  function SongCard(record) {
    return (
      <HomeCard
        key={record.id}
        record={record}
        title={record.title}
        subtitle={record.artist}
        variant="square"
        onClick={() =>
          dispatch(playTracks({ [record.id]: record }, [record.id]))
        }
        overlay={<SongContextMenu record={record} />}
      />
    )
  }

// Build a react-admin list route with an encoded filter + sort, for resources
// that have no dedicated named list route the way albums do (/album/starred,
// /album/mostPlayed, ...). Derived from the same filter/sort the shelf uses so
// the "Show all" link can't drift from what the shelf displays.
const listLink = (resource, filter, sort) =>
  `/${resource}?filter=${encodeURIComponent(JSON.stringify(filter))}` +
  `&sort=${sort.field}&order=${sort.order}`

const Home = () => {
  const translate = useTranslate()
  const dispatch = useDispatch()
  const renderArtist = artistCard(translate)
  const renderSong = songCard(dispatch)

  const starredSort = { field: 'starred_at', order: 'DESC' }
  const recentSort = { field: 'play_date', order: 'DESC' }

  // Favorites and most-played on top, then recents. Favorites entries are
  // gated by config.enableFavourites and filtered out below when disabled.
  const shelves = [
    config.enableFavourites && {
      title: translate('home.favoriteArtists', { _: 'Favorite artists' }),
      showAllLink: listLink('artist', { starred: true }, starredSort),
      resource: 'artist',
      sort: starredSort,
      filter: { starred: true },
      renderCard: renderArtist,
    },
    config.enableFavourites && {
      title: translate('home.favoriteAlbums', { _: 'Favorite albums' }),
      showAllLink: '/album/starred',
      resource: 'album',
      sort: starredSort,
      filter: { starred: true },
      renderCard: albumCard,
    },
    config.enableFavourites && {
      title: translate('home.favoriteSongs', { _: 'Favorite songs' }),
      showAllLink: listLink('song', { starred: true }, starredSort),
      resource: 'song',
      sort: starredSort,
      filter: { starred: true },
      renderCard: renderSong,
    },
    {
      title: translate('home.mostPlayed', { _: 'Most played' }),
      showAllLink: '/album/mostPlayed',
      resource: 'album',
      sort: { field: 'play_count', order: 'DESC' },
      filter: { recently_played: true },
      renderCard: albumCard,
    },
    {
      title: translate('home.recentlyAdded', { _: 'Recently Added' }),
      showAllLink: '/album/recentlyAdded',
      resource: 'album',
      sort: { field: 'recently_added', order: 'DESC' },
      filter: {},
      renderCard: albumCard,
    },
    {
      title: translate('home.recentlyPlayed', { _: 'Recently Played' }),
      showAllLink: '/album/recentlyPlayed',
      resource: 'album',
      sort: recentSort,
      filter: { recently_played: true },
      renderCard: albumCard,
    },
    {
      title: translate('home.recentArtists', { _: 'Recent artists' }),
      showAllLink: listLink('artist', { recently_played: true }, recentSort),
      resource: 'artist',
      sort: recentSort,
      filter: { recently_played: true },
      renderCard: renderArtist,
    },
    {
      title: translate('home.recentSongs', { _: 'Recent songs' }),
      showAllLink: listLink('song', { recently_played: true }, recentSort),
      resource: 'song',
      sort: recentSort,
      filter: { recently_played: true },
      renderCard: renderSong,
    },
    {
      title: translate('home.recentPlaylists', { _: 'Recent playlists' }),
      showAllLink: '/playlist',
      resource: 'playlist',
      sort: { field: 'updatedAt', order: 'DESC' },
      filter: {},
      renderCard: playlistCard,
    },
  ].filter(Boolean)

  return (
    <>
      <Title title="Navidrome" />
      {shelves.map((shelf) => (
        <Shelf key={shelf.title} {...shelf} />
      ))}
    </>
  )
}

export default Home
