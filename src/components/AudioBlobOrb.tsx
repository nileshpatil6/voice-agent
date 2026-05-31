"use client";

import { useRef, useEffect, MutableRefObject } from "react";
import { Status } from "./VoiceAgent";

const SIZE     = 280;
const N        = 12;   // control points per blob
const BASE_R   = 72;

interface Props {
  statusRef:     MutableRefObject<Status>;
  aiAnalyserRef: MutableRefObject<AnalyserNode | null>;
  micAnalyserRef: MutableRefObject<AnalyserNode | null>;
}

function blob(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  r: number,
  vals: number[],
  idleAmp: number,
  audioAmp: number,
  frame: number,
  speed: number,
) {
  const pts: [number, number][] = [];
  for (let i = 0; i < N; i++) {
    const t     = i / N;
    const angle = t * Math.PI * 2 - Math.PI / 2;
    const v     = vals[Math.floor(t * vals.length)] ?? 0;
    const idle  = Math.sin(frame * speed + i * ((Math.PI * 2) / N) * 1.5) * idleAmp;
    const rad   = r * (1 + idle + v * audioAmp);
    pts.push([cx + Math.cos(angle) * rad, cy + Math.sin(angle) * rad]);
  }
  ctx.beginPath();
  const L = pts.length;
  for (let i = 0; i < L; i++) {
    const p0 = pts[(i - 1 + L) % L];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % L];
    const p3 = pts[(i + 2) % L];
    if (i === 0) ctx.moveTo(p1[0], p1[1]);
    ctx.bezierCurveTo(
      p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
      p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6,
      p2[0], p2[1],
    );
  }
  ctx.closePath();
}

export function AudioBlobOrb({ statusRef, aiAnalyserRef, micAnalyserRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width  = SIZE * dpr;
    canvas.height = SIZE * dpr;
    canvas.style.width  = SIZE + "px";
    canvas.style.height = SIZE + "px";

    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);

    const cx = SIZE / 2;
    const cy = SIZE / 2;
    let frame = 0;
    let raf: number;

    const draw = () => {
      frame++;
      ctx.clearRect(0, 0, SIZE, SIZE);

      const status   = statusRef.current;
      const speaking  = status === "speaking";
      const listening = status === "listening";
      const active    = speaking || listening || status === "connecting";
      const err       = status === "error" || status === "limited";

      // Read analyser data
      const analyser = speaking ? aiAnalyserRef.current : micAnalyserRef.current;
      let vals: number[] = [];
      if (analyser) {
        const raw = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(raw);
        vals = Array.from(raw).map(v => v / 255);
      }
      const avg = vals.length ? vals.slice(0, 16).reduce((s, v) => s + v, 0) / 16 : 0;

      if (err) {
        ctx.beginPath(); ctx.arc(cx, cy, BASE_R * 1.35, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(220,38,38,0.06)"; ctx.fill();
        ctx.beginPath(); ctx.arc(cx, cy, BASE_R, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(220,38,38,0.11)"; ctx.fill();
        ctx.beginPath(); ctx.arc(cx, cy, BASE_R * 0.44, 0, Math.PI * 2);
        ctx.fillStyle = "#DC2626"; ctx.fill();
        raf = requestAnimationFrame(draw); return;
      }

      if (active) {
        // Layer 3 — outermost, very transparent, slow
        blob(ctx, cx, cy, BASE_R * 1.58, vals, 0.055, speaking ? 0.5 : 0.18, frame, 0.007);
        ctx.fillStyle = speaking ? "rgba(91,92,246,0.07)" : "rgba(91,92,246,0.04)";
        ctx.fill();

        // Layer 2 — mid
        blob(ctx, cx, cy, BASE_R * 1.25, vals, 0.045, speaking ? 0.62 : 0.22, frame, 0.013);
        ctx.fillStyle = speaking ? "rgba(91,92,246,0.14)" : "rgba(91,92,246,0.08)";
        ctx.fill();

        // Layer 1 — inner blob
        blob(ctx, cx, cy, BASE_R * 0.97, vals, 0.035, speaking ? 0.72 : 0.28, frame, 0.02);
        ctx.fillStyle = speaking ? "rgba(91,92,246,0.26)" : "rgba(91,92,246,0.14)";
        ctx.fill();
      } else {
        // Idle — gentle breathing only
        const b = Math.sin(frame * 0.016) * 0.05;
        ctx.beginPath(); ctx.arc(cx, cy, BASE_R * (1.42 + b), 0, Math.PI * 2);
        ctx.fillStyle = "rgba(91,92,246,0.05)"; ctx.fill();
        ctx.beginPath(); ctx.arc(cx, cy, BASE_R * (1.1 + b * 0.6), 0, Math.PI * 2);
        ctx.fillStyle = "rgba(91,92,246,0.09)"; ctx.fill();
      }

      // Center sphere — scales with audio level
      const cR = BASE_R * 0.44 + avg * BASE_R * 0.13;
      const grd = ctx.createRadialGradient(cx - cR * 0.28, cy - cR * 0.28, 0, cx, cy, cR);

      if (active) {
        grd.addColorStop(0, speaking ? "#7879F1" : "#6D6EF5");
        grd.addColorStop(1, speaking ? "#4338CA" : "#5B5CF6");
      } else {
        grd.addColorStop(0, "#9A9BF9");
        grd.addColorStop(1, "#818CF8");
      }

      ctx.beginPath();
      ctx.arc(cx, cy, cR, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();

      // Specular highlight
      ctx.beginPath();
      ctx.arc(cx - cR * 0.24, cy - cR * 0.24, cR * 0.27, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.32)";
      ctx.fill();

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []); // refs are stable, no deps needed

  return <canvas ref={canvasRef} style={{ display: "block" }} />;
}
