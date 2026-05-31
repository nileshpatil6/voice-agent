# Voice Agent — AI Appointment Booking

Real-time AI receptionist that books appointments through natural voice conversation. Built on OpenAI's Realtime API over WebRTC — sub-second latency, live audio-reactive orb visualization.

**Built by [Nilesh Patil](https://github.com/nileshpatil6)**

---

## What it does

Speak to an AI receptionist (Aria) that collects your name, appointment type, preferred date/time, and contact number — then confirms and books. The orb on screen morphs in real time with the AI's voice frequency data.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router) |
| Voice API | OpenAI Realtime API — `gpt-realtime-2` model |
| Transport | WebRTC (browser-native, no extra lib) |
| Visualization | Web Audio API `AnalyserNode` + canvas Catmull-Rom blob |
| Rate limiting | 5 min / IP / hr, in-memory server-side |
| Styling | Tailwind v4 + CSS custom properties |

## Setup

```bash
cp .env.local.example .env.local
# paste your OPENAI_API_KEY into .env.local

npm install
npm run dev
```

Open `http://localhost:3000`, allow mic access, click **Start Session**.

## Deploy (Vercel)

1. Import this repo on vercel.com
2. Add env var: `OPENAI_API_KEY`
3. Deploy — no extra config needed

## Rate limiting

Sessions are capped at **5 minutes per IP per hour** to control API spend. The quota bar in the UI shows remaining time. Resets automatically each hour. For production, swap the in-memory store for Redis.

## How the orb works

1. `getUserMedia` captures the mic stream — connected to a mic `AnalyserNode`.
2. When the AI responds, the incoming WebRTC audio track connects to a separate AI `AnalyserNode`.
3. A canvas RAF loop reads `getByteFrequencyData` each frame from whichever analyser is active.
4. 12 control points around a circle — each point's radius offset by its frequency bin value.
5. Catmull-Rom spline connects the points — smooth organic morphing shape.

The orb reacts to mic input when listening, AI voice when speaking.

---

MIT — use freely.
