package artwork

import (
	_ "embed"
	"errors"
	"image"
	"image/color"
	"image/draw"
	"math"
	"strings"
	"sync"

	"golang.org/x/image/font"
	"golang.org/x/image/font/opentype"
	"golang.org/x/image/math/fixed"
	"golang.org/x/image/vector"
)

// quicksandBold is the bold, rounded geometric sans used for the cover label and
// title. Quicksand is licensed under the SIL Open Font License (see fonts/OFL.txt).
//
//go:embed fonts/Quicksand-Bold.ttf
var quicksandBold []byte

// coverStyle describes how a generated playlist cover should look for a given
// playlist type. Different types (regular, smart, radio, ...) map to different
// palette colours and corner labels.
type coverStyle struct {
	Label string      // uppercase corner label, e.g. "PLAYLISTS", "SMART LIST", "RADIO"
	BG    color.Color // background colour from the shared palette
}

// coverOptions is the input to generatePlaylistCover. It is intentionally free of
// any Navidrome model/DB types so the generator can be exercised standalone.
type coverOptions struct {
	Title  string
	Style  coverStyle
	Covers []image.Image // 0..3 already-decoded album covers
}

// Shared palette for generated playlist covers. Add hues here as new playlist types
// gain generated covers (see styleForPlaylist in reader_playlist.go).
var (
	paletteCoral = color.RGBA{R: 255, G: 111, B: 97, A: 255}  // regular playlists
	paletteBlue  = color.RGBA{R: 166, G: 200, B: 232, A: 255} // smart playlists
)

// Render resolution. The artwork resize pipeline downsizes to the requested size,
// so we render large for crisp text and smooth circles.
const coverSize = 1000

// Layout constants (in coverSize pixels).
const (
	coverPadding      = 70  // outer padding for labels/title
	centerCircleR     = 235 // radius of the central (front) album circle
	sideCircleR       = 175 // radius of the two flanking circles
	sideCircleOffsetX = 300 // horizontal offset of side circles from center
	circleBorder      = 8   // border ring thickness around each circle
	circlesCenterY    = 430 // vertical center of the circle cluster
)

// generatePlaylistCover renders a Spotify-"Radio"-style square cover for a playlist:
// a solid coloured background, an uppercase type label in the top-right, up to three
// overlapping circular bordered album covers, and an auto-fitted bold title in the
// bottom-left. It returns the rendered image; the caller PNG-encodes it.
//
// The function is deliberately free of any Navidrome model/DB types (its input is
// [coverOptions]) so it can be unit-tested standalone. Its only inputs are a title,
// a [coverStyle] (label + background), and already-decoded album images. See
// playlist_cover_test.go for a harness that renders samples to disk, and
// styleForPlaylist / fromStyledCover in reader_playlist.go for how it is wired into
// the artwork pipeline.
//
// # Rendering resolution
//
// Everything is drawn at [coverSize] (1000px) regardless of the size the client
// requested. The artwork resize pipeline (reader_resized.go) downsizes the cached
// original to the requested size, so rendering large keeps text crisp and circles
// smooth at any display size. All layout constants below are in coverSize pixels.
//
// # Layout
//
// The cluster of album circles is centred horizontally and sits at a fixed vertical
// band ([circlesCenterY]). The centre circle ([centerCircleR]) is drawn last so it
// sits in front; the two flanking circles ([sideCircleR], offset by
// [sideCircleOffsetX]) are drawn first and are partially occluded. Each circle gets
// a thin border ring ([circleBorder]) in a slightly darker shade of the background,
// drawn just underneath it, which reads as a subtle separator where circles overlap.
// The label and title are inset by [coverPadding] from the edges.
//
// # Cover-count fallbacks
//
// The number of circles adapts to how many album covers are available (drawCircles):
//
//   - 3 or more: centre + left + right (extra covers are ignored).
//   - 2: centre + a single flank.
//   - 1: a single centre circle.
//   - 0: generatePlaylistCover returns an error, so the artwork chain falls through
//     to the album placeholder.
//
// # Text auto-fitting
//
// Both text elements use the embedded Quicksand Bold face ([quicksandBold]) at DPI
// 72, so point size equals pixels. Faces are parsed once and cached per size
// (boldFace). The label is a fixed size, upper-cased, and right-aligned. The title
// (drawTitle) is fitted: it starts at a large size and shrinks until the text fits
// the available width in at most two lines (wrapping on word boundaries via
// wrapText). If it still will not fit at the minimum size, forceWrap greedily packs
// two lines and truncates the last with an ellipsis. Text colour auto-contrasts
// (contrastColor) against the background luminance so any palette hue stays legible.
//
// # Integration & caching
//
// Generated covers are cached on disk keyed by the playlist's UpdatedAt (see
// image_cache.go). Because the key has no code-version component, changing this
// renderer does NOT invalidate already-cached covers — bump the playlist's
// updated_at (or clear the image cache while the server is stopped) to force
// regeneration. See the playlist-testing skill for the operational details.
func generatePlaylistCover(opts coverOptions) (image.Image, error) {
	if len(opts.Covers) == 0 {
		return nil, errors.New("playlist cover: no album covers provided")
	}
	if opts.Style.BG == nil {
		opts.Style.BG = paletteCoral
	}

	dst := image.NewRGBA(image.Rect(0, 0, coverSize, coverSize))
	draw.Draw(dst, dst.Bounds(), image.NewUniform(opts.Style.BG), image.Point{}, draw.Src)

	drawCircles(dst, opts.Covers, opts.Style.BG)

	textColor := contrastColor(opts.Style.BG)
	drawLabel(dst, opts.Style.Label, textColor)
	drawTitle(dst, opts.Title, textColor)

	return dst, nil
}

