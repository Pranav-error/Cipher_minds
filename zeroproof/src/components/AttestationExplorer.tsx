'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Lock, Key, Hash, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';

export type AttestationData = {
  grantToken?: string;
  challengeHash?: string;
  nonce?: string;
  timestamp?: number;
  assertionClientDataJSON?: string;
  layers?: { label: string; status: string; reason?: string }[];
};

interface Props {
  data: AttestationData;
}

function decodeGrantToken(token: string) {
  try {
    const [payloadB64] = token.split('.');
    const json = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    return json;
  } catch {
    return null;
  }
}

function decodeClientDataJSON(b64: string) {
  try {
    return JSON.parse(atob(b64.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

function Section({ title, icon, children, defaultOpen = false }: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-zinc-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 w-full px-3 py-2 bg-zinc-800 text-xs font-semibold text-zinc-300 hover:bg-zinc-750 text-left"
      >
        {open ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
        {icon}
        {title}
      </button>
      {open && (
        <div className="px-3 py-2 bg-zinc-900 space-y-1.5 font-mono text-xs">
          {children}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, mono = true, highlight }: { label: string; value: string; mono?: boolean; highlight?: 'green' | 'red' | 'blue' }) {
  return (
    <div className="flex gap-2 items-start">
      <span className="shrink-0 text-zinc-500 w-36">{label}</span>
      <span className={cn(
        'break-all',
        !highlight && 'text-zinc-300',
        highlight === 'green' && 'text-emerald-300',
        highlight === 'red' && 'text-red-300',
        highlight === 'blue' && 'text-blue-300',
        mono && 'font-mono',
      )}>{value}</span>
    </div>
  );
}

export function AttestationExplorer({ data }: Props) {
  const grantPayload = data.grantToken ? decodeGrantToken(data.grantToken) : null;
  const clientData = data.assertionClientDataJSON ? decodeClientDataJSON(data.assertionClientDataJSON) : null;

  if (!data.grantToken && !data.challengeHash) {
    return (
      <div className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-6 text-center text-xs text-zinc-500">
        Send a message to inspect the cryptographic proof chain
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-900 overflow-hidden">
      <div className="border-b border-zinc-700 px-4 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Cryptographic Proof Chain
        </span>
      </div>
      <div className="p-3 space-y-2">

        {grantPayload && (
          <Section title="Layer 0 — Capability Grant Token" icon={<Shield className="h-3 w-3 text-blue-400" />} defaultOpen>
            <Row label="session_id" value={grantPayload.sessionId ?? '—'} />
            <Row label="capabilities" value={(grantPayload.granted ?? []).join(', ')} mono={false} highlight="blue" />
            <Row label="issued_at" value={grantPayload.issuedAt ? new Date(grantPayload.issuedAt).toISOString() : '—'} />
            <Row label="expires_at" value={grantPayload.expiresAt ? new Date(grantPayload.expiresAt).toISOString() : '—'} />
            <Row label="token_sig" value={data.grantToken ? data.grantToken.split('.')[1]?.slice(0, 32) + '…' : '—'} highlight="green" />
          </Section>
        )}

        {(data.challengeHash || data.nonce) && (
          <Section title="Layer 1 — Prompt Binding" icon={<Hash className="h-3 w-3 text-yellow-400" />} defaultOpen>
            {data.challengeHash && <Row label="challenge_hash" value={data.challengeHash.slice(0, 48) + '…'} highlight="blue" />}
            {data.nonce && <Row label="nonce (single-use)" value={data.nonce} highlight="green" />}
            {data.timestamp && <Row label="timestamp" value={new Date(data.timestamp).toISOString()} />}
          </Section>
        )}

        {clientData && (
          <Section title="WebAuthn Assertion" icon={<Key className="h-3 w-3 text-purple-400" />}>
            <Row label="type" value={clientData.type ?? '—'} />
            <Row label="origin" value={clientData.origin ?? '—'} highlight="green" />
            <Row label="challenge" value={(clientData.challenge ?? '').slice(0, 32) + '…'} highlight="blue" />
            <Row label="crossOrigin" value={String(clientData.crossOrigin ?? false)} highlight={clientData.crossOrigin ? 'red' : 'green'} />
          </Section>
        )}

        {data.layers && (
          <Section title="Layer Verification Results" icon={<Lock className="h-3 w-3 text-emerald-400" />} defaultOpen>
            {data.layers.map((l, i) => (
              <Row
                key={i}
                label={l.label}
                value={`${l.status.toUpperCase()}${l.reason ? ' — ' + l.reason : ''}`}
                highlight={l.status === 'pass' ? 'green' : l.status === 'fail' ? 'red' : undefined}
              />
            ))}
          </Section>
        )}
      </div>
    </div>
  );
}
