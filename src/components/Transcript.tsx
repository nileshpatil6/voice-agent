"use client";

import { useEffect, useRef } from "react";
import { Msg } from "./VoiceAgent";

export function Transcript({ msgs }: { msgs: Msg[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  if (msgs.length === 0) {
    return (
      <div style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: 12, minHeight: 80,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <p style={{ fontSize: 13, color: "var(--ink-3)" }}>Conversation will appear here</p>
      </div>
    );
  }

  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: 12, maxHeight: 220, overflowY: "auto",
      padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10,
    }}>
      {msgs.map(m => (
        <div key={m.id} className="transcript-entry"
          style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
          <span style={{
            flexShrink: 0, fontSize: 10, fontWeight: 600,
            fontFamily: "monospace", letterSpacing: "0.04em", marginTop: 1,
            padding: "2px 5px", borderRadius: 4,
            background: m.role === "assistant" ? "var(--indigo-lt)" : "var(--surface-2)",
            color: m.role === "assistant" ? "var(--indigo)" : "var(--ink-2)",
            border: m.role === "assistant" ? "1px solid #C7D2FE" : "1px solid var(--border)",
          }}>
            {m.role === "assistant" ? "ARIA" : "YOU"}
          </span>
          <p style={{
            fontSize: 13, lineHeight: 1.5,
            color: m.role === "assistant" ? "var(--ink)" : "var(--ink-2)",
          }}>
            {m.text}
          </p>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
