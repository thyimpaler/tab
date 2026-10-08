# Writes the frames that come from the owner's clip into the global timeline:
#   f0000-f0123  the opening (ring flies, slides on, coral lights at f0087), upscaled to 1920x1080
#   f0124-f0139  shot A stand-in: pull back from the ring close-up to the robot at the left third
# Then render.mjs fills f0140-f0231 (scene.html, shots B and C) and f0232-f1035 (launch.html).
# Usage: python build_frames.py <framesDir>
import sys, os, cv2, numpy as np

OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
SRC = os.environ.get("TAB_OPENING", r"C:/Users/Dell/Downloads/WhatsApp Video 2026-10-08 at 4.33.32 AM.mp4")
W, H = 1920, 1080
BG = np.array([214, 221, 227], np.float32)          # stone sampled from the clip (BGR), #E3DDD6

cap = cv2.VideoCapture(SRC)
frames = []
while True:
    ok, f = cap.read()
    if not ok: break
    frames.append(f)
for i, f in enumerate(frames):
    cv2.imwrite(os.path.join(OUT, f"f{i:04d}.jpg"), cv2.resize(f, (W, H), interpolation=cv2.INTER_LANCZOS4), [cv2.IMWRITE_JPEG_QUALITY, 95])
n0 = len(frames)                                       # 124

wide, close = frames[0].astype(np.float32), frames[-1].astype(np.float32)
sx = wide.shape[1] / 848                               # works for a higher-res source too
crop = wide[:, int(300 * sx):int(560 * sx)]
m = np.ones(crop.shape[:2], np.float32); f36 = int(36 * sx); r = np.linspace(0, 1, f36); m[:, :f36] *= r; m[:, -f36:] *= r[::-1]

def robot(scale):   # same framing as plate.png at .66: centred at 25% width, feet 30px above the bottom
    s = H / wide.shape[0] * scale
    c = cv2.resize(crop, None, fx=s, fy=s, interpolation=cv2.INTER_CUBIC); mm = cv2.resize(m, None, fx=s, fy=s)[..., None]
    can = np.tile(BG, (H, W, 1)); h, w = c.shape[:2]; X = int(W * .25 - w / 2); Y = H - h - 30
    ys, ye, xs, xe = max(0, Y), min(H, Y + h), max(0, X), min(W, X + w)
    cc, mk = c[ys - Y:ye - Y, xs - X:xe - X], mm[ys - Y:ye - Y, xs - X:xe - X]
    can[ys:ye, xs:xe] = cc * mk + can[ys:ye, xs:xe] * (1 - mk)
    return can

ease = lambda t: 1 - (1 - t) ** 4
cl = cv2.resize(close, (W, H), interpolation=cv2.INTER_CUBIC)
for i in range(16):
    if i < 4:
        k = 1 - .08 * ease(i / 4); M = cv2.getRotationMatrix2D((W / 2, H * .55), 0, k)
        img = cv2.GaussianBlur(cv2.warpAffine(cl, M, (W, H), borderMode=cv2.BORDER_REPLICATE), (0, 0), 1 + i * 1.5)
    else:
        u = ease((i - 4) / 11); img = robot(1.25 - .59 * u)
        if i < 8: img = cv2.GaussianBlur(img, (0, 0), (8 - i) * 2)
    cv2.imwrite(os.path.join(OUT, f"f{n0 + i:04d}.jpg"), np.clip(img, 0, 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 95])
print("opening", n0, "frames + shot A 16 frames")
