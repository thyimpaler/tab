# TAB video: shots A–C (continuation after the ring clicks on)

24fps, 1920×1080. Frame numbers below are from the start of the continuation.

| Frames | Shot | Picture | Sound cue |
|---|---|---|---|
| 0–15 | A | Pull back from the ring close-up to the robot at the left third (stand-in built from the opening clip; replace with the real 3D/AI shot: dolly back, robot glances right from f9) | soft air pass f0–12 |
| 16–47 | B | Glass capsule "PAY 100 USDC" over the defocused robot; cursor clicks f36; glass presses; coral outline traces it: refused | glass tick f16 · dry click f36 · muted felt stop f40 |
| 48–107 | C | "your agent’s spending should be organized" word by word; "organized" leaves f81–85; "fixed" (coral) lands f90 | near-silent tick per word f48/51/54/57/60/63 · metal clack f90 (reuse the ring click from shot 3) |

Files
- `TAB-continuation-B-C.mp4`: shots B and C only, to cut in after the real shot A.
- `TAB-continuation-A-B-C.mp4`: with the stand-in shot A.
- `TAB-preview-with-opening.mp4`: the opening clip (upscaled from the WhatsApp copy) straight into the continuation, for judging pacing only.

Rebuild
1. `python -m http.server 8765` in this folder.
2. `node render.mjs <framesDir> 16 107` (shots B, C; WebGL glass + DOM text).
3. `python encode.py <framesDir>` (adds the same grain and a 3% vignette to every frame, encodes H.264).

Type is Inter (open source) standing in for SF Pro: swap the `@font-face` in `scene.html` for SF Pro Display on a Mac and re-render.
