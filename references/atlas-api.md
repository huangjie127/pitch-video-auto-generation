# Atlas Cloud API — ground truth (verified 2026-07)

Base URL: `https://api.atlascloud.ai`
Auth header on every call: `Authorization: Bearer $ATLAS_CLOUD_API_KEY`

## Video generation

`POST /api/v1/model/generateVideo` — returns a prediction immediately; poll for the result.

```json
{
  "model": "bytedance/seedance-2.0/text-to-video",
  "prompt": "Shot: ...\nCamera: ...\nStyle: ...",
  "duration": 5,
  "resolution": "1080p",
  "ratio": "16:9",
  "generate_audio": false,
  "watermark": false,
  "seed": -1
}
```

| param | values | notes |
|-------|--------|-------|
| `duration` | int 4–15, or -1 (auto) | seconds per clip |
| `resolution` | `480p` `720p` `720p-SR` `1080p` `1080p-SR` `1440p-SR` `4k` | 4k only on full seedance-2.0 |
| `ratio` | `16:9` `4:3` `1:1` `3:4` `9:16` `21:9` `adaptive` | always pin explicitly — `adaptive` breaks stitching |
| `generate_audio` | bool (default true) | **set false** — we lay one soundtrack over everything; per-shot audio clashes |
| `return_last_frame` | bool | returns last frame as extra output — feed into `image-to-video` (`image_url`) for shot-to-shot continuity chaining (advanced) |
| `seed` | -1 or 0..2^32-1 | fix for reproducibility |

Model tiers (price per second, subject to change — the models endpoint returns live pricing):
- `bytedance/seedance-2.0/text-to-video` ≈ $0.09/s — final quality
- `bytedance/seedance-2.0-fast/text-to-video` ≈ $0.072/s
- `bytedance/seedance-2.0-mini/text-to-video` ≈ $0.045/s — drafts/iteration
- Also available: Kling v3, Veo, Wan, Hailuo, Vidu… (`GET /api/v1/models`, filter `type=="Video"`)

## Music generation

`POST /api/v1/model/generateAudio`

- `minimax/music-2.6` (≈$0.15/track): `{ "model", "prompt", "is_instrumental": true, "format": "mp3", "sample_rate": 44100, "bitrate": 256000 }`
  Prompt = style/mood/instrumentation words, e.g. `"minimal ambient electronic, cinematic, luxurious, evolving pads, 90bpm"`.
- `suno/chirp-v5` (≈$0.13): `{ "model", "prompt", "make_instrumental": true }`

Tracks come back longer than 30s — the stitcher trims with a fade-out; never rely on track length.

## Polling

`GET /api/v1/model/prediction/{id}`

```json
{ "id": "...", "status": "processing | completed | failed | timeout",
  "outputs": ["https://...mp4"], "completion_tokens": 123, "total_tokens": 123 }
```

- Poll every 5–10s. A 5s 1080p shot typically completes in 1–5 minutes.
- `outputs[0]` = the artifact URL (video may include `outputs[1]` = last frame if requested). Download promptly — treat URLs as expiring.
- `completion_tokens` ≈ billing units; the pipeline sums and reports them.

## Model discovery

`GET /api/v1/models` → `{ data: [ { model, type: "Text|Image|Video|Audio", price: { actual: { base_price } }, schema } ] }`
Each entry's `schema` URL is a full OpenAPI JSON of that model's parameters —
the authoritative reference when adding a new model to the pipeline.
