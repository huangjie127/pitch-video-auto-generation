# Shot prompt language — directing the models

Two prompt disciplines live here. **Storyboard mode** (the default) splits
every shot into *keyframe prompts* (still images, composition) and a *motion
prompt* (what happens between two pinned frames). **Classic mode** uses a
single Shot/Camera/Style prompt per shot. Both are written in English (models
follow English cinematography vocabulary most reliably) and share the Style
anchor and all rules below.

## Storyboard mode: keyframe prompts + motion prompts

**Keyframe prompts** describe a frozen moment — a photograph, not an event:
subject, state, composition (where in frame), lighting, materials. The whole
set is generated in ONE call to a *sequential* image model (consistency across
frames is the model's job); each frame's prompt describes only that frame's
scene state, short and concrete. Re-rolls of a single frame use *edit* mode
with the previous frame as reference ("The same scene and lighting. <delta>").

**The restraint anchor (mandatory).** Image models drift toward "epic CGI
wallpaper" — god rays, lens flares, particle bursts, four-color palettes.
That's the opposite of the Apple look, and one keyframe of drift infects the
whole film. Put this block in `pitch.json → keyframe_style` (the pipeline
prepends it to the batch prompt and appends it to every re-roll):

```
Premium minimalist tech-launch film aesthetic: matte deep black void, vast
empty negative space, exactly one hero subject placed with generous room
around it, soft diffuse studio light, a restrained SINGLE <accent> accent
color on neutral dark glass, photorealistic render, cinematic, shallow depth
of field. All surfaces blank and unmarked. No light rays, no god rays, no
lens flares, no sparkles, no particle explosions, no nebula, no galaxy
interior, no water splashes, no fog banks, no busy detail, no text, no
letters, no logos, no emblems, no symbols, no watermarks, no people.
```

Never write a brand name (e.g. "Apple") into an IMAGE model prompt — it baits
the trademark straight onto your footage (field-tested: "in the style of an
Apple product film" produced a literal Apple logo on the hero object).
Describe the aesthetic, not the company. Video prompts inherit the same rule.

The palette rule is absolute: **one accent color for the entire film** (the
brand accent), everything else black/white/neutral glass. If a scene concept
needs "different things" (modalities, sources, options), differentiate by
form or brightness, never by hue.

**Brand-temperament fusion.** The restraint anchor is the base, not a cage.
The page screenshot (snap_page.mjs) tells you the brand's visual temperament —
fold it into the anchor as *texture and lighting adjectives* while keeping the
palette/density/negative-space rules intact. Example: a brand whose site uses
painterly artwork → add "rendered like a classical oil painting, subtle
impasto brushstroke texture in the dark background, dramatic chiaroscuro
lighting, rich atmospheric depth" to the anchor. Cinematic impact comes from
*lighting drama and depth* (chiaroscuro, one bold directional beam,
atmosphere), never from adding elements, colors, or effects.

**Reserve the text zone in composition.** Overlays must not sit on the shot's
brightest area. Add to the anchor: "composition keeps the hero subject in the
upper two-thirds; the lower third stays dim and clear." Then place `statement`
overlays with `"pos": "lower"` (lower third). `hero`/`number`/`closing` may
stay `center` — their type is huge enough to survive — but check the frames.
Text position should vary across the film; six center cards in a row reads
monotonous and risks collisions.

**Video models amplify.** A keyframe's "subtle sheen" can become a full
rainbow ring once the video model animates it (field-tested). In motion
prompts, restate the discipline: name the ONE color allowed, and append
"no rainbow ring, no color vignette, no added light effects" to any shot whose
keyframes contain iridescence or sheen.

**Motion prompts** describe the journey between the two pinned frames. The
frames own composition and style; the prompt owns *how* — speed, quality of
motion, what leads: "The shards drift inward slowly at first, then flow like
a murmuration into the sphere; the violet filament weaves through them;
everything settles in the final second. Slow, heavy, liquid motion."
Add the camera move here (`static macro, slow push-in`). Do NOT re-describe
the scene — conflicting scene description fights the keyframe conditioning.

Design rule for the chain: adjacent keyframes must be **reachable** in one
shot's duration with one motion. If K3→K4 needs two distinct events, you're
missing a keyframe (or a beat).

## Classic mode: the shot card

```
Shot: <what exists and what happens — ONE subject, ONE motion>
Camera: <framing + one camera move>
Style: <the shared style anchor — identical in every shot>
```

## The Style anchor (the film's visual glue)

Write it once, paste it into every shot verbatim. Template — adapt the two
palette slots to the brand accent, keep the rest:

```
Style: Apple product launch animation, minimal futuristic, luxury technology,
liquid glass, holographic crystal, abstract CGI, deep black background,
<accent-color-words> and cyan iridescent reflections, soft volumetric light,
photorealistic render, shallow depth of field, no text, no letters, no logos,
no watermarks, no people.
```

Palette words per accent: purple `#7F72F7` → "violet and indigo"; blue →
"sapphire and azure"; green → "emerald and mint"; orange → "amber and gold".
Same idea for any brand color — two adjacent tones, always on deep black.

**Why identical:** consistency across independently generated clips comes
almost entirely from this block. If shots feel like different films, the anchor
drifted.

## Shot block rules

- **One subject, one motion.** "A liquid glass sphere slowly assembles from
  floating droplets" — good. A montage description — bad; the model will jump
  cut and the film feels cheap.
- **Motion verbs over states**: assembles, unfolds, ripples, refracts, orbits,
  dissolves, breathes. Give the 5 seconds an arc: begins → transforms → settles.
- **Physical materials, not concepts.** The model can't film "an API" — it can
  film "a thin filament of light connecting floating glass panels". Translate
  every product idea into glass / light / liquid / crystal / particles.
- **No text ever.** Also avoid "logo", "interface", "screen", "chart" — they
  bait the model into rendering garbled glyphs. The overlay layer owns all
  reading material.
- **Continuity nouns.** Reuse the same star object across shots ("the glass
  sphere" in s1 assembles, in s3 splits into panels, in s6 settles and glows) —
  narrative continuity for free.

## Camera block

One move per shot, from this vocabulary: `static macro, slow push-in`,
`slow orbit around subject`, `slow dolly out revealing scale`, `gentle rise
(crane up)`, `locked-off wide`. Always add `shallow depth of field, cinematic`.
Alternate energy: macro close → wide reveal → macro — that rhythm is the
Apple launch feel. Never: whip pans, handheld shake, fast cuts.

## Worked example (beat → prompt)

Beat: "300+ models, one endpoint" (scale beat, number overlay `300+`)

```
Shot: Hundreds of tiny luminous glass shards float scattered in darkness,
then flow like a murmuration into a single perfect translucent sphere that
settles, slowly rotating, refracting inner light.
Camera: slow dolly out from macro to wide as the shards converge, shallow
depth of field, cinematic.
Style: Apple product launch animation, minimal futuristic, luxury technology,
liquid glass, holographic crystal, abstract CGI, deep black background,
violet and indigo and cyan iridescent reflections, soft volumetric light,
photorealistic render, shallow depth of field, no text, no letters, no logos,
no watermarks, no people.
```

The overlay ("300+ 前沿模型，一个端点。") lands at t=1.0s as the murmuration
converges — words and image make the same claim simultaneously. Always design
that alignment: the overlay's key moment should coincide with the shot's
transformation moment (roughly 30–60% into the clip).

## Visual metaphor palette (product idea → filmable image)

| Product idea | Filmable metaphor |
|---|---|
| unification / one API | many fragments converge into one object |
| speed / low latency | light filament racing through glass channels |
| a reveal / launch | object assembles from liquid, settles, glows |
| power / compute | dense energy core breathing inside crystal |
| multimodal / variety | one object refracting into many colors/facets |
| reliability / uptime | perfectly still monolith, subtle steady pulse |
| scale | camera pulls back: the object is one of a vast lattice |
| close / signature | the object at rest, single beauty light, dust motes |

## The signature close (field-tested recipe)

For the final shot, shift the material language from "translucent glowing
glass" to **edge-lit black glass** — the WWDC-style dark finale. The object
goes invisible against the void; only its silhouette carries light as flowing
spectral ribbons. The closing overlay text then reads as if glowing from
inside the glass. Template (swap the emphasis color for the brand):

```
Shot: In a pure black void, an invisible liquid glass form — a soft abstract
orb melting into a fluid membrane — slowly undulates and folds like heavy
liquid; its surface is black glass that disappears into the darkness, and
only its edges catch the light: thin ribbons of prismatic spectral color,
violet, magenta, cyan, green and amber, flow and shimmer along the moving
silhouette like light refracting through the rim of a dark lens; the form
finally breathes and settles into stillness.
Camera: static macro camera, very slow cinematic push-in, shallow depth of field.
Style: Apple product launch animation, minimal futuristic, luxury technology,
dark liquid glass, chromatic dispersion, thin-film iridescence, edge-lit black
glass silhouette, abstract CGI, pure black background, spectral rainbow edge
reflections with <brand-color> emphasis, photorealistic render, no text, no
letters, no logos, no watermarks, no people.
```

Notes: this intentionally departs from the shared Style anchor — a finale may
upgrade the material language when the whole film lives on black. Models tend
to add a dark reflective floor; it usually flatters the closing card. To force
pure void, add "floating in pure black void, no floor, no ground reflections".

## WWDC craft notes (distilled from Apple's design language)

- Restraint is the luxury signal: black voids, one hero object, one light.
- Slowness reads premium — everything ~24fps-feel, no motion faster than the
  camera drift. If a 5s shot has two events, it has one too many.
- Materials do the talking: glass thickness, internal glow, edge refraction.
- Imperfection kills it: specify "photorealistic render" and keep prompts
  concrete; vague prompts produce mushy CGI.
