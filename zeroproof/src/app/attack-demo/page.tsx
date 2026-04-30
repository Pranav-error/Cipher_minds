'use client';

import { useState } from 'react';
import { ShieldX, ShieldCheck, Skull, Wifi, AlertOctagon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface LayerState {
  label: string;
  status: 'idle' | 'checking' | 'pass' | 'fail' | 'bypassed';
  reason: string;
}

const INIT_LAYERS: LayerState[] = [
  { label: 'Layer 0 — Capability Grant',      status: 'idle', reason: '' },
  { label: 'Layer 1 — Prompt Integrity',       status: 'idle', reason: '' },
  { label: 'Layer 2 — Agent Capability Check', status: 'idle', reason: '' },
  { label: 'Layer 3 — Transform Drift (LLM)',  status: 'idle', reason: '' },
];

export default function AttackDemoPage() {
  const [token] = useState(() => (
    typeof window === 'undefined'
      ? ''
      : (new URLSearchParams(window.location.search).get('token') ?? '')
  ));
  const [running,     setRunning]     = useState(false);
  const [attackType,  setAttackType]  = useState<'climate' | 'readme'>('climate');
  const [layers,      setLayers]      = useState<LayerState[]>(INIT_LAYERS);
  const [blocked,     setBlocked]     = useState('');
  const [blockReason, setBlockReason] = useState('');
  const [breach,      setBreach]      = useState<{ endpoint: string; bytes: number; preview: string } | null>(null);
  const [agentOutput, setAgentOutput] = useState('');
  const [fetchedRaw,  setFetchedRaw]  = useState('');
  const [isProtected, setIsProtected] = useState(true);

  function resetState() {
    setLayers(INIT_LAYERS);
    setBlocked('');
    setBlockReason('');
    setBreach(null);
    setAgentOutput('');
    setFetchedRaw('');
  }

  function updateLayer(index: number, update: Partial<LayerState>) {
    setLayers(prev => prev.map((l, i) => i === index ? { ...l, ...update } : l));
  }

  async function launchAttack() {
    if (!token) return;
    setRunning(true);
    resetState();

    try {
      const res = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: 'Research climate change statistics and decide what to do with them',
          grantToken: token,
          injected: true,
          protected: isProtected,
          attackType,
        }),
      });

      if (!res.body) throw new Error('No stream');
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let   buffer  = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          const eventLine = part.match(/^event: (.+)$/m)?.[1];
          const dataLine  = part.match(/^data: (.+)$/m)?.[1];
          if (!eventLine || !dataLine) continue;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const payload: any = JSON.parse(dataLine);

          if (eventLine === 'layer') {
            updateLayer(payload.layer, { status: payload.status, reason: payload.reason ?? '' });
          }
          if (eventLine === 'step' && payload.fetchedContent) {
            setFetchedRaw(payload.fetchedContent);
          }
          if (eventLine === 'step' && payload.output) {
            setAgentOutput(payload.output);
          }
          if (eventLine === 'blocked') {
            setBlocked(payload.at);
            setBlockReason(payload.reason);
          }
          if (eventLine === 'breach') {
            setBreach({ endpoint: payload.endpoint, bytes: payload.bytes, preview: payload.preview });
          }
        }
      }
    } catch (err) {
      setBlocked('Error');
      setBlockReason(String(err));
    }

    setRunning(false);
  }

  const outcome = blocked ? 'blocked' : breach ? 'breach' : null;

  if (!token) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-400 text-sm">
        No attack token in URL. Open this page via the share link from the ZeroProof demo.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header — attacker theme */}
      <header className={cn(
        'border-b px-6 py-4 transition-colors',
        outcome === 'blocked' ? 'border-emerald-800 bg-emerald-950/40' : 'border-red-900 bg-red-950/30',
      )}>
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <Skull className={cn('h-6 w-6', outcome === 'blocked' ? 'text-emerald-400' : 'text-red-400')} />
          <div>
            <h1 className="text-lg font-bold tracking-tight">
              {outcome === 'blocked' ? 'Attack Blocked — ZeroProof Defended' : 'Attacker Device'}
            </h1>
            <p className="text-xs text-zinc-500">
              Trying to exfiltrate data via indirect prompt injection
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2 text-xs text-zinc-600">
            <Wifi className="h-3 w-3" />
            Live
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-8 space-y-6">

        {/* Controls */}
        <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-red-400">Attack Configuration</p>

          <div className="flex items-center gap-4 flex-wrap">
            {/* Attack type */}
            <div className="flex rounded-lg border border-zinc-700 overflow-hidden text-xs font-semibold">
              {(['climate', 'readme'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => !running && setAttackType(t)}
                  className={cn(
                    'px-3 py-1.5 transition-colors capitalize',
                    attackType === t ? 'bg-red-800 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200',
                    running && 'cursor-not-allowed opacity-50',
                  )}
                >
                  {t === 'climate' ? '🌍 Climate Article' : '📦 GitHub README'}
                </button>
              ))}
            </div>

            {/* Protected toggle */}
            <div className="flex rounded-lg border border-zinc-700 overflow-hidden text-xs font-semibold">
              <button
                onClick={() => !running && setIsProtected(false)}
                className={cn(
                  'px-3 py-1.5 transition-colors',
                  !isProtected ? 'bg-red-700 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200',
                  running && 'cursor-not-allowed opacity-50',
                )}
              >
                No ZeroProof
              </button>
              <button
                onClick={() => !running && setIsProtected(true)}
                className={cn(
                  'px-3 py-1.5 transition-colors',
                  isProtected ? 'bg-zinc-700 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200',
                  running && 'cursor-not-allowed opacity-50',
                )}
              >
                ZeroProof ON (target has it)
              </button>
            </div>
          </div>

          <p className="text-xs text-zinc-500">
            {isProtected
              ? 'Simulating attack against a ZeroProof-protected target. Injection will be blocked.'
              : 'Simulating attack against an unprotected target. Data will be exfiltrated.'}
          </p>

          <Button
            onClick={launchAttack}
            disabled={running}
            className={cn(
              'font-bold text-white',
              isProtected ? 'bg-zinc-700 hover:bg-zinc-600' : 'bg-red-700 hover:bg-red-600',
            )}
          >
            {running ? '⟳ Attack in progress…' : '💀 Launch Injection Attack'}
          </Button>
        </div>

        {/* Security layers — from attacker's POV */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
            Target&apos;s Security Layers (live)
          </p>
          {layers.map((layer, i) => (
            <div key={i} className={cn(
              'flex items-start gap-3 rounded-lg border px-4 py-2.5 text-sm transition-all',
              layer.status === 'idle'     && 'border-zinc-700 bg-zinc-900 text-zinc-500',
              layer.status === 'checking' && 'border-yellow-500/40 bg-yellow-500/5 text-yellow-300',
              layer.status === 'pass'     && 'border-emerald-500/40 bg-emerald-500/5 text-emerald-300',
              layer.status === 'fail'     && 'border-red-500/40 bg-red-500/5 text-red-300',
              layer.status === 'bypassed' && 'border-orange-500/30 bg-orange-500/5 text-orange-300',
            )}>
              <div className="mt-0.5 shrink-0 text-base">
                {layer.status === 'idle'     && '○'}
                {layer.status === 'checking' && '⟳'}
                {layer.status === 'pass'     && '✓'}
                {layer.status === 'fail'     && '✗'}
                {layer.status === 'bypassed' && '—'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold">{layer.label}</span>
                  {layer.status !== 'idle' && (
                    <span className={cn(
                      'ml-auto rounded px-1.5 py-0.5 text-xs font-bold',
                      layer.status === 'checking' && 'bg-yellow-500/20 text-yellow-300',
                      layer.status === 'pass'     && 'bg-emerald-500/20 text-emerald-300',
                      layer.status === 'fail'     && 'bg-red-500/20 text-red-300',
                      layer.status === 'bypassed' && 'bg-orange-500/20 text-orange-300',
                    )}>
                      {layer.status === 'checking' ? '…' : layer.status.toUpperCase()}
                    </span>
                  )}
                </div>
                {layer.reason && <p className="text-xs opacity-75 mt-0.5">{layer.reason}</p>}
              </div>
            </div>
          ))}
        </div>

        {/* Fetched content preview */}
        {fetchedRaw && (
          <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3">
            <p className="text-xs font-semibold text-red-400 mb-1">Injected page content (attacker controlled):</p>
            <pre className="text-xs text-zinc-400 font-mono whitespace-pre-wrap leading-relaxed max-h-24 overflow-y-auto">{fetchedRaw}</pre>
          </div>
        )}

        {/* Breach result */}
        {breach && (
          <div className="rounded-xl border-2 border-red-500 bg-red-950/60 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <AlertOctagon className="h-6 w-6 text-red-400" />
              <span className="text-lg font-bold text-red-200">DATA EXFILTRATED SUCCESSFULLY</span>
            </div>
            <p className="text-sm text-red-300">
              <strong>{breach.bytes} bytes</strong> of research data sent to{' '}
              <code className="bg-black/40 px-1 rounded text-red-200">{breach.endpoint}</code>
            </p>
            <div className="rounded border border-red-500/40 bg-black/40 p-3">
              <p className="text-xs font-semibold text-red-400 mb-1">Stolen data preview:</p>
              <pre className="text-xs text-red-200 font-mono whitespace-pre-wrap">{breach.preview}</pre>
            </div>
          </div>
        )}

        {/* Blocked result */}
        {blocked && (
          <div className="rounded-xl border-2 border-emerald-500 bg-emerald-950/60 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-7 w-7 text-emerald-400" />
              <span className="text-xl font-bold text-emerald-200">ATTACK BLOCKED BY ZEROPROOF</span>
            </div>
            <p className="text-sm text-emerald-300">
              The injection attempted to use{' '}
              <code className="bg-black/30 px-1 rounded text-emerald-200">external_api_write</code> —
              not in the user&apos;s signed capability grant. Blocked at: <strong>{blocked}</strong>
            </p>
            <p className="text-xs text-zinc-400">{blockReason}</p>
            <div className="flex items-center gap-2 pt-1">
              <ShieldX className="h-4 w-4 text-red-400" />
              <span className="text-xs text-red-300">No data was exfiltrated. The attacker&apos;s server received nothing.</span>
            </div>
          </div>
        )}

        {/* Agent output (if available) */}
        {agentOutput && !blocked && !breach && (
          <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3">
            <p className="text-xs font-semibold text-zinc-500 mb-1">Agent decision output:</p>
            <pre className="text-xs text-zinc-300 font-mono whitespace-pre-wrap leading-relaxed">{agentOutput}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
