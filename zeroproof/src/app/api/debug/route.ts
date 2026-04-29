import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  return NextResponse.json({
    host: req.headers.get('host'),
    xForwardedHost: req.headers.get('x-forwarded-host'),
    RP_ID: process.env.RP_ID ?? null,
    NEXT_PUBLIC_ORIGIN: process.env.NEXT_PUBLIC_ORIGIN ?? null,
    derivedRpId: process.env.RP_ID ?? (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'localhost').split(':')[0],
  });
}
