import React, { forwardRef, useEffect, useRef, useState } from 'react'
import { makeStyles } from '@material-ui/core/styles'
import clsx from 'clsx'
import { coverPlaceholderColor } from './coverPlaceholder'

const useStyles = makeStyles((theme) => ({
  container: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    backgroundColor: coverPlaceholderColor(theme),
  },
  img: {
    display: 'block',
    transition: 'opacity 0.3s ease-in-out',
  },
  // Image starts invisible and fades in on load, revealing the neutral
  // placeholder underneath until then.
  loading: {
    opacity: 0,
  },
}))

/**
 * Renders cover art as a native lazy-loaded <img> over a neutral placeholder
 * block. The browser handles progressive (viewport-based) loading and caching;
 * this component only owns the placeholder background, the fade-in, and the
 * load state.
 *
 * The forwarded ref attaches to the container element (e.g. for a drag source).
 * Geometry is left to callers: `className` styles the container (size/shape),
 * `imgClassName` styles the image (object-fit, explicit height).
 */
export const CoverImage = forwardRef(
  ({ src, alt, className, imgClassName, ...imgProps }, ref) => {
    const classes = useStyles()
    const imgRef = useRef(null)
    const [loaded, setLoaded] = useState(false)

    // Aggressively-cached covers can already be `complete` before onLoad is
    // attached, which would otherwise leave the image stuck invisible.
    useEffect(() => {
      setLoaded(false)
      const img = imgRef.current
      if (img && img.complete && img.naturalWidth > 0) {
        setLoaded(true)
      }
    }, [src])

    return (
      <div ref={ref} className={clsx(classes.container, className)}>
        <img
          ref={imgRef}
          src={src || undefined}
          alt={alt}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          className={clsx(classes.img, imgClassName, !loaded && classes.loading)}
          {...imgProps}
        />
      </div>
    )
  },
)

CoverImage.displayName = 'CoverImage'
