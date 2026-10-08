# Sound for the TAB launch film, built from scratch and locked to picture frames (24fps).
# Foley: dry clicks, glass ticks, a metal clack, air passes, a dial ratchet, a paper slide, soft thuds.
# Score (temp): a quiet pad that enters at the logo reveal, chords changing on scene cuts, a soft
# 120bpm pulse under "how it works", resolving on the end card. Replace with a licensed track if wanted.
# Usage: python audio.py <out.wav> [totalFrames=1036]
import sys, wave, numpy as np

OUT = sys.argv[1]; TOTAL = int(sys.argv[2]) if len(sys.argv) > 2 else 1036
SR, FPS = 48000, 24
N = int(TOTAL / FPS * SR) + SR // 2
L = np.zeros(N); R = np.zeros(N)
rng = np.random.default_rng(11)
T = lambda f: f / FPS                                   # frame → seconds

def lowpass(x, fc):                                      # FFT brick-ish lowpass with a soft knee
    X = np.fft.rfft(x); fr = np.fft.rfftfreq(len(x), 1 / SR)
    X *= 1 / np.sqrt(1 + (fr / fc) ** 4); return np.fft.irfft(X, len(x))
def bandpass(x, lo, hi):
    X = np.fft.rfft(x); fr = np.fft.rfftfreq(len(x), 1 / SR)
    X *= (1 / np.sqrt(1 + (fr / hi) ** 4)) * (1 / np.sqrt(1 + (lo / np.maximum(fr, 1)) ** 4)); return np.fft.irfft(X, len(x))
def place(sig, t, gain=1.0, pan=0.0):
    i = int(t * SR); sig = sig[: max(0, N - i)]
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    L[i:i + len(sig)] += sig * gain * l * 1.414; R[i:i + len(sig)] += sig * gain * r * 1.414
def env(n, tau): return np.exp(-np.arange(n) / (tau * SR))
def tt(dur): return np.arange(int(dur * SR)) / SR

# ---------- foley ----------
def click(bright=1.0):          # dry Mac trackpad click
    n = int(.03 * SR); nz = rng.normal(0, 1, n) * env(n, .0009)
    s = bandpass(nz, 1800, 9000 * bright) * 1.6
    s += np.sin(2 * np.pi * 190 * tt(.03)) * env(n, .008) * .35
    return s
def tick(freq=5200, g=1.0):      # near-silent tick
    n = int(.02 * SR); return (np.sin(2 * np.pi * freq * tt(.02)) * env(n, .0025) + rng.normal(0, .3, n) * env(n, .0006)) * g
def glass():                     # small glass tick: inharmonic partials, fast decay
    d = .35; t = tt(d); s = np.zeros(len(t))
    for f, a, tau in [(2930, 1, .09), (4470, .6, .06), (6210, .3, .04), (8340, .15, .025)]:
        s += a * np.sin(2 * np.pi * f * t + rng.uniform(0, 6)) * np.exp(-t / tau)
    s += bandpass(rng.normal(0, 1, len(t)) * np.exp(-t / .001), 3000, 12000) * .5
    return s * .5
def clack():                     # the metal clack (ring seats / "fixed" lands)
    d = .5; t = tt(d); s = bandpass(rng.normal(0, 1, len(t)) * np.exp(-t / .005), 1500, 7000) * 1.2
    for f, a, tau in [(1180, 1, .12), (2630, .7, .09), (3870, .45, .07), (5210, .3, .05)]:
        s += a * .45 * np.sin(2 * np.pi * f * t) * np.exp(-t / tau)
    s += np.sin(2 * np.pi * 92 * t) * np.exp(-t / .028) * .9
    return s
def thud(f0=120):                # muted, felt-damped stop
    d = .3; t = tt(d); fr = f0 * (1 - .25 * (1 - np.exp(-t / .05)))
    s = np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-t / .06)
    s += lowpass(rng.normal(0, 1, len(t)) * np.exp(-t / .012), 700) * .6
    return s
def low():                       # soft low bloom for the logo
    d = 1.2; t = tt(d); return np.sin(2 * np.pi * 68 * t) * (1 - np.exp(-t / .01)) * np.exp(-t / .35) * .9