// --- Circle compositing --------------------------------------------------------

// drawCircles composites the album covers as overlapping circles: the two flanking
// circles are drawn first (behind), the central circle last (on top). Each circle
// gets a thin border ring drawn just underneath it. See generatePlaylistCover for
// the layout constants and the cover-count fallbacks this implements.
func drawCircles(dst draw.Image, covers []image.Image, bg color.Color) {
	cx, cy := coverSize/2, circlesCenterY
	border := borderColor(bg)

	type placement struct {
		img    image.Image
		x, y   int
		radius int
	}

	var order []placement
	switch {
	case len(covers) >= 3:
		order = []placement{
			{covers[1], cx - sideCircleOffsetX, cy, sideCircleR}, // left, behind
			{covers[2], cx + sideCircleOffsetX, cy, sideCircleR}, // right, behind
			{covers[0], cx, cy, centerCircleR},                   // center, front
		}
	case len(covers) == 2:
		order = []placement{
			{covers[1], cx + sideCircleOffsetX/2, cy, sideCircleR}, // one flank
			{covers[0], cx - sideCircleOffsetX/4, cy, centerCircleR},
		}
	default: // exactly 1
		order = []placement{
			{covers[0], cx, cy, centerCircleR},
		}
	}

	for _, p := range order {
		drawFilledCircle(dst, p.x, p.y, p.radius+circleBorder, border)
		drawCircularImage(dst, p.img, p.x, p.y, p.radius)
	}
}

// drawCircularImage center-crops src to a square, scales it to a 2*radius box, and
// composites it onto dst masked by an anti-aliased circle centered at (cx, cy).
func drawCircularImage(dst draw.Image, src image.Image, cx, cy, radius int) {
	d := radius * 2
	square := fillCenter(src, d, d)
	mask := circleMask(d, radius)

	// Position the top-left of the square/mask so its center lands at (cx, cy).
	pt := image.Pt(cx-radius, cy-radius)
	r := image.Rectangle{Min: pt, Max: pt.Add(image.Pt(d, d))}
	draw.DrawMask(dst, r, square, image.Point{}, mask, image.Point{}, draw.Over)
}

// circleMask builds a d x d alpha mask with an anti-aliased filled circle of the
// given radius centered in the box, using the vector rasterizer.
func circleMask(d, radius int) *image.Alpha {
	ras := vector.NewRasterizer(d, d)
	approxCircle(ras, float32(radius), float32(radius), float32(radius))
	mask := image.NewAlpha(image.Rect(0, 0, d, d))
	ras.Draw(mask, mask.Bounds(), image.Opaque, image.Point{})
	return mask
}

