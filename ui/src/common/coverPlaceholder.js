// Theme-aware neutral fill shown behind cover art while it loads (and behind
// transparent art). Shared so bare-<img> covers (CoverImage) and Avatar covers
// (CoverArtAvatar) use one placeholder shade.
export const coverPlaceholderColor = (theme) =>
  theme.palette.type === 'dark' ? '#333' : '#eee'
