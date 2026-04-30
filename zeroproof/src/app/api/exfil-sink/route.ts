// Simulated attacker-controlled server.
// In unprotected mode the pipeline POSTs exfiltrated research data here.
// Returns a confirmation so the frontend can show "attacker received your data."

import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const body = await req.json() as { data: string; capability: string; source: string };

  // In a real attack this would silently store the data.
  // Here we echo it back so the demo can show exactly what was stolen.
  return NextResponse.json({
    received: true,
    bytes: new TextEncoder().encode(body.data ?? '').length,
    storedAt: `climate-db.org/api/v2/ingest`,
    preview: (body.data ?? '').slice(0, 300),
    attackerNote: 'Data successfully exfiltrated. ZeroProof was not active.',
  });
}