// drawFilledCircle rasterizes an anti-aliased filled circle of color c centered at
// (cx, cy) with the given radius directly onto dst.
func drawFilledCircle(dst draw.Image, cx, cy, radius int, c color.Color) {
	d := radius * 2
	mask := circleMask(d, radius)
	pt := image.Pt(cx-radius, cy-radius)
	r := image.Rectangle{Min: pt, Max: pt.Add(image.Pt(d, d))}
	draw.DrawMask(dst, r, image.NewUniform(c), image.Point{}, mask, image.Point{}, draw.Over)
}

// approxCircle traces a circle centered at (cx, cy) onto the rasterizer using four
// cubic bezier arcs (the standard 0.5522847 kappa approximation).
func approxCircle(ras *vector.Rasterizer, cx, cy, r float32) {
	const k = 0.5522847498307936 // 4/3 * (sqrt(2)-1)
	kr := k * r
	ras.MoveTo(cx+r, cy)
	ras.CubeTo(cx+r, cy+kr, cx+kr, cy+r, cx, cy+r)
	ras.CubeTo(cx-kr, cy+r, cx-r, cy+kr, cx-r, cy)
	ras.CubeTo(cx-r, cy-kr, cx-kr, cy-r, cx, cy-r)
	ras.CubeTo(cx+kr, cy-r, cx+r, cy-kr, cx+r, cy)
	ras.ClosePath()
}

// --- Text rendering ---------------------------------------------------------

var (
	boldFontOnce sync.Once
	boldFont     *opentype.Font
	boldFontErr  error

	faceCacheMu sync.Mutex
	faceCache   = map[float64]font.Face{}
)

func parsedBoldFont() (*opentype.Font, error) {
	boldFontOnce.Do(func() {
		boldFont, boldFontErr = opentype.Parse(quicksandBold)
	})
	return boldFont, boldFontErr
}

// boldFace returns a cached font.Face for the given point size (at coverSize DPI 72,
// so points == pixels here).
func boldFace(size float64) (font.Face, error) {
	faceCacheMu.Lock()
	defer faceCacheMu.Unlock()
	if f, ok := faceCache[size]; ok {
		return f, nil
	}
	ft, err := parsedBoldFont()
	if err != nil {
		return nil, err
	}
	face, err := opentype.NewFace(ft, &opentype.FaceOptions{Size: size, DPI: 72, Hinting: font.HintingFull})
	if err != nil {
		return nil, err
	}
	faceCache[size] = face
	return face, nil
}

// drawLabel renders the uppercase type label right-aligned in the top-right corner.
func drawLabel(dst draw.Image, label string, c color.Color) {
	label = strings.ToUpper(strings.TrimSpace(label))
	if label == "" {
		return
	}
	const labelSize = 46
	face, err := boldFace(labelSize)
	if err != nil {
		return
	}
	width := font.MeasureString(face, label).Ceil()
	x := coverSize - coverPadding - width
	y := coverPadding + face.Metrics().Ascent.Ceil()
	drawString(dst, face, label, x, y, c)
}

// drawTitle renders the playlist title bottom-left, auto-fitting the font size to the
// available width and wrapping to at most two lines when needed.
func drawTitle(dst draw.Image, title string, c color.Color) {
	title = strings.TrimSpace(title)
	if title == "" {
		return
	}

	const (
		maxSize   = 96
		minSize   = 40
		maxLines  = 2
		lineSpace = 1.08 // line height multiplier
	)
	maxWidth := coverSize - 2*coverPadding

	// Find the largest size at which the title fits in <= maxLines lines.
	var (
		bestSize  float64 = minSize
		bestLines []string
	)
	for size := float64(maxSize); size >= minSize; size -= 2 {
		face, err := boldFace(size)
		if err != nil {
			return
		}
		lines := wrapText(face, title, maxWidth, maxLines)
		if lines != nil {
			bestSize, bestLines = size, lines
			break
		}
	}
	if bestLines == nil {
		// Doesn't fit even at minSize: hard-wrap at minSize and clamp to maxLines.
		face, err := boldFace(minSize)
		if err != nil {
			return
		}
		bestSize = minSize
		bestLines = forceWrap(face, title, maxWidth, maxLines)
	}

	face, err := boldFace(bestSize)
	if err != nil {
		return
	}
	m := face.Metrics()
	lineHeight := int(float64(m.Ascent.Ceil()+m.Descent.Ceil()) * lineSpace)

	// Anchor the last line's baseline near the bottom padding and stack upward.
	baseY := coverSize - coverPadding - m.Descent.Ceil()
	for i := len(bestLines) - 1; i >= 0; i-- {
		y := baseY - (len(bestLines)-1-i)*lineHeight
		drawString(dst, face, bestLines[i], coverPadding, y, c)
	}
}

