import { NextRequest, NextResponse } from "next/server";

const store = new Map<string, { usedMs: number; windowStart: number }>();
const WINDOW_MS = 60 * 60 * 1000;
const LIMIT_MS  = 5 * 60 * 1000;

const SYSTEM_PROMPT = `You are Aria, a friendly and professional AI receptionist at Meridian Wellness Clinic. Your only role is to help callers book, reschedule, or cancel appointments. Keep each reply to one or two sentences — this is a voice call, not a text chat.

Booking flow — collect in this order:
1. Full name
2. Appointment type: new patient consultation, follow-up visit, specialist referral, or lab work
3. Preferred date — if the caller is unsure, suggest tomorrow, this Thursday, or next Monday
4. Time preference: morning (9 to noon), afternoon (noon to 5), or evening (5 to 7)
5. Best callback number for confirmation

After collecting all five details, read them back clearly and ask "Shall I go ahead and book that?" Wait for confirmation before finalising.

If asked about pricing or availability, say: "Our front desk team will share all the details in your confirmation call."
If the caller asks about anything unrelated to appointments, politely redirect them.

Begin the call with: "Thank you for calling Meridian Wellness Clinic, this is Aria. How can I help you today?"`;

function getIP(req: NextRequest) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

export async function GET(req: NextRequest) {
  const ip = getIP(req);
  const now = Date.now();
  const entry = store.get(ip);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    return NextResponse.json({ usedMs: 0, remainingMs: LIMIT_MS, limitMs: LIMIT_MS });
  }
  return NextResponse.json({
    usedMs: entry.usedMs,
    remainingMs: Math.max(0, LIMIT_MS - entry.usedMs),
    limitMs: LIMIT_MS,
  });
}

export async function POST(req: NextRequest) {
  const ip  = getIP(req);
  const now = Date.now();

  for (const [k, v] of store.entries()) {
    if (now - v.windowStart > WINDOW_MS) store.delete(k);
  }

  const entry = store.get(ip) ?? { usedMs: 0, windowStart: now };
  if (now - entry.windowStart > WINDOW_MS) { entry.usedMs = 0; entry.windowStart = now; }

  if (LIMIT_MS - entry.usedMs <= 0) {
    const resetIn = Math.ceil((WINDOW_MS - (now - entry.windowStart)) / 60000);
    return NextResponse.json(
      { error: `Demo limit reached. Try again in ~${resetIn} min.` },
      { status: 429 }
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY not set" }, { status: 500 });

  const body  = await req.json().catch(() => ({}));
  const voice = (body.voice as string) || "shimmer";

  const oaiRes = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      session: {
        type: "realtime",
        model: "gpt-realtime-2",
        audio: { output: { voice } },
        instructions: SYSTEM_PROMPT,
      },
    }),
  });

  if (!oaiRes.ok) {
    return NextResponse.json({ error: await oaiRes.text() }, { status: oaiRes.status });
  }

  const data = await oaiRes.json();
  entry.usedMs += 60_000;
  store.set(ip, entry);

  return NextResponse.json({
    clientSecret: data.value,
    remainingMs: Math.max(0, LIMIT_MS - entry.usedMs),
    limitMs: LIMIT_MS,
  });
}
