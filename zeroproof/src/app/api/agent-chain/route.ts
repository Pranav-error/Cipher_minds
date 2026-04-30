// Layer 2: Agent Chain of Custody + Capability Check
// POST /api/agent-chain/register  → register an agent keypair
// POST /api/agent-chain/verify    → verify the full attestation chain

import { NextRequest, NextResponse } from 'next/server';
import {
  verifyChain,
  registerAgent,
  type AttestationLink,
  type TransformType,
} from '@/lib/agentAttestation';
import { verifyToken, type GrantPayload } from '@/lib/tokenSession';
import * as ed from '@noble/ed25519';

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const action = url.searchParams.get('action') ?? 'verify';

  if (action === 'register') {
    const { agentId, publicKeyHex, allowedCapabilities, allowedTransforms } = await req.json();
    registerAgent({
      agentId,
      publicKey: Buffer.from(publicKeyHex, 'hex'),
      allowedCapabilities,
      allowedTransforms: allowedTransforms as TransformType[],
    });
    return NextResponse.json({ registered: true, agentId });
  }

  if (action === 'verify') {
    const { sessionId, chain, grantToken } = await req.json() as {
      sessionId: string;
      chain: AttestationLink[];
      grantToken: string;
    };

    if (!grantToken) {
      return NextResponse.json({
        valid: false,
        layer: 2,
        reason: 'Missing grantToken — pass the signed grant token from the capability grant step',
      }, { status: 400 });
    }

    // FIX: use stateless token verification instead of the in-memory getGrant()
    // which was never populated after the codebase was refactored to use signed tokens.
    const grant = await verifyToken<GrantPayload>(grantToken);
    if (!grant || grant.sessionId !== sessionId || grant.expiresAt < Date.now()) {
      return NextResponse.json({
        valid: false,
        layer: 2,
        reason: 'Grant token invalid or expired — re-authorize capabilities',
      }, { status: 401 });
    }

    const result = await verifyChain(chain, grant.granted);

    return NextResponse.json({
      valid: result.valid,
      layer: 2,
      reason: result.reason,
      failedAt: result.failedAt,
      links: result.links,
    }, { status: result.valid ? 200 : 400 });
  }

  if (action === 'keygen') {
    const privKey = ed.utils.randomSecretKey();
    const pubKey = await ed.getPublicKeyAsync(privKey);
    return NextResponse.json({
      privateKeyHex: Buffer.from(privKey).toString('hex'),
      publicKeyHex: Buffer.from(pubKey).toString('hex'),
    });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}