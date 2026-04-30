'use client';

import { useState } from 'react';
import { Bot, Globe, ShieldCheck, ShieldX, Database, AlertOctagon, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LayerStatusPanel, type LayerStatus } from './LayerStatusPanel';
import { cn } from '@/lib/utils';
import type { ThreatEvent } from './ThreatLog';

interface Props {
  sessionId: string;
  grantToken: string;
  grantedCapabilities: string[];
  onThreat?: (event: ThreatEvent) => void;
}

interface PipelineStep {
  agent: string;
  status: 'idle' | 'running' | 'pass' | 'fail';
  detail: string;
  output?: string;
  capability?: string;
  capabilityInGrant?: boolean;
}

interface BreachData {
  endpoint: string;
  bytes: number;
  preview: string;
  capability: string;
}

const INIT_LAYERS: LayerStatus[] = [
  { label: 'Layer 0', description: 'Capability Grant',      status: 'pass', reason: 'Signed at session start' },
  { label: 'Layer 1', description: 'Prompt Integrity',      status: 'idle' },
  { label: 'Layer 2', description: 'Agent Capability Check',status: 'idle' },
  { label: 'Layer 3', description: 'Transform Drift (LLM)', status: 'idle' },
];

const ATTACK_LABELS: Record<string, { label: string; icon: React.ReactNode; hint: string; viewHref: string }> = {
  climate: {
    label: 'Climate Article',
    icon:  <Globe className="h-3.5 w-3.5" />,
    hint:  'Attacker page looks like a legitimate climate report. Injection in "Data Licensing" section.',
    viewHref: '/attacker',
  },
  readme: {
    label: 'GitHub README',
    icon:  <BookOpen className="h-3.5 w-3.5" />,
    hint:  'Attacker page looks like a real npm package README. Injection in "Configuration" section.',
    viewHref: '/attacker-readme',
  },
};

