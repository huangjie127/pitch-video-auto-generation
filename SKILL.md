---
name: product-pitch-video
description: >-
  Turn a product website URL (or a product description) into a real, finished
  MP4 pitch video in Apple WWDC launch style: AI-generated cinematic shots
  (liquid glass / luxury-tech CGI) via Atlas Cloud video models, AI-generated
  soundtrack, premium typography overlaid in post, auto-stitched with ffmpeg.
  Use whenever the user wants an actual video file for a product: "pitch
  video", "产品宣传视频", "生成一条视频", "宣传片成片", "WWDC 风格视频",
  "AI 生成产品视频", "出一条 30 秒的片子", or gives a product URL and asks for
  a video/film/广告片. This produces a real .mp4 by calling paid generation
  APIs — distinct from the apple-launch-video skill, which renders a free
  HTML animatic; prefer THIS skill when the deliverable is a video file,
  and mention the HTML animatic as a free preview option for the script.
---

# Product Pitch Video

Produce a finished ~30-second MP4: an Apple-launch-style product film whose
visuals are generated shot-by-shot by Atlas Cloud video models, with an
AI-generated instrumental soundtrack and crisp typography overlaid in post.

## The pipeline (storyboard-first)

```
product URL ─▶ ① understand+derive ─▶ ② pitch script ─▶ ③ pitch.json
                (belief/contribution)   (beats+keyframes+motion)
   ─▶ ④ Phase A: keyframe stills ─▶ ⑤ HUMAN REVIEWS STORYBOARD ─▶ ⑥ Phase B: videos+stitch ─▶ final.mp4
       (chained image gen, ~$0.3)      (re-roll frames cheaply)       (parallel, ~$2.7)
```

You do the creative work in ①–③; `scripts/pipeline.mjs` does all the machinery
(chained keyframe generation, parallel video generation, polling, download,
overlay rendering, ffmpeg stitching). Never hand-roll API calls or ffmpeg
commands — the scripts handle retries, resume, and cost reporting.

**Why this shape:**
- **Shot-to-shot continuity** comes from shared boundary keyframes: keyframe
  K_i is shot i's last frame AND shot i+1's first frame. Each keyframe is
  generated from the previous one in image-*edit* mode, so materials, lighting
  and the star object carry through the whole film. Videos are generated with
  first+last frame conditioning (`image` + `last_image`), and adjacent shots
  then cut seamlessly (hard cuts, no crossfade needed).
- **Taste decisions happen at image prices.** The storyboard gate (⑤) lets the
  user re-roll any composition for ~$0.04 before releasing the ~$2.7 video
  budget.
- AI video models cannot render text reliably, so *prompts describe pure
  visuals* (no text, no letters, no logos, no UI); all words go into *overlays*
  rendered by a headless browser at pixel-perfect quality.
- Everything is resumable: a crash or re-roll never re-bills completed work.

Classic mode (single `video_prompt` per shot, text-to-video, xfade transitions)
still works for quick drafts — just omit `keyframes` from pitch.json.

## Prerequisites (check before starting)

- `ATLAS_CLOUD_API_KEY` — env var, or `.env` file in the working directory
  (`ATLAS_CLOUD_API_KEY=...`). If missing, ask the user for their key. Never
  write the key into any file that could be shared/committed except `.env`.
- **ffmpeg** — on PATH, or set `FFMPEG_PATH`, or place a build at
  `tools/ffmpeg/bin/ffmpeg.exe` relative to the working directory. If absent
  on Windows, download the static build from
  `https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip` and unzip
  to `tools/ffmpeg/`.
- **Chrome or Edge** — used headless for typography overlays (auto-detected).
- **Cost awareness**: tell the user the estimate before generating. Default
  30s film = 6 shots × 5s at 1080p ≈ **$2.7** video + ~$0.15 music
  (Seedance 2.0 ≈ $0.09/s). Testing/iteration? Use `--res 720p` and/or
  `seedance-2.0-mini` (half price) first. The pipeline prints actual billed
  tokens at the end.

## Workflow

