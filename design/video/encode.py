# Finishes rendered frames into H.264 MP4s: the same film grain and a 3% vignette on every frame,
# so the code-rendered shots sit next to the 3D footage. 24fps, 1920x1080.
# Usage: python encode.py <framesDir>                 (continuation files, old 3-digit frames)
#        python encode.py <framesDir> launch <mix.wav> (full launch film from the global timeline)
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
        p = os.path.join(FR, f"f{f:04d}.jpg")
        yield finish(cv2.imread(p if os.path.exists(p) else p[:-4] + ".png"))

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

if len(sys.argv) > 2 and sys.argv[2] == "launch":
    # full launch film: frames f0000..f(TOTAL-1) from the global timeline, then the sound mix muxed in
    import subprocess, glob
    total = len(glob.glob(os.path.join(FR, "f[0-9][0-9][0-9][0-9].jpg")))
    write("_launch-silent.mp4", frames(0, total - 1))
    wav = sys.argv[3]
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    subprocess.run([ff, "-hide_banner", "-loglevel", "error", "-y", "-i", os.path.join(OUT, "_launch-silent.mp4"), "-i", wav,
                    "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-shortest", "-movflags", "+faststart",
                    os.path.join(OUT, "TAB-launch.mp4")], check=True)
    os.remove(os.path.join(OUT, "_launch-silent.mp4"))
    print("TAB-launch.mp4", total, "frames + audio")
else:
    write("TAB-continuation-A-B-C.mp4", frames(0, 107))
    write("TAB-continuation-B-C.mp4", frames(16, 107))
    write("TAB-preview-with-opening.mp4", itertools.chain(opening(), frames(0, 107)))
