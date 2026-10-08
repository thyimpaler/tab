# TAB launch film

`TAB-launch.mp4`: 43s, 1920×1080, 24fps, stereo AAC. Readable with the sound off.

## Timeline (global frames, 24fps)

| Frames | Time | Scene | Picture | Sound |
|---|---|---|---|---|
| 0–123 | 0.0–5.1 | Opening (owner's clip) | Ring flies, slides onto the robot's finger, coral lights on f87 | air passes on the flight and cuts (f0, f9, f27, f58); click f86 + metal clack f87; glass ping f88 |
| 124–139 | 5.2–5.8 | A | Pull back to the robot at the left third (**stand-in**; replace with the 3D/AI shot: dolly back, robot glances right from f133) | air pass |
| 140–171 | 5.8–7.1 | B | Glass capsule "PAY 100 USDC" over the defocused robot; cursor clicks f160; glass presses; coral outline: refused | glass tick f140 · click f160 · muted stop f164 |
| 172–231 | 7.2–9.6 | C | "your agent’s spending should be organized" → "fixed" (coral) lands f214 | word ticks f172–187 · metal clack f214 |
| 232–315 | 9.7–13.1 | Reveal | Logo mark, wordmark, "Give your agent a tab. Not your wallet." | low bloom + glass f232; **score enters** |
| 316–435 | 13.2–18.1 | 01 Set a limit | The ring turns like a dial to 10.00 USDC; max per payment, end date | detent ticks as it turns, click on stop f378 · 120bpm pulse starts |
| 436–507 | 18.2–21.1 | 02 Key | The agent key ticket slides up | paper slide, soft landing |
| 508–651 | 21.2–27.1 | 03 Pays | Glass payments glide across the ring and are absorbed, balance 10.00 → 8.80; a 2.40 payment is refused in coral | glass in, tick on absorb; muted stop f596 |
| 652–735 | 27.2–30.6 | 04 Checks | Five checks, ticked in order | click + tick per check |
| 736–843 | 30.7–35.1 | Non-custodial | "Your money stays in your wallet. Revoke any time." Owner clicks Revoke, ring empties, +8.80 USDC back | click f784, reverse air, clack f804 · pulse stops |
| 844–915 | 35.2–38.1 | Price | 0.20 USDC to open a tab. Nothing per payment. | low bloom f844 |
| 916–1035 | 38.2–43.1 | End | Lockup, line, "Live on Solana · pays over x402 · URL" | clack + bloom f916, score resolves, fade |

## Notes
- **Score is temporary** (synthesised pad + soft pulse in `audio.py`). Swap for a licensed track by replacing the music block; foley stays.
- **Opening** comes from the owner's clip (WhatsApp copy, 848×480, so soft when upscaled). Point `TAB_OPENING` at the original high-res file and rebuild. Its original audio (a loud constant bed) is replaced by matching foley.
- **Type**: Inter stands in for SF Pro (swap the `@font-face` in `scene.html` / `launch.html` on a Mac), Geist Mono for numbers, Funnel Display only for the wordmark.
- **URL** on the end card is `tappay.si` (`#eFoot` in `launch.html`). Rebuild the film to bake it into the frames.

## Rebuild
```
python -m http.server 8765                                   # in this folder
python build_frames.py <frames>                              # opening + shot A  → f0000–f0139
node render.mjs <frames> 16 107 8765 scene.html 124          # shots B, C        → f0140–f0231
node render.mjs <frames> 0 803 8765 launch.html 232          # launch scenes     → f0232–f1035
python audio.py <frames>/mix.wav 1036                        # foley + temp score
python encode.py <frames> launch <frames>/mix.wav            # grain, vignette, H.264 + AAC → TAB-launch.mp4
```
Frames are JPEG q95 (~350 MB for the whole film); delete the folder after encoding.