export function AgentPipelineDemo({ grantToken, grantedCapabilities, onThreat }: Props) {
  const [running,     setRunning]     = useState(false);
  const [injected,    setInjected]    = useState(true);
  const [isProtected, setIsProtected] = useState(true);
  const [attackType,  setAttackType]  = useState<'climate' | 'readme'>('climate');
  const [steps,       setSteps]       = useState<PipelineStep[]>([]);
  const [blocked,     setBlocked]     = useState('');
  const [blockReason, setBlockReason] = useState('');
  const [finalOutput, setFinalOutput] = useState('');
  const [fetchedRaw,  setFetchedRaw]  = useState('');
  const [layers,      setLayers]      = useState<LayerStatus[]>(INIT_LAYERS);
  const [breach,      setBreach]      = useState<BreachData | null>(null);

  function reset() {
    setSteps([]);
    setBlocked('');
    setBlockReason('');
    setFinalOutput('');
    setFetchedRaw('');
    setBreach(null);
    setLayers(INIT_LAYERS);
  }

  function updateLayer(index: number, update: Partial<LayerStatus>) {
    setLayers(prev => prev.map((l, i) => i === index ? { ...l, ...update } : l));
  }

  function upsertStep(agent: string, update: Partial<PipelineStep>) {
    setSteps(prev => {
      const existing = prev.findIndex(s => s.agent === agent);
      if (existing >= 0) {
        const next = [...prev];
        next[existing] = { ...next[existing], ...update };
        return next;
      }
      return [...prev, { agent, status: 'idle', detail: '', ...update }];
    });
  }

  async function runPipeline() {
    setRunning(true);
    reset();

    try {
      const res = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: 'Research climate change statistics and decide what to do with them',
          grantToken,
          injected,
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

          if (eventLine === 'step') {
            upsertStep(payload.agent, {
              status:           payload.status,
              detail:           payload.detail,
              output:           payload.output,
              capability:       payload.capability,
              capabilityInGrant: payload.capabilityInGrant,
            });
            if (payload.fetchedContent) setFetchedRaw(payload.fetchedContent);
          }

          if (eventLine === 'layer') {
            updateLayer(payload.layer, { status: payload.status, reason: payload.reason });
          }

          if (eventLine === 'blocked') {
            setBlocked(payload.at);
            setBlockReason(payload.reason);
            onThreat?.({
              id: crypto.randomUUID(), timestamp: Date.now(),
              layer: 'Layer 2/3', action: 'Capability Escalation Blocked',
              status: 'blocked', reason: payload.reason,
            });
          }

          if (eventLine === 'breach') {
            setBreach(payload as BreachData);
            onThreat?.({
              id: crypto.randomUUID(), timestamp: Date.now(),
              layer: 'UNPROTECTED', action: 'Data Exfiltrated',
              status: 'blocked', reason: `${payload.bytes} bytes sent to ${payload.endpoint}`,
            });
          }

          if (eventLine === 'done') {
            setFinalOutput(payload.finalOutput ?? '');
            onThreat?.({
              id: crypto.randomUUID(), timestamp: Date.now(),
              layer: 'All Layers', action: 'Agent Pipeline',
              status: 'passed', reason: 'All 4 layers verified — real LLM pipeline complete',
            });
          }

          if (eventLine === 'error') {
            upsertStep('Pipeline', { status: 'fail', detail: payload.message });
          }
        }
      }
    } catch (err) {
      upsertStep('Pipeline', { status: 'fail', detail: String(err) });
    }

    setRunning(false);
  }

  const researchStep = steps.find(s => s.agent === 'Research Agent');
  const actionStep   = steps.find(s => s.agent === 'Action Agent');
  const attack       = ATTACK_LABELS[attackType];

  return (
    <div className="space-y-4">

      {/* ── Controls ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4 space-y-4">

        {/* Row 1: Protection mode (biggest toggle) */}
        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Protection</span>
          <div className="flex rounded-lg border border-zinc-700 overflow-hidden text-xs font-semibold">
            <button
              onClick={() => !running && setIsProtected(false)}
              className={cn(
                'px-3 py-1.5 transition-colors',
                !isProtected ? 'bg-red-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200',
                running && 'cursor-not-allowed opacity-50',
              )}
            >
              🔴 Unprotected
            </button>
            <button
              onClick={() => !running && setIsProtected(true)}
              className={cn(
                'px-3 py-1.5 transition-colors',
                isProtected ? 'bg-emerald-700 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200',
                running && 'cursor-not-allowed opacity-50',
              )}
            >
              🟢 ZeroProof ON
            </button>
          </div>
          <span className="text-xs text-zinc-500">
            {isProtected
              ? 'Layer 2 + 3 active — injection will be blocked'
              : 'No protection — agent runs freely, data will be exfiltrated'}
          </span>
        </div>

        {/* Row 2: Attack scenario + injection toggle */}
        <div className="flex items-center gap-6 flex-wrap">
          {/* Attack type */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Attack scenario</span>
            <div className="flex rounded-lg border border-zinc-700 overflow-hidden text-xs font-semibold">
              {(['climate', 'readme'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => !running && setAttackType(t)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 transition-colors',
                    attackType === t ? 'bg-blue-700 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200',
                    running && 'cursor-not-allowed opacity-50',
                  )}
                >
                  {ATTACK_LABELS[t].icon}
                  {ATTACK_LABELS[t].label}
                </button>
              ))}
            </div>
          </div>

          {/* Injection toggle */}
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <div
              onClick={() => !running && setInjected(v => !v)}
              className={cn(
                'relative h-6 w-11 rounded-full transition-colors',
                injected ? 'bg-red-500' : 'bg-zinc-600',
                running && 'opacity-50 cursor-not-allowed',
              )}
            >
              <div className={cn(
                'absolute top-1 h-4 w-4 rounded-full bg-white transition-transform',
                injected ? 'translate-x-6' : 'translate-x-1',
              )} />
            </div>
            <span className={cn('text-xs', injected ? 'text-red-300' : 'text-zinc-400')}>
              {injected ? 'Injection ON' : 'Injection OFF (clean page)'}
            </span>
          </label>
        </div>

        {/* Hint + action */}
        <div className="flex items-center gap-4 flex-wrap">
          {injected && (
            <p className="text-xs text-zinc-500 flex-1">
              {attack.hint}{' '}
              <a href={attack.viewHref} target="_blank" className="text-zinc-400 underline hover:text-zinc-200">
                View attacker page ↗
              </a>
            </p>
          )}
          <Button onClick={runPipeline} disabled={running} className={cn(
            'text-white font-semibold',
            isProtected ? 'bg-purple-600 hover:bg-purple-500' : 'bg-red-700 hover:bg-red-600',
          )}>
            {running ? '⟳ Running live pipeline…' : 'Run Agent Pipeline'}
          </Button>
        </div>
      </div>

      {/* ── Pipeline output ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-3">

          {/* ── BREACH banner (unprotected) ───────────────────────────── */}
          {breach && (
            <div className="rounded-xl border-2 border-red-500 bg-red-950/60 p-4 space-y-2 animate-pulse-once">
              <div className="flex items-center gap-2">
                <AlertOctagon className="h-5 w-5 text-red-400 shrink-0" />
                <span className="text-base font-bold text-red-200">DATA EXFILTRATED — No ZeroProof</span>
              </div>
              <p className="text-xs text-red-300">
                Agent sent <strong>{breach.bytes} bytes</strong> of research data to{' '}
                <code className="bg-black/40 px-1 rounded text-red-200">{breach.endpoint}</code>
                {' '}without user authorization. ZeroProof would have blocked this at Layer 2.
              </p>
              <div className="rounded border border-red-500/40 bg-black/40 p-3">
                <p className="text-xs font-semibold text-red-400 mb-1">What the attacker received:</p>
                <pre className="text-xs text-red-200 font-mono whitespace-pre-wrap leading-relaxed">{breach.preview}</pre>
              </div>
            </div>
          )}

          {/* Research Agent */}
          {researchStep && (
            <div className="space-y-1">
              <StepCard step={researchStep} icon={<Globe className="h-4 w-4" />} grantedCapabilities={grantedCapabilities} />

              {fetchedRaw && (
                <div className="ml-10 rounded border border-zinc-700 bg-zinc-950 p-3">
                  <p className="text-xs font-semibold text-zinc-500 mb-1">
                    Raw content fetched from{' '}
                    {injected
                      ? <span className="text-red-400">attacker-controlled URL — contains injection</span>
                      : <span className="text-emerald-400">clean URL</span>}
                    :
                  </p>
                  <pre className="text-xs text-zinc-400 font-mono whitespace-pre-wrap leading-relaxed max-h-28 overflow-y-auto">{fetchedRaw}</pre>
                </div>
              )}

              {researchStep.output && (
                <div className="ml-10 rounded border border-zinc-700 bg-zinc-900 p-3">
                  <p className="text-xs font-semibold text-zinc-500 mb-1">LLM output — Research Agent (real Groq/LLaMA call):</p>
                  <p className="text-xs text-zinc-300 leading-relaxed">{researchStep.output}</p>
                </div>
              )}
            </div>
          )}

          {researchStep && actionStep && (
            <div className="ml-4 text-zinc-600 text-xs">↓ Research output passed to Action Agent</div>
          )}
          {researchStep && !actionStep && running && !blocked && !breach && (
            <div className="ml-4 text-yellow-400 text-xs animate-pulse">↓ Waiting for Action Agent LLM call…</div>
          )}

          {/* Action Agent */}
          {actionStep && (
            <div className="space-y-1">
              <StepCard step={actionStep} icon={<Bot className="h-4 w-4" />} grantedCapabilities={grantedCapabilities} />
              {actionStep.output && (
                <div className="ml-10 rounded border border-zinc-700 bg-zinc-900 p-3">
                  <p className="text-xs font-semibold text-zinc-500 mb-1">LLM output — Action Agent (real Groq/LLaMA call):</p>
                  <p className="text-xs text-zinc-300 font-mono leading-relaxed">{actionStep.output}</p>
                </div>
              )}
            </div>
          )}

          {/* Blocked */}
          {blocked && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 flex gap-2">
              <ShieldX className="h-4 w-4 mt-0.5 shrink-0 text-red-400" />
              <div>
                <div className="text-sm font-semibold text-red-200 mb-1">ZeroProof BLOCKED — {blocked}</div>
                <div className="text-xs text-red-300">{blockReason}</div>
              </div>
            </div>
          )}

          {/* Success */}
          {finalOutput && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3">
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                <span className="text-xs font-semibold uppercase text-emerald-400">Pipeline Complete — All Layers Passed</span>
              </div>
              <p className="text-xs text-emerald-200 font-mono leading-relaxed">{finalOutput}</p>
            </div>
          )}

          {/* LLM node */}
          {steps.length > 0 && (
            <div className="flex items-center gap-2">
              <div className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
                breach        ? 'border-red-500/40 bg-red-500/10 text-red-400'
                : blocked     ? 'border-zinc-700 bg-zinc-900 text-zinc-600'
                : finalOutput ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                : 'border-zinc-700 bg-zinc-900 text-zinc-500',
              )}>
                <Database className="h-4 w-4" />
              </div>
              <div className={cn(
                'flex-1 rounded-lg border px-3 py-2 text-sm',
                breach        ? 'border-red-500/30 bg-red-500/5 text-red-200'
                : blocked     ? 'border-zinc-700 bg-zinc-900 text-zinc-500'
                : finalOutput ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-200'
                : 'border-zinc-700 bg-zinc-900 text-zinc-500',
              )}>
                <div className="font-medium">Groq / LLaMA API</div>
                <div className="text-xs opacity-75 mt-0.5">
                  {breach        ? 'Called — data sent to attacker server'
                  : blocked      ? 'Never reached — blocked by ZeroProof'
                  : finalOutput  ? 'Processed verified request'
                  : 'Waiting…'}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Layer status */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Security Layers</p>
          <LayerStatusPanel layers={layers} />

          {/* Mini legend */}
          {steps.length > 0 && (
            <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-xs text-zinc-500 space-y-1.5">
              <p className="font-semibold text-zinc-400">What each layer does:</p>
              <p><span className="text-zinc-300">L0</span> — User signs capability grant with Touch ID</p>
              <p><span className="text-zinc-300">L1</span> — WebAuthn session integrity</p>
              <p><span className="text-zinc-300">L2</span> — Agent capability vs signed grant (code check)</p>
              <p><span className="text-zinc-300">L3</span> — LLM drift monitor: did output stay on-task?</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StepCard({
  step,
  icon,
  grantedCapabilities,
}: {
  step: PipelineStep;
  icon: React.ReactNode;
  grantedCapabilities: string[];
}) {
  return (
    <div className="flex items-start gap-2">
      <div className={cn(
        'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-all',
        step.status === 'idle'    && 'border-zinc-700 bg-zinc-900 text-zinc-500',
        step.status === 'running' && 'border-yellow-500/40 bg-yellow-500/10 text-yellow-400 animate-pulse',
        step.status === 'pass'    && 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
        step.status === 'fail'    && 'border-red-500/40 bg-red-500/10 text-red-400',
      )}>
        {icon}
      </div>
      <div className={cn(
        'flex-1 rounded-lg border px-3 py-2 text-sm transition-all',
        step.status === 'idle'    && 'border-zinc-700 bg-zinc-900 text-zinc-500',
        step.status === 'running' && 'border-yellow-500/30 bg-yellow-500/5 text-yellow-200',
        step.status === 'pass'    && 'border-emerald-500/30 bg-emerald-500/5 text-emerald-200',
        step.status === 'fail'    && 'border-red-500/30 bg-red-500/5 text-red-200',
      )}>
        <div className="font-medium">{step.agent}</div>
        <div className="text-xs opacity-75 mt-0.5">{step.detail}</div>
        {step.capability && (
          <div className="text-xs mt-1">
            Capability: <code className="bg-black/30 px-1 rounded">{step.capability}</code>
            {grantedCapabilities.includes(step.capability)
              ? <span className="text-emerald-400 ml-2">✓ in grant</span>
              : <span className="text-red-400 ml-2">✗ NOT in grant → BLOCKED</span>}
          </div>
        )}
      </div>
    </div>
  );
}
