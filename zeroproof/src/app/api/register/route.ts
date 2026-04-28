// WebAuthn registration endpoints.
// POST /api/register/options  → generate registration options
// POST /api/register/verify   → verify and store credential

import { NextRequest, NextResponse } from 'next/server';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { saveCredential, saveChallenge, consumeChallenge } from '@/lib/sessionStore';

const RP_NAME = 'ZeroProof';
const RP_ID = process.env.RP_ID ?? 'localhost';
const ORIGIN = process.env.NEXT_PUBLIC_ORIGIN ?? 'http://localhost:3000';

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const action = url.searchParams.get('action') ?? 'options';

  if (action === 'options') {
    const { userId, username } = await req.json();

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userName: username ?? userId,
      userID: new TextEncoder().encode(userId),
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    // Store challenge for verification
    saveChallenge(`reg:${userId}`, options.challenge);

    return NextResponse.json(options);
  }

  if (action === 'verify') {
    const { userId, response } = await req.json();
    const expectedChallenge = consumeChallenge(`reg:${userId}`);
    if (!expectedChallenge) {
      return NextResponse.json({ error: 'No challenge found' }, { status: 400 });
    }

    try {
      const verification = await verifyRegistrationResponse({
        response,
        expectedChallenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
      });

      if (!verification.verified || !verification.registrationInfo) {
        return NextResponse.json({ error: 'Verification failed' }, { status: 400 });
      }

      const { credential } = verification.registrationInfo;

      saveCredential({
        credentialId: Buffer.from(credential.id).toString('base64url'),
        publicKey: credential.publicKey,
        counter: credential.counter,
        userId,
        createdAt: Date.now(),
      });

      return NextResponse.json({ verified: true, credentialId: Buffer.from(credential.id).toString('base64url') });
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 400 });
    }
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