// wrapText splits s into at most maxLines lines that each fit within maxWidth.
// Returns nil if it cannot fit within the constraints at this face size.
func wrapText(face font.Face, s string, maxWidth, maxLines int) []string {
	words := strings.Fields(s)
	if len(words) == 0 {
		return nil
	}
	var lines []string
	cur := ""
	for _, w := range words {
		candidate := w
		if cur != "" {
			candidate = cur + " " + w
		}
		if font.MeasureString(face, candidate).Ceil() <= maxWidth {
			cur = candidate
			continue
		}
		// Word doesn't fit on the current line.
		if cur == "" {
			// A single word wider than the line — can't fit at this size.
			return nil
		}
		lines = append(lines, cur)
		cur = w
		if font.MeasureString(face, cur).Ceil() > maxWidth {
			return nil
		}
		if len(lines) >= maxLines {
			return nil
		}
	}
	lines = append(lines, cur)
	if len(lines) > maxLines {
		return nil
	}
	return lines
}

// forceWrap is a last-resort wrap used when the text won't fit cleanly: it greedily
// packs words, truncating with an ellipsis on the final allowed line if needed.
func forceWrap(face font.Face, s string, maxWidth, maxLines int) []string {
	words := strings.Fields(s)
	var lines []string
	cur := ""
	for _, w := range words {
		candidate := w
		if cur != "" {
			candidate = cur + " " + w
		}
		if font.MeasureString(face, candidate).Ceil() <= maxWidth || cur == "" {
			cur = candidate
			continue
		}
		lines = append(lines, cur)
		cur = w
		if len(lines) == maxLines {
			break
		}
	}
	if len(lines) < maxLines {
		lines = append(lines, cur)
	}
	// Truncate the last line with an ellipsis if it overflows.
	last := lines[len(lines)-1]
	if font.MeasureString(face, last).Ceil() > maxWidth {
		for len(last) > 0 && font.MeasureString(face, last+"…").Ceil() > maxWidth {
			last = last[:len(last)-1]
		}
		lines[len(lines)-1] = strings.TrimSpace(last) + "…"
	}
	return lines
}

// drawString draws s with face at the given pen origin (x, baseline y) in color c.
func drawString(dst draw.Image, face font.Face, s string, x, y int, c color.Color) {
	d := &font.Drawer{
		Dst:  dst,
		Src:  image.NewUniform(c),
		Face: face,
		Dot:  fixed.P(x, y),
	}
	d.DrawString(s)
}

// --- Colour helpers ---------------------------------------------------------

// contrastColor returns black or white depending on the luminance of bg, so text
// stays legible on any palette hue.
func contrastColor(bg color.Color) color.Color {
	r, g, b, _ := bg.RGBA()
	// Relative luminance (sRGB approximation), values are 0..65535.
	lum := 0.299*float64(r) + 0.587*float64(g) + 0.114*float64(b)
	if lum > 0.6*65535 {
		return color.RGBA{A: 255} // black on light backgrounds
	}
	return color.RGBA{R: 20, G: 20, B: 20, A: 255}
}

// borderColor returns a slightly darker shade of bg for the circle border ring.
func borderColor(bg color.Color) color.Color {
	r, g, b, a := bg.RGBA()
	const f = 0.82
	return color.RGBA{
		R: uint8(math.Round(float64(r>>8) * f)),
		G: uint8(math.Round(float64(g>>8) * f)),
		B: uint8(math.Round(float64(b>>8) * f)),
		A: uint8(a >> 8),
	}
}
