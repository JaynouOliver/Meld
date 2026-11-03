# Prompt for Claude Code (paste on your computer)

Run Claude Code on your own machine (terminal or desktop app) in an empty folder, then paste everything below the line. It needs Node 20+, git and internet access. Expect 20–40 minutes, most of it rendering.

---

I need a polished ~2-minute product demo video (1920×1080 MP4) for my startup **Meld**, for a hackathon judged by VCs. Meld is live at https://meld-fawn.vercel.app. Everything in the video must be real footage of the live product, plus clean motion-graphic title and caption cards. No fake UI.

**Step 1: get the kit.**
Clone https://github.com/JaynouOliver/Meld and read `video/STORYBOARD.md` fully. It has the story, the value proposition, the scene list with on-screen text, and the motion style. Follow it closely.

**Step 2: record the product.**
From the repo root, run:
```
npm i --no-save playwright && npx playwright install chromium
node video/capture.mjs
```
This opens the live one-click demo (a private, throwaway workspace), drives every feature with a visible cursor, and saves one `.webm` clip per scene in `video/out/`, plus `scenes.json` with timestamped marks for each key moment.

If a scene prints FAILED:
- Look at its `.error.png`.
- Fix that scene in `capture.mjs`, then re-run just that scene: `node video/capture.mjs <scene-name>`.
- Re-run scene `01-landing` first if `session.json` is missing.
- The demo allows 5 new workspaces per hour per IP, so don't re-run `01-landing` in a loop.

Before editing, check every clip:
- Extract frames at the marks with ffmpeg and look at them.
- Confirm each clip shows what its caption claims: the agent's answer is visible, tickets were filed, and the mission went At risk then back to On track.

**Step 3: build the video with Remotion.**
- Create a Remotion project in `video/remotion` (`npx create-video@latest`, blank TypeScript template).
- Import the clips, converting them to MP4 with ffmpeg if needed.
- Build the composition exactly per the storyboard:
  - title cards for the cold open, the problem and Missions;
  - lower-third captions timed to the `scenes.json` marks;
  - slow push-in zooms on the key moments;
  - agent waiting sped up 2–3× rather than cut;
  - the Slack vs Meld comparison card;
  - the closing card with the URL.
- Style: white and graphite with one blue accent (#2952E3), Inter font, flat cards with 1px borders, subtle shadows only on the framed screen. It should feel like a Fortune-500 or Linear-quality launch video, not an "AI project". No gradients, glows, sparkles or robots.
- Render to `video/meld-demo.mp4` at 1920×1080, 30 fps.

**Step 4: review it yourself before you tell me it's done.**
- Extract a frame every 3 seconds from the final MP4 and look at every one. Captions must be readable, nothing cut off, no dead air longer than 1.5 s, and no clip showing an error or an empty screen.
- Fix and re-render until it's clean.
- Then give me the path to the MP4, the total length, and a list of scenes with timestamps.

Optional, if I say yes after you're done: add royalty-free background music and a voiceover reading the captions (macOS `say` or another TTS), and render a second version `video/meld-demo-vo.mp4`.
