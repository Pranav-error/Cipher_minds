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
import { getGrant } from '@/lib/sessionStore';
import * as ed from '@noble/ed25519';

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const action = url.searchParams.get('action') ?? 'verify';

  if (action === 'register') {
    // Register a simulated agent with its public key
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
    const { sessionId, chain } = await req.json() as {
      sessionId: string;
      chain: AttestationLink[];
    };

    const grant = getGrant(sessionId);
    if (!grant) {
      return NextResponse.json({
        valid: false,
        layer: 2,
        reason: 'Session grant not found or expired',
      }, { status: 400 });
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

  // Utility: generate agent keypair (for demo setup)
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