1. **Understand and derive.** Two scrapes, complementary:
   - *Facts* (text): WebFetch the URL for capabilities, numbers, price,
     tagline, tone of copy; grab the brand accent from the HTML (hex-frequency
     count works when compiled CSS has no semantic variables).
   - *Temperament* (visual): screenshot the rendered page and READ it —
     `node <skill>/scripts/snap_page.mjs <url> --out page.png` — then note
     dark/light feel, art direction (photographic? illustrated? abstract?),
     density vs whitespace, boldness. Text can't carry this, and it should
     steer the keyframe designs (an artful-dark brand tolerates bolder
     compositions than a clinical-light one).

   Then run the **derivation protocol** in
   `references/pitch-script-guide.md`: facts → what each removes for the user
   → the belief they point to → contribution sentences ("we did X, so you
   never Y"). The film argues the belief; it does not recite the feature list.

2. **Write the pitch script.** Read `references/pitch-script-guide.md`. Plan
   ~6 beats for 30s (belief → reveal → 2 contributions → testimony number →
   loop close). For each beat write the **overlay copy** (Apple voice, terse,
   full-width punctuation for Chinese) and the **visual state** the beat ends
   on — those end-states become the keyframes.

3. **Design the keyframe chain + motion.** Read
   `references/shot-prompt-language.md`. N shots need N+1 keyframes where
   K_i = end of shot i = start of shot i+1, all featuring one continuous star
   object. K0's prompt carries the full style; later keyframes describe only
   the delta from the previous frame. Each shot gets a `motion_prompt` (pure
   motion + camera; frames own the composition). No text in any prompt.

4. **Assemble `pitch.json`** (schema below) in the working directory.

5. **Run Phase A — storyboard.**
   ```
   node <skill>/scripts/pipeline.mjs pitch.json --out pitch-build
   ```
   All keyframes are generated in ONE batch call to a *sequential* image model
   (`bytedance/seedream-v5.0-lite/sequential`) — cross-frame consistency is
   the model's job, and the whole set lands in a few minutes. The pipeline
   writes `pitch-build/storyboard.html` and **stops for review**. Show the
   storyboard to the user. To re-roll one frame: tweak its prompt, delete
   `pitch-build/keyframes/<id>.png`, rerun — single missing frames regenerate
   in *edit* mode with the previous frame as reference and the
   `keyframe_style` anchor appended, so re-rolls don't drift. A `keyframe_style`
   restraint anchor in pitch.json is mandatory — see the keyframe section of
   `references/shot-prompt-language.md` for the block and why image models
   need it.

6. **Run Phase B — film.** Rerun the same command once the storyboard is
   approved. Shots generate in parallel (first+last frame conditioned,
   1–5 min each), overlays render, hard-cut stitch, soundtrack mixed →
   `pitch-build/final.mp4`. Resumable at every step; to redo one shot delete
   `shots/<id>.mp4` + `work/<id>.mp4` and rerun. Individual stages run alone
   (`gen_image.mjs`, `gen_video.mjs`, `gen_music.mjs`, `overlay.mjs`,
   `stitch.mjs`); `references/atlas-api.md` has the raw API for debugging.

7. **Review and deliver.** Extract a few frames with ffmpeg to sanity-check
   (text legibility, cut seamlessness at shared keyframes). Report the actual
   cost printed by the pipeline. Offer targeted re-rolls rather than full
   regeneration.

## pitch.json schema (v2 — storyboard mode)

```json
{
  "product": "Aura",
  "accent": "#7F72F7",
  "ratio": "16:9",
  "resolution": "1080p",
  "fps": 30,
  "cut": "hard",
  "model": "bytedance/seedance-2.0/image-to-video",
  "image_model": "bytedance/seedream-v5.0-lite/sequential",
  "edit_model": "bytedance/seedream-v5.0-pro",
  "keyframe_style": "<the restraint anchor — see shot-prompt-language.md>",
  "music": {
    "model": "minimax/music-2.6",
    "prompt": "minimal ambient electronic, evolving pads, subtle pulse, cinematic, luxurious, 90bpm, instrumental",
    "instrumental": true
  },
  "keyframes": [
    { "id": "K0", "prompt": "<full scene + style — text-to-image>" },
    { "id": "K1", "prompt": "The same scene and lighting. <only the delta> — edit from K0" }
  ],
  "shots": [
    {
      "id": "s1-belief",
      "duration": 5,
      "from": "K0",
      "to": "K1",
      "motion_prompt": "<pure motion + camera between the two frames>",
      "overlay": {
        "type": "statement",
        "text": "模态之间，{{不该有墙}}。",
        "in": 1.0,
        "out": 4.5
      }
    }
  ]
}
```

Classic mode: omit `keyframes`, give each shot a `video_prompt` instead of
`from`/`to`/`motion_prompt`, and transitions become 0.5s crossfades
(`"crossfade": 0.5` to tune).

Overlay `type`s (rendered by `assets/overlay.html`, same Apple type system as
the launch-video skill): `statement` (one big line), `hero` (kicker + product
name + subline), `number` (giant value + unit + label), `closing` (name +
tagline + cta). `in`/`out` are seconds within the shot when the text fades
in/out (leave ≥0.8s of clean footage at each end so crossfades never cut
through text). `{{braces}}` in any text paint that phrase in the accent color.
`pos` places the text block vertically: `center` (default), `lower` (lower
third — use for `statement`s over center-bright subjects), `upper`. Vary
positions across the film and match them to the keyframe compositions (see
the text-zone rule in `references/shot-prompt-language.md`).
Top-level `"overlay_theme": "dark" | "light"` picks the type color: `dark`
(default, white text) for dark films, `light` (ink text) when the brand's
temperament calls for a bright film — white-on-light is invisible. Per-overlay
`theme` overrides for mixed films.

Image model options: `bytedance/seedream-v5.0-lite/sequential` (batch mode —
whole keyframe set in one call, best consistency) or a chain-mode family like
`openai/gpt-image-2` (no sequential variant; frames generate one-by-one, each
edit-conditioned on the previous — slower but strong per-frame quality, and
cheap). The pipeline picks the right path from the model name.

## Quality bar

- Style block identical in every shot prompt; palette words match the brand
  accent. One motion per shot — no shot-within-shot montages.
- No text of any kind requested from the video model.
- Overlay copy survives the giant-screen test: short, declarative, specific.
- Chinese copy uses full-width punctuation (，。、) — half-width commas read
  as cheap.
- Total = shots×duration − crossfades; keep 28–32s for a "30 second" ask.
- Before calling it done, confirm `final.mp4` exists, has audio, and its
  duration matches (ffprobe is printed by the pipeline).
