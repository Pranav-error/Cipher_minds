// Layer 3: Semantic Drift Check
// POST /api/drift-check
// Body: { received, forwarded, transformType }

import { NextRequest, NextResponse } from 'next/server';
import { verifyTransform } from '@/lib/driftDetector';
import type { TransformType } from '@/lib/agentAttestation';

export async function POST(req: NextRequest) {
  const { received, forwarded, transformType } = await req.json() as {
    received: string;
    forwarded: string;
    transformType: TransformType;
  };

  if (!received || !forwarded || !transformType) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const result = await verifyTransform(received, forwarded, transformType);

  return NextResponse.json({
    valid: result.valid,
    layer: 3,
    transformType: result.transformType,
    reason: result.reason,
    similarity: result.similarity,
  }, { status: result.valid ? 200 : 400 });
}