def air(dur, rise=True, lo=300, hi=5000):  # air pass / whoosh, filtered noise with a swelling envelope
    t = tt(dur); n = len(t); nz = rng.normal(0, 1, n)
    out = np.zeros(n); segs = 24
    for k in range(segs):            # time-varying band, done in short overlapping segments
        a, b = int(k * n / segs), int((k + 1) * n / segs); u = (k + .5) / segs
        fc = lo + (hi - lo) * (u if rise else 1 - u)
        seg = bandpass(nz[max(0, a - 400):b + 400], fc * .5, fc * 1.6)[(a - max(0, a - 400)):(a - max(0, a - 400)) + (b - a)]
        out[a:b] = seg
    e = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 1.6
    return out * e * .6
def paper(dur=.7):
    t = tt(dur); s = bandpass(rng.normal(0, 1, len(t)), 900, 5200) * (np.sin(np.pi * t / dur) ** 2) * .35
    s *= 1 + .5 * np.sin(2 * np.pi * 31 * t); return s

# ---------- events (global frames) ----------
# opening (owner's clip): ring flies past, cut to the hand, slides on, seats + coral on f87
place(air(.9, True, 400, 6000), T(0), .55, -.4)
place(air(.6, False, 300, 3000), T(9), .25, .2)
place(air(.8, True, 250, 2500), T(27), .22, 0)
place(air(.5, True, 300, 4000), T(58), .25, 0)
place(click(.7), T(86), .55); place(clack(), T(87), .6)
place(glass(), T(88), .25, .1)
# continuation: pull back, capsule, click, refused, words, "fixed"
place(air(.55, False, 250, 2200), T(124), .3)
place(glass(), T(140), .55)
place(click(), T(160), .8, .25)
place(thud(130), T(164), .7)
for k, f in enumerate([172, 175, 178, 181, 184, 187]): place(tick(4800 + 120 * k, .5), T(f), .35, -.5 + k * .2)
place(clack(), T(214), .85)
# launch: reveal
place(low(), T(232), .7); place(glass(), T(232), .35)
place(air(.5, True, 600, 5000), T(244), .14, .3)
# 01 dial: ratchet detents as the knob turns (local f14-62 in scene L, scene starts at 316)
def bez(x1, y1, x2, y2):
    def f(t):
        u = t
        for _ in range(12):
            x = 3*(1-u)**2*u*x1 + 3*(1-u)*u*u*x2 + u**3 - t; dx = 3*(1-u)**2*x1 + 6*(1-u)*u*(x2-x1) + 3*u*u*(1-x2)
            if abs(dx) < 1e-6: break
            u = min(1, max(0, u - x / dx))
        return 3*(1-u)**2*u*y1 + 3*(1-u)*u*u*y2 + u**3
    return f
mech = bez(.7, 0, .2, 1)
last = 0
for s in range(0, 48 * 20):          # sub-frame sampling
    lf = 14 + s / 20; tv = .62 * mech(min(1, (lf - 14) / 48)); det = int(tv * 72)
    if det > last:
        last = det; place(tick(3400, .9), T(316 + lf), .5, .25)
place(click(.8), T(316 + 62), .7, .25)
place(tick(5000), T(316 + 70), .4, -.3); place(tick(5300), T(316 + 80), .4, -.3)
# 02 key: the ticket slides up and lands
place(paper(.75), T(436 + 6), .9, .2); place(thud(170), T(436 + 26), .35, .2)
# 03 pays: glass in, absorbed (tick), the refused one stops
for f0 in [10, 28, 46, 96]:
    place(glass(), T(508 + f0), .3, .55); place(tick(2600, 1), T(508 + f0 + 27), .5, .2); place(click(.6), T(508 + f0 + 27), .25, .2)
place(glass(), T(508 + 66), .3, .6); place(thud(125), T(508 + 66 + 22), .7, .5)
# 04 checks
for i, f in enumerate([682, 689, 696, 703, 710]): place(click(.9), T(f), .45, .3); place(tick(4200 + 200 * i, .6), T(f), .3, .3)
# non-custodial: the owner clicks Revoke, the balance goes home
place(click(), T(784), .8, .35); place(air(.7, False, 300, 4000), T(790), .3, -.2); place(clack(), T(804), .55, .3)
# price lands, end card
place(low(), T(844), .55); place(click(.7), T(844), .35)
place(clack(), T(916), .75); place(low(), T(916), .6)

