# Finishes rendered frames into H.264 MP4s: the same film grain and a 3% vignette on every frame,
# so the code-rendered shots sit next to the 3D footage. 24fps, 1920x1080.
# Usage: python encode.py <framesDir>
import sys, os, itertools, numpy as np, cv2, imageio_ffmpeg

FR = sys.argv[1]
OUT = os.path.dirname(os.path.abspath(__file__))
SRC = r"C:/Users/Dell/Downloads/WhatsApp Video 2026-10-08 at 4.33.32 AM.mp4"
W, H, FPS = 1920, 1080, 24

yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
r2 = ((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2
vignette = (1 - 0.03 * r2)[..., None]
rng = np.random.default_rng(7)

def finish(bgr):
    img = bgr.astype(np.float32) * vignette
    grain = rng.normal(0, 2.6, (H // 2, W // 2)).astype(np.float32)
    grain = cv2.resize(grain, (W, H), interpolation=cv2.INTER_LINEAR)[..., None]   # slightly soft, film-like grain
    return np.clip(img + grain, 0, 255).astype(np.uint8)

def frames(a, b):
    for f in range(a, b + 1):
        yield finish(cv2.imread(os.path.join(FR, f"f{f:03d}.png")))

def write(name, gen):
    path = os.path.join(OUT, name)
    w = imageio_ffmpeg.write_frames(path, (W, H), fps=FPS, codec="libx264", quality=None, macro_block_size=1, pix_fmt_out="yuv420p",
                                    output_params=["-crf", "17", "-preset", "slow", "-movflags", "+faststart"])
    w.send(None)
    n = 0
    for im in gen:
        w.send(cv2.cvtColor(im, cv2.COLOR_BGR2RGB).tobytes()); n += 1
    w.close()
    print(name, n, "frames")

def opening():
    cap = cv2.VideoCapture(SRC)
    while True:
        ok, f = cap.read()
        if not ok: break
        yield cv2.resize(f, (W, H), interpolation=cv2.INTER_CUBIC)   # owner's clip, upscaled for the pacing preview only

write("TAB-continuation-A-B-C.mp4", frames(0, 107))
write("TAB-continuation-B-C.mp4", frames(16, 107))
write("TAB-preview-with-opening.mp4", itertools.chain(opening(), frames(0, 107)))
