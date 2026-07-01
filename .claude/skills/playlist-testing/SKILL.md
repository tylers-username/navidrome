---
name: playlist-testing
description: Inspect and create Navidrome playlists (regular and smart) for local developer testing — query playlist info from the SQLite DB, create/update playlists and add tracks via the Subsonic API, make a playlist "smart", find media_file/album IDs, and force playlist cover art to regenerate. Use when testing anything involving playlists or playlist cover art in this repo.
---

# Playlist testing

Practical recipes for exercising playlists against a locally running dev server
(`make dev`). Verified against this repo's schema and endpoints.

## Environment quick reference

| Thing | Value |
|---|---|
| Server URL | `http://localhost:4533` |
| SQLite DB | `<DataFolder>/navidrome.db` — here `data/navidrome.db` |
| Image cache | `<CacheFolder>/images` — here `data/cache/images` |
| Admin user | username `admin`, id `zhCrphFEz637H13Fl8ArD1` (verify with query below) |
| Subsonic REST | `http://localhost:4533/rest/<method>?...` |

Always confirm IDs against the live DB — they differ per install:
```bash
sqlite3 data/navidrome.db "SELECT id, user_name, is_admin FROM user;"
```

> The DB is held open (WAL) by the running server. Single `SELECT`/`UPDATE`
> statements via `sqlite3` are fine. **Never delete cache files while the server
> is running** — `djherbis/fscache` keeps an in-memory index and reads of
> deleted files fail with "no such file or directory". To clear cache: stop the
> server → delete → start. See "Force cover art to regenerate" for the safe path.

## Inspecting playlists (read-only SQL)

```bash
# List all playlists; is_smart = has rules
sqlite3 data/navidrome.db "SELECT id, name,
  CASE WHEN rules IS NOT NULL AND rules!='' THEN 'smart' ELSE 'regular' END AS type,
  song_count, owner_id, updated_at FROM playlist;"

# A playlist's rules (smart playlists only)
sqlite3 data/navidrome.db "SELECT rules FROM playlist WHERE id='<PLAYLIST_ID>';"

# A playlist's tracks in order (playlist_tracks.id is the 1-based position)
sqlite3 data/navidrome.db "SELECT pt.id AS pos, mf.title, mf.album, mf.album_id
  FROM playlist_tracks pt JOIN media_file mf ON mf.id = pt.media_file_id
  WHERE pt.playlist_id='<PLAYLIST_ID>' ORDER BY pt.id;"

# Distinct album IDs behind a playlist (what the styled cover samples)
sqlite3 data/navidrome.db "SELECT DISTINCT mf.album_id, al.name
  FROM playlist_tracks pt JOIN media_file mf ON mf.id = pt.media_file_id
  JOIN album al ON al.id = mf.album_id WHERE pt.playlist_id='<PLAYLIST_ID>';"
```

Find `media_file` IDs to populate playlists:
```bash
sqlite3 data/navidrome.db "SELECT id, title, album FROM media_file LIMIT 20;"
```

## Authenticating to the Subsonic API

Subsonic uses token auth: `t = md5(password + salt)`, with `s` = your chosen
salt (`server/subsonic/middlewares.go`). The easiest, most reliable way to get
working credentials in dev:

**Copy `u`, `t`, `s` from the browser.** Open the web UI (logged in as admin),
DevTools → Network, click any `getCoverArt`/`getPlaylists` request, and copy its
`u`, `t`, `s` query params. Reuse them for your own requests.

Define them once for a shell session:
```bash
AUTH="u=admin&t=<TOKEN>&s=<SALT>&v=1.16.1&c=devtest&f=json"
BASE="http://localhost:4533/rest"
```

## Creating & updating playlists (Subsonic API)

```bash
# Create a regular playlist with initial songs (repeat songId per track)
curl -s "$BASE/createPlaylist?$AUTH&name=Test%20Playlist&songId=<MF_ID1>&songId=<MF_ID2>" | jq .

# Add tracks to an existing playlist
curl -s "$BASE/updatePlaylist?$AUTH&playlistId=<PLAYLIST_ID>&songIdToAdd=<MF_ID>" | jq .

# Remove the track at position index 0, rename, set public
curl -s "$BASE/updatePlaylist?$AUTH&playlistId=<PLAYLIST_ID>&songIndexToRemove=0&name=Renamed&public=true" | jq .

# Read back
curl -s "$BASE/getPlaylists?$AUTH" | jq '.["subsonic-response"].playlists'
curl -s "$BASE/getPlaylist?$AUTH&id=<PLAYLIST_ID>" | jq '.["subsonic-response"].playlist'

# Delete
curl -s "$BASE/deletePlaylist?$AUTH&id=<PLAYLIST_ID>" | jq .
```
Relevant handlers: `server/subsonic/playlists.go`.