# ---------- temp score ----------
NOTE = lambda name: 440 * 2 ** ((name - 69) / 12)
CHORDS = {   # midi notes, voiced low and open
    "Dmaj9": [38, 50, 54, 57, 61, 64], "Bm9": [35, 47, 50, 54, 57, 61], "Gmaj9": [31, 43, 47, 50, 54, 57],
    "Asus2": [33, 45, 47, 52, 57, 59], "D": [38, 50, 57, 62, 66, 69],
}
PLAN = [("Dmaj9", 232, 316), ("Bm9", 316, 436), ("Gmaj9", 436, 508), ("Dmaj9", 508, 652), ("Bm9", 652, 736),
        ("Gmaj9", 736, 844), ("Asus2", 844, 916), ("D", 916, TOTAL + 12)]
padL = np.zeros(N); padR = np.zeros(N)
for name, a, b in PLAN:
    t0, t1 = T(a), T(b); i0 = int(t0 * SR); n = int((t1 - t0 + 1.2) * SR); t = np.arange(n) / SR
    att = .5 if name != "D" else 1.2
    e = np.clip(t / att, 0, 1) * np.clip((t1 - t0 + 1.2 - t) / 1.2, 0, 1)
    for k, m in enumerate(CHORDS[name]):
        f = NOTE(m); amp = (.5 if m < 45 else .32) / (1 + .15 * k)
        for side, det in ((padL, -3), (padR, 3)):
            ff = f * 2 ** (det / 1200)
            v = np.sin(2 * np.pi * ff * t) + .3 * np.sin(4 * np.pi * ff * t) + .1 * np.sin(6 * np.pi * ff * t)
            v *= 1 + .08 * np.sin(2 * np.pi * (.17 + .03 * k) * t)       # slow movement
            side[i0:i0 + n] += (v * amp * e)[: max(0, N - i0)]
padL = lowpass(padL, 1500); padR = lowpass(padR, 1500)
# soft pulse: 120bpm eighth-note ticks + a sub on each beat, only under "how it works" (scenes 01-04)
pulse = np.zeros(N)
beat = .5
for k in range(int((T(736) - T(316)) / (beat / 2))):
    t = T(316) + k * beat / 2
    hi = tick(6200, .5 if k % 2 else .8); i = int(t * SR); pulse[i:i + len(hi)] += hi[: max(0, N - i)] * .5
    if k % 2 == 0:
        d = .35; tt_ = tt(d); kick = np.sin(2 * np.pi * 52 * tt_ * (1 + .6 * np.exp(-tt_ / .02))) * np.exp(-tt_ / .11)
        pulse[i:i + len(kick)] += kick[: max(0, N - i)] * .55
padL *= .06; padR *= .06
L += padL + pulse * .07; R += padR + pulse * .07
# fade the very end
fe = int(T(TOTAL - 18) * SR); ramp = np.linspace(1, 0, N - fe) ** 2; L[fe:] *= ramp; R[fe:] *= ramp

# room tone: a very faint air bed under everything, so no moment is digital silence
room = lowpass(rng.normal(0, 1, N), 900) * .0035
L += room; R += lowpass(rng.normal(0, 1, N), 900) * .0035

# ---------- master ----------
mix = np.stack([L, R], 1)
mix = np.tanh(mix * 1.1) / np.tanh(1.1)                  # gentle soft clip
mix *= 10 ** (-1 / 20) / np.max(np.abs(mix))              # peak at -1 dBFS
mix = mix[: int(TOTAL / FPS * SR)]
with wave.open(OUT, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype(np.int16).tobytes())
rms = 20 * np.log10(np.sqrt(np.mean(mix ** 2)) + 1e-9)
print(f"wrote {OUT}: {len(mix) / SR:.2f}s, RMS {rms:.1f} dBFS")
