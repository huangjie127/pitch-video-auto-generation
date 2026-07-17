# Pitch script guide — belief, contribution, proof

A pitch film is not a feature list set to music. Apple's product films argue
one belief and prove it. Learn the structure before writing a single line.

## How Apple actually introduces a product (the five moves)

1. **Open with a belief, not the product.** "We've always believed technology
   should disappear into the experience." The product enters later, as
   evidence for the belief. The film's first line is worldview, not pain point.
2. **Restate the problem at the human level.** Not "APIs are fragmented" but
   "the impulse to create shouldn't start with reading three sets of docs."
   Translate the technical situation into a human situation.
3. **Narrate contribution, not capability.** The signature sentence shape is
   **"We did X, so you never have to Y."** — the team's decision, the
   complexity they swallowed, the burden they removed. "It has 300 models" is
   capability; "we welded three hundred interfaces into one, so you manage a
   single key" is contribution. Contribution is what earns admiration.
4. **Numbers testify, they don't enumerate.** Every figure must be attached to
   a human consequence. "300+ models" → "and one bill, one SDK, one key."
   A number without a consequence is a spec sheet.
5. **Close the loop.** The final beat returns to the opening belief — now
   proven. The name lands last, like a signature.

## The derivation protocol (URL → 理念)

A product page gives you facts. The film needs beliefs. Derive, don't extract:

```
0. TEMPERAMENT look at the rendered page screenshot (scripts/snap_page.mjs):
               dark/light, art direction, density, boldness — this steers
               keyframe design and music energy, not the copy
1. FACTS       list capabilities, numbers, prices from the page
2. REMOVALS    for each fact ask: what does the user no longer have to do?
               (300 models, one key → no more N accounts, N bills, N SDKs)
3. BELIEF      what conviction do these removals collectively point to?
               ("modalities shouldn't have walls" / "calling intelligence
                should feel like calling electricity")
4. CONTRIBUTIONS  rewrite the 2–3 strongest facts as "we did X, so you Y"
5. ARRANGE     belief opens → contributions carry the middle → the best
               number testifies → belief returns, proven, with the name
```

Spend real effort on step 3 — it's the difference between a film that sells
and a film that *stands for something*. The belief must be specific enough
that a competitor couldn't open with the same line.

## The default 6-beat arc (30s)

| # | Beat | Overlay type | The overlay says | The footage shows |
|---|------|--------------|------------------|-------------------|
| 1 | Belief | `statement` | the conviction, one line | the world before: fragments, walls, distance |
| 2 | Reveal | `hero` | kicker + name + one-line promise | the birth of the object |
| 3 | Contribution | `statement` | "我们做了X，{{所以你不用Y}}" | the object performing the removal |
| 4 | Contribution | `statement` | second removal, different shape | a different behavior of the same object |
| 5 | Testimony | `number` | the figure + its human consequence | scale reveal |
| 6 | Loop close | `closing` | name + belief echoed as tagline + quiet fact | the object at rest (signature close) |

Worked example (Atlas Cloud):
- Facts: 300+ models / one OpenAI-compatible key / day-0 access / 99.99%.
- Removals: no more per-vendor accounts & SDKs; no more waiting for access;
  no more integration rewrites.
- Belief: **模态之间，不该有墙。**
- Contributions: "我们把三百套接口，焊成了一个。" / "发布当天就能用——排队的是我们，不是你。"
- Loop: tagline echoes the belief; "atlascloud.ai" is the quiet fact.

## Overlay copy rules

- **Write in the product's language, not the conversation's.** The film speaks
  to the product's audience: an English-language site gets English copy even
  when the user briefed you in Chinese, and vice versa. When in doubt, ask or
  match the page you scraped. Reusing the site's own signature lines (e.g.
  Figma's "from WIP to ship, together") is fair game — one, at most, as an
  insider nod.
- Short declarative lines; fragments welcome. One thought per beat.
- Contribution beats use the we-did/so-you shape; put `{{accent}}` on the
  "so you" turn — that's the gift, that's what glows.
- Numbers huge, unit whispered, consequence in the label line.
- Chinese: full-width punctuation （，。、）; terse and balanced. English:
  contrast pairs. Never exclamation marks.
- The whole film's words should fit on one sticky note. Cut until they do.

## Timing the words against the footage

Every shot has a transformation moment (~30–60% in). Set `in` so the overlay
lands as that moment peaks — image and claim arriving together is the whole
trick. Defaults that work for 5s shots: `in: 1.0, out: 4.4`. In storyboard
mode (hard cuts at shared keyframes) text may run closer to the cut
(`out: 4.6`) since there's no crossfade zone to protect — but still leave
≥0.4s clean. One field-tested caveat: if a shot's subject is a **bright core
at screen center**, the text sits on top of it; prefer compositions whose
brightest area is slightly off-center, or time the text before the peak.

## Music brief

One instrumental track for the whole film. Prompt pattern:
`"minimal ambient electronic, cinematic, luxurious, evolving pads, subtle
pulse, warm sub bass, 85-95bpm, instrumental, no vocals"`. Match energy to the
product (dev-infra = colder/precise; consumer = warmer). The stitcher trims to
length and fades out over the final 2s.

## Cost discipline

Quote the estimate before generating. The storyboard gate exists so taste
decisions happen at image prices ($0.03–0.05/frame), not video prices
($0.45/shot): re-roll keyframes until the film looks right, only then release
the video budget. Iterate scripts for free (JSON, or an HTML animatic via the
apple-launch-video skill). To redo one shot after video generation: delete
`build/shots/<id>.mp4` (and `build/work/<id>.mp4`), tweak, rerun.
