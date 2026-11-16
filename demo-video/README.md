# Demo video

The product demo shown in the "Key features" part of the presentation: about 3 min 15 s,
1080p, with music and sound effects. Built with [Remotion](https://www.remotion.dev)
(React rendered to video).

## What is real and what is drawn

| Part | Source |
|---|---|
| Web portal | Stills of the real `apps/web`, run locally against sample data (no live API or database) |
| Field app | Recreated as motion graphics from the shared design tokens. It is not a recording of the Android app |
| Plant "photos", camera frame, map background | Illustrations drawn in code (`capture/art.mjs`, `capture/harness.mjs`) |
| Music and sound effects | Synthesised in `audio/make_audio.py`. Nothing is sampled, so nothing needs a licence |

All names, plants, readings and alerts are sample data from `capture/fixture.mjs`.

## Render it

```bash
cd demo-video
npm install
npx remotion render DemoVideo out/daun-sense-demo.mp4
```

`npm run dev` opens Remotion Studio to preview and scrub the timeline.

## Change it

- **Wording and timing:** `src/scenes/*.tsx`, one file per part. Part start times are in `src/theme.ts` (`T`) and sit on bar lines of the music.
- **Web stills:** start the portal (`npm run web` from the repo root), then `npm run capture`. Needs Playwright with Chromium.
- **Sample data:** `capture/fixture.mjs`. Put real plant photos in by changing the `url` fields.
- **Audio:** `npm run audio` (Python 3 with numpy and scipy, plus ffmpeg).
