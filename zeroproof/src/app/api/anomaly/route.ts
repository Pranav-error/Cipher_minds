// Anomaly detection: tracks failed proof rates per session and globally.
// POST /api/anomaly/record  → record a verification attempt
// GET  /api/anomaly/status  → get current anomaly status

import { NextRequest, NextResponse } from 'next/server';

interface SessionStats {
  attempts: number;
  failures: number;
  lastFailure?: number;
  flagged: boolean;
}

const stats = new Map<string, SessionStats>();
let globalFailures = 0;
let globalAttempts = 0;

const FAILURE_RATE_THRESHOLD = 0.5;  // 50% failure rate triggers flag
const MIN_ATTEMPTS_TO_FLAG = 3;

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const action = url.searchParams.get('action') ?? 'record';

  if (action === 'record') {
    const { sessionId, success, layer, reason } = await req.json() as {
      sessionId: string;
      success: boolean;
      layer: number;
      reason?: string;
    };

    globalAttempts++;
    if (!success) globalFailures++;

    let s = stats.get(sessionId) ?? { attempts: 0, failures: 0, flagged: false };
    s.attempts++;
    if (!success) {
      s.failures++;
      s.lastFailure = Date.now();
    }

    const failRate = s.failures / s.attempts;
    if (s.attempts >= MIN_ATTEMPTS_TO_FLAG && failRate >= FAILURE_RATE_THRESHOLD) {
      s.flagged = true;
    }

    stats.set(sessionId, s);

    return NextResponse.json({
      recorded: true,
      sessionFlagged: s.flagged,
      sessionFailureRate: failRate,
    });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get('sessionId');

  const globalRate = globalAttempts > 0 ? globalFailures / globalAttempts : 0;
  const sessionStats = sessionId ? stats.get(sessionId) : undefined;

  return NextResponse.json({
    global: {
      attempts: globalAttempts,
      failures: globalFailures,
      failureRate: globalRate,
      alert: globalRate > 0.3 && globalAttempts > 10,
    },
    session: sessionStats ?? null,
  });
}
