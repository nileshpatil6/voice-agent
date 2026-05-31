import { VoiceAgent } from "@/components/VoiceAgent";

export default function Home() {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-5 py-10"
      style={{ background: "var(--bg)" }}>
      <VoiceAgent />
    </main>
  );
}
