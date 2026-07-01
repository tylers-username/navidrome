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

const artistCard = (translate) => (record) => (
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

const songCard = (dispatch) => (record) => (
  <HomeCard
    key={record.id}
    record={record}
    title={record.title}
    subtitle={record.artist}
    variant="square"
    onClick={() => dispatch(playTracks({ [record.id]: record }, [record.id]))}
    overlay={<SongContextMenu record={record} />}
  />
)

const STARRED_ARTISTS =
  '/artist?filter=%7B%22starred%22%3Atrue%7D&sort=starred_at&order=DESC'
const RECENT_ARTISTS =
  '/artist?filter=%7B%22recently_played%22%3Atrue%7D&sort=play_date&order=DESC'
const RECENT_SONGS =
  '/song?filter=%7B%22recently_played%22%3Atrue%7D&sort=play_date&order=DESC'

const Home = () => {
  const translate = useTranslate()
  const dispatch = useDispatch()
  const renderArtist = artistCard(translate)
  const renderSong = songCard(dispatch)

  return (
    <>
      <Title title="Navidrome" />
      <Shelf
        title={translate('home.recentlyAdded', { _: 'Recently Added' })}
        showAllLink="/album/recentlyAdded"
        resource="album"
        sort={{ field: 'recently_added', order: 'DESC' }}
        filter={{}}
        renderCard={albumCard}
      />
      <Shelf
        title={translate('home.recentlyPlayed', { _: 'Recently Played' })}
        showAllLink="/album/recentlyPlayed"
        resource="album"
        sort={{ field: 'play_date', order: 'DESC' }}
        filter={{ recently_played: true }}
        renderCard={albumCard}
      />
      {config.enableFavourites && (
        <Shelf
          title={translate('home.favoriteArtists', {
            _: 'Your favorite artists',
          })}
          showAllLink={STARRED_ARTISTS}
          resource="artist"
          sort={{ field: 'starred_at', order: 'DESC' }}
          filter={{ starred: true }}
          renderCard={renderArtist}
        />
      )}
      {config.enableFavourites && (
        <Shelf
          title={translate('home.favoriteAlbums', {
            _: 'Your favorite albums',
          })}
          showAllLink="/album/starred"
          resource="album"
          sort={{ field: 'starred_at', order: 'DESC' }}
          filter={{ starred: true }}
          renderCard={albumCard}
        />
      )}
      <Shelf
        title={translate('home.recentArtists', { _: 'Recent artists' })}
        showAllLink={RECENT_ARTISTS}
        resource="artist"
        sort={{ field: 'play_date', order: 'DESC' }}
        filter={{ recently_played: true }}
        renderCard={renderArtist}
      />
      <Shelf
        title={translate('home.recentSongs', { _: 'Recent songs' })}
        showAllLink={RECENT_SONGS}
        resource="song"
        sort={{ field: 'play_date', order: 'DESC' }}
        filter={{ recently_played: true }}
        renderCard={renderSong}
      />
      <Shelf
        title={translate('home.recentPlaylists', { _: 'Recent playlists' })}
        showAllLink="/playlist"
        resource="playlist"
        sort={{ field: 'updatedAt', order: 'DESC' }}
        filter={{}}
        renderCard={playlistCard}
      />
    </>
  )
}

export default Home