## Making a playlist "smart"

A playlist is smart when its `rules` (a `criteria.Criteria`) is non-empty
(`model.Playlist.IsSmartPlaylist`). This is what drives the `SMART LIST` styled
cover vs `PLAYLIST`.

**Proper way — import a `.nsp` file.** Set `ND_PLAYLISTSPATH` (default empty) to
a folder, drop a `.nsp` there, and it's imported on scan. Format
(`tests/fixtures/playlists/recently_played.nsp`, parsed by
`core/playlists/parse_nsp.go`):
```jsonc
{
  "name": "Recently Played",
  "comment": "Recently played tracks",
  "all": [ {"inTheLast": {"lastPlayed": 30}} ],
  "sort": "lastPlayed", "order": "desc", "limit": 100
}
```

**Quick shortcut — flip an existing playlist to smart via SQL** (handy to see the
`SMART LIST` cover without setting up import). The `rules` column stores only the
criteria part (top-level keys: `all` | `any`, `sort`, `order`, `limit`;
operators in `model/criteria/operators.go`):
```bash
sqlite3 data/navidrome.db "UPDATE playlist
  SET rules='{\"all\":[{\"contains\":{\"title\":\"a\"}}],\"sort\":\"title\",\"order\":\"asc\",\"limit\":100}',
      updated_at=strftime('%Y-%m-%d %H:%M:%f','now')
  WHERE id='<PLAYLIST_ID>';"
```
The smart-playlist repository re-evaluates rules and repopulates tracks on next
access (`persistence/smart_playlist_repository.go`). Revert with
`UPDATE playlist SET rules=NULL WHERE id='<PLAYLIST_ID>';`.

## Playlist cover art

Covers are served by the Subsonic `getCoverArt` endpoint with a `pl-` prefixed
ID. Every playlist gets a generated **styled** cover (coral `PLAYLIST` /
blue `SMART LIST`) unless it has an uploaded/sidecar/external image. Generator:
`core/artwork/playlist_cover.go`; routing: `core/artwork/reader_playlist.go`.

```bash
# Fetch a cover server-side (bypasses browser cache); pl- prefix + size + square
curl -s -o /tmp/cover.png \
  "$BASE/getCoverArt?$AUTH&id=pl-<PLAYLIST_ID>&size=600&square=true"
file /tmp/cover.png   # -> PNG image data, 600 x 600
```

### Force cover art to regenerate

The cover cache key is `pl-<id>.<updatedAtMillis>.<size>[.square]`
(`core/artwork/image_cache.go` + `reader_resized.go`) — it has **no code
version**. After changing generator code, existing covers won't refresh until
either the cache misses or `updated_at` changes. Responses also carry a 10-year
`Cache-Control`, and the UI cache-busts the URL with `_=<updatedAt>`, so the
browser won't refetch until `updated_at` changes.

**Bump `updated_at` — the one lever that fixes both server and client:**
```bash
# One playlist
sqlite3 data/navidrome.db "UPDATE playlist SET updated_at=strftime('%Y-%m-%d %H:%M:%f','now') WHERE id='<PLAYLIST_ID>';"
# All playlists (e.g. after a generator change) — then just reload the UI
sqlite3 data/navidrome.db "UPDATE playlist SET updated_at=strftime('%Y-%m-%d %H:%M:%f','now');"
```
This changes the server cache key (→ regenerate with current code) **and** the
client URL's `_` param (→ browser refetches on a normal reload, no hard refresh).

Alternative for a full reset: **stop the server**, `rm -rf data/cache/images/*`
(keep the `.nd-migrated` marker), **start** it. Clearing while running corrupts
the fscache index (see warning above).

## Iterating on the cover generator without the app

The generator is pure and has a sample harness that writes PNGs to the scratchpad
for eyeballing — no DB/server needed:
```bash
go test ./core/artwork/ -run TestGeneratePlaylistCover_Samples -v
# Point it at real album art instead of synthesized placeholders:
PLAYLIST_COVER_SAMPLE_DIR=/path/to/album/covers \
  go test ./core/artwork/ -run TestGeneratePlaylistCover_Samples -v
```

Run the artwork test suites (these need build tags for sqlite FTS5):
```bash
go test -tags "netgo sqlite_fts5" ./core/artwork/...
```
