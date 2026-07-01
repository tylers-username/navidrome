package artwork

import (
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"testing"
)

// sampleOutputDir returns where the harness writes its PNGs. By default it uses a
// per-test temp dir (auto-cleaned); set PLAYLIST_COVER_OUT to a stable path to keep
// the rendered samples around for eyeballing.
func sampleOutputDir(t *testing.T) string {
	if dir := os.Getenv("PLAYLIST_COVER_OUT"); dir != "" {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("mkdir PLAYLIST_COVER_OUT: %v", err)
		}
		return dir
	}
	return t.TempDir()
}

// palette used while iterating on the look, standalone from the model layer.
var (
	coral = color.RGBA{R: 255, G: 111, B: 97, A: 255}  // regular playlists
	blue  = color.RGBA{R: 166, G: 200, B: 232, A: 255} // smart lists
	green = color.RGBA{R: 122, G: 197, B: 140, A: 255} // radio (future)
)

// solidCover synthesizes a simple square placeholder album cover with a diagonal
// two-tone split so the circular crop is obviously visible.
func solidCover(size int, a, b color.RGBA) image.Image {
	img := image.NewRGBA(image.Rect(0, 0, size, size))
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			if x+y < size {
				img.Set(x, y, a)
			} else {
				img.Set(x, y, b)
			}
		}
	}
	return img
}

// loadCovers loads up to n album images from PLAYLIST_COVER_SAMPLE_DIR if set,
// otherwise returns synthesized placeholders.
func loadCovers(n int) []image.Image {
	dir := os.Getenv("PLAYLIST_COVER_SAMPLE_DIR")
	var out []image.Image
	if dir != "" {
		entries, _ := os.ReadDir(dir)
		for _, e := range entries {
			if e.IsDir() {
				continue
			}
			f, err := os.Open(filepath.Join(dir, e.Name()))
			if err != nil {
				continue
			}
			img, _, err := image.Decode(f)
			_ = f.Close()
			if err == nil {
				out = append(out, img)
			}
			if len(out) >= n {
				break
			}
		}
	}
	tones := [][2]color.RGBA{
		{{R: 90, G: 60, B: 120, A: 255}, {R: 200, G: 90, B: 150, A: 255}},
		{{R: 40, G: 40, B: 50, A: 255}, {R: 120, G: 130, B: 140, A: 255}},
		{{R: 60, G: 120, B: 90, A: 255}, {R: 160, G: 200, B: 120, A: 255}},
	}
	for i := len(out); i < n; i++ {
		t := tones[i%len(tones)]
		out = append(out, solidCover(500, t[0], t[1]))
	}
	return out[:n]
}

func TestGeneratePlaylistCover_Samples(t *testing.T) {
	outDir := sampleOutputDir(t)

	cases := []struct {
		name   string
		title  string
		style  coverStyle
		nCover int
	}{
		{"regular_short", "Flux Pavilion", coverStyle{Label: "PLAYLISTS", BG: coral}, 3},
		{"regular_long_word", "Supercalifragilistic", coverStyle{Label: "PLAYLISTS", BG: coral}, 3},
		{"smart_twoline", "Manchester Orchestra", coverStyle{Label: "SMART LIST", BG: blue}, 3},
		{"smart_verylong", "My Favourite Chill Evening Acoustic Songs", coverStyle{Label: "SMART LIST", BG: blue}, 3},
		{"radio_two_covers", "City and Colour", coverStyle{Label: "RADIO", BG: green}, 2},
		{"radio_one_cover", "Bryson Tiller", coverStyle{Label: "RADIO", BG: green}, 1},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			img, err := generatePlaylistCover(coverOptions{
				Title:  tc.title,
				Style:  tc.style,
				Covers: loadCovers(tc.nCover),
			})
			if err != nil {
				t.Fatalf("generate: %v", err)
			}
			if b := img.Bounds(); b.Dx() != coverSize || b.Dy() != coverSize {
				t.Fatalf("unexpected cover size: got %dx%d, want %dx%d", b.Dx(), b.Dy(), coverSize, coverSize)
			}
			out := filepath.Join(outDir, "cover_"+tc.name+".png")
			f, err := os.Create(out)
			if err != nil {
				t.Fatalf("create: %v", err)
			}
			defer f.Close()
			if err := png.Encode(f, img); err != nil {
				t.Fatalf("encode: %v", err)
			}
			t.Logf("wrote %s", out)
		})
	}
}
