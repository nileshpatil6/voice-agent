"use client";

import { useState, useRef, useCallback, useEffect, MutableRefObject } from "react";
import { AudioBlobOrb } from "./AudioBlobOrb";
import { Transcript } from "./Transcript";
import { RateBar } from "./RateBar";

export type Msg    = { role: "user" | "assistant"; text: string; id: string };
export type Status = "idle" | "connecting" | "listening" | "speaking" | "error" | "limited";

const VOICES = ["shimmer", "alloy", "ash", "ballad", "coral", "echo", "sage", "verse"];

export function VoiceAgent() {
  const [status,      setStatus]      = useState<Status>("idle");
  const [msgs,        setMsgs]        = useState<Msg[]>([]);
  const [voice,       setVoice]       = useState("shimmer");
  const [errMsg,      setErrMsg]      = useState("");
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [limitMs,     setLimitMs]     = useState(300_000);

  // Refs for canvas RAF loop — avoids stale closures
  const statusRef:      MutableRefObject<Status>           = useRef("idle");
  const aiAnalyserRef:  MutableRefObject<AnalyserNode | null> = useRef(null);
  const micAnalyserRef: MutableRefObject<AnalyserNode | null> = useRef(null);

  const pcRef      = useRef<RTCPeerConnection | null>(null);
  const dcRef      = useRef<RTCDataChannel | null>(null);
  const audioRef   = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Keep statusRef in sync with state
  useEffect(() => { statusRef.current = status; }, [status]);

  useEffect(() => {
    fetch("/api/session").then(r => r.json()).then(d => {
      if (d.remainingMs != null) { setRemainingMs(d.remainingMs); setLimitMs(d.limitMs); }
    }).catch(() => {});
    audioRef.current = new Audio();
    audioRef.current.autoplay = true;
  }, []);

  const addMsg = useCallback((role: "user" | "assistant", delta: string) => {
    if (!delta) return;
    setMsgs(prev => {
      const last = prev[prev.length - 1];
      if (last?.role === role)
        return [...prev.slice(0, -1), { ...last, text: last.text + delta }];
      return [...prev, { role, text: delta, id: `${role}-${Date.now()}` }];
    });
  }, []);

  const getOrCreateCtx = useCallback(() => {
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
    const ctx = audioCtxRef.current;
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }, []);

  const disconnect = useCallback(() => {
    dcRef.current?.close();
    pcRef.current?.close();
    dcRef.current = null;
    pcRef.current = null;
    aiAnalyserRef.current  = null;
    micAnalyserRef.current = null;
    setStatus("idle");
  }, []);

  const connect = useCallback(async () => {
    if (status !== "idle" && status !== "error") return;
    setStatus("connecting");
    setErrMsg("");
    setMsgs([]);

    try {
      const res  = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voice }),
      });
      const data = await res.json();

      if (!res.ok) {
        setStatus(res.status === 429 ? "limited" : "error");
        setErrMsg(data.error ?? "Failed to start session.");
        return;
      }

      if (data.remainingMs != null) setRemainingMs(data.remainingMs);

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // AI audio — wire to analyser
      pc.ontrack = (e) => {
        if (audioRef.current) audioRef.current.srcObject = e.streams[0];
        const ctx      = getOrCreateCtx();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.75;
        ctx.createMediaStreamSource(e.streams[0]).connect(analyser);
        aiAnalyserRef.current = analyser;
      };

      // Mic — wire to analyser AND peer connection
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStream.getTracks().forEach(t => pc.addTrack(t, micStream));

      const ctx2     = getOrCreateCtx();
      const micAn    = ctx2.createAnalyser();
      micAn.fftSize  = 256;
      micAn.smoothingTimeConstant = 0.8;
      ctx2.createMediaStreamSource(micStream).connect(micAn);
      micAnalyserRef.current = micAn;

      // Data channel
      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.onopen    = () => setStatus("listening");
      dc.onmessage = (e) => { try { handleEvent(JSON.parse(e.data)); } catch { /* skip */ } };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          setStatus("error");
          setErrMsg("Connection lost.");
          aiAnalyserRef.current  = null;
          micAnalyserRef.current = null;
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpRes = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        headers: { Authorization: `Bearer ${data.clientSecret}`, "Content-Type": "application/sdp" },
        body: offer.sdp!,
      });

      if (!sdpRes.ok) {
        setStatus("error"); setErrMsg(`SDP error ${sdpRes.status}`); pc.close(); return;
      }
      await pc.setRemoteDescription({ type: "answer", sdp: await sdpRes.text() });

    } catch (err: unknown) {
      setStatus("error");
      setErrMsg(err instanceof Error ? err.message : "Unknown error");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, voice]);

  function handleEvent(evt: Record<string, unknown>) {
    const t = evt.type as string;
    if (t === "input_audio_buffer.speech_started")             setStatus("listening");
    if (t === "input_audio_transcription.delta")               addMsg("user",      (evt.delta as string) ?? "");
    if (t === "response.audio_transcript.delta")               addMsg("assistant", (evt.delta as string) ?? "");
    if (t === "response.audio.started")                        setStatus("speaking");
    if (t === "response.audio.done" || t === "response.done")  setStatus("listening");
    if (t === "error") {
      setStatus("error");
      setErrMsg(String((evt.error as Record<string, unknown>)?.message ?? "API error"));
    }
  }

  const fmtTime = (ms: number) =>
    `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;

  const isActive = status === "listening" || status === "speaking" || status === "connecting";

  return (
    <div style={{ width: "100%", maxWidth: 440, display: "flex", flexDirection: "column", alignItems: "center" }}>

      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase",
          color: "var(--indigo)", background: "var(--indigo-lt)",
          border: "1px solid #C7D2FE", borderRadius: 99,
          padding: "4px 12px", marginBottom: 16,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--indigo)" }} />
          Meridian Wellness Clinic
        </div>
        <h1 style={{
          fontSize: 26, fontWeight: 600, letterSpacing: "-0.6px",
          color: "var(--ink)", lineHeight: 1.2,
        }}>
          AI Receptionist
        </h1>
        <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 6 }}>
          Book appointments by voice · Powered by OpenAI Realtime
        </p>
      </div>

      {/* Orb */}
      <AudioBlobOrb
        statusRef={statusRef}
        aiAnalyserRef={aiAnalyserRef}
        micAnalyserRef={micAnalyserRef}
      />

      {/* Status */}
      <div style={{ height: 24, display: "flex", alignItems: "center", marginTop: 8, marginBottom: 4 }}>
        {status === "idle"       && <span style={{ fontSize: 13, color: "var(--ink-3)" }}>Ready to connect</span>}
        {status === "connecting" && (
          <span style={{ fontSize: 13, color: "var(--ink-2)", display: "flex", alignItems: "center", gap: 2 }}>
            Connecting
            <span style={{ marginLeft: 5, display: "flex", gap: 3 }}>
              {[0,1,2].map(i => (
                <span key={i} className="blink-dot" style={{
                  display: "inline-block", width: 4, height: 4,
                  borderRadius: "50%", background: "var(--ink-3)",
                  animationDelay: `${i * 0.2}s`,
                }} />
              ))}
            </span>
          </span>
        )}
        {status === "listening" && (
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--green)" }}>
            Listening — speak now
          </span>
        )}
        {status === "speaking"  && (
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--indigo)" }}>
            Aria is speaking
          </span>
        )}
        {status === "limited"   && <span style={{ fontSize: 13, fontWeight: 500, color: "var(--red)" }}>Demo limit reached</span>}
        {status === "error"     && <span style={{ fontSize: 12, color: "var(--red)" }}>{errMsg}</span>}
      </div>

      {/* Hint */}
      {(status === "idle" || status === "connecting") && (
        <p style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 20, textAlign: "center" }}>
          Say "I'd like to book an appointment" to get started
        </p>
      )}
      {isActive && <div style={{ height: 20 }} />}

      {/* Rate bar */}
      {remainingMs !== null && (
        <div style={{ width: "100%", marginBottom: 16 }}>
          <RateBar remainingMs={remainingMs} limitMs={limitMs} fmtTime={fmtTime} />
        </div>
      )}

      {/* Controls */}
      <div style={{ display: "flex", gap: 10, width: "100%" }}>
        <div style={{ flex: 1, position: "relative" }}>
          <select
            value={voice}
            onChange={e => setVoice(e.target.value)}
            disabled={isActive}
            style={{
              width: "100%", padding: "10px 32px 10px 12px",
              borderRadius: 10, fontSize: 13, outline: "none",
              appearance: "none", cursor: isActive ? "not-allowed" : "pointer",
              background: "var(--surface)", border: "1px solid var(--border)",
              color: isActive ? "var(--ink-3)" : "var(--ink)",
              transition: "border-color 0.15s",
            }}
          >
            {VOICES.map(v => (
              <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>
            ))}
          </select>
          <svg style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
            width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 4l4 4 4-4" stroke="var(--ink-3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        {status === "idle" || status === "error" ? (
          <button onClick={connect} style={{
            flex: 1.4, padding: "10px 18px", borderRadius: 10, border: "none",
            fontSize: 13, fontWeight: 600, cursor: "pointer",
            background: "var(--indigo)", color: "#fff",
            boxShadow: "0 1px 3px rgba(91,92,246,0.3), 0 0 0 0 rgba(91,92,246,0.2)",
            transition: "box-shadow 0.2s, transform 0.1s",
          }}>
            Start Session
          </button>
        ) : status === "limited" ? (
          <button disabled style={{
            flex: 1.4, padding: "10px 18px", borderRadius: 10,
            fontSize: 13, fontWeight: 600, cursor: "not-allowed",
            background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--ink-3)",
          }}>
            Limit Reached
          </button>
        ) : (
          <button onClick={disconnect} style={{
            flex: 1.4, padding: "10px 18px", borderRadius: 10,
            fontSize: 13, fontWeight: 600, cursor: "pointer",
            background: "var(--red-lt)", border: "1px solid #FECACA", color: "var(--red)",
            transition: "background 0.15s",
          }}>
            End Session
          </button>
        )}
      </div>

      {/* Transcript */}
      <div style={{ width: "100%", marginTop: 14 }}>
        <Transcript msgs={msgs} />
      </div>

      {/* Footer */}
      <div style={{ marginTop: 20, width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
        <p style={{ fontSize: 12, color: "var(--ink-3)" }}>
          5 min / IP / hr &nbsp;·&nbsp; No data stored &nbsp;·&nbsp; Mic required
        </p>
        <p style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-2)", letterSpacing: "-0.1px" }}>
          Built by&nbsp;
          <span style={{ color: "var(--indigo)", fontWeight: 700 }}>Nilesh Patil</span>
        </p>
      </div>
    </div>
  );
}
