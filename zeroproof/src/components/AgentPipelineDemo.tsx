'use client';

import { useState } from 'react';
import { Bot, Globe, Database, ShieldCheck, ShieldX, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LayerStatusPanel, type LayerStatus } from './LayerStatusPanel';
import { AttestationExplorer, type AttestationData } from './AttestationExplorer';
import { cn } from '@/lib/utils';
import type { ThreatEvent } from './ThreatLog';

interface Props {
  sessionId: string;
  grantToken: string;
  grantedCapabilities: string[];
  onThreat?: (event: ThreatEvent) => void;
}

type PipelineStep = {
  id: string;
  label: string;
  icon: React.ReactNode;
  status: 'idle' | 'active' | 'pass' | 'fail';
  detail?: string;
};

export function AgentPipelineDemo({ sessionId, grantToken, grantedCapabilities, onThreat }: Props) {
  const [running, setRunning] = useState(false);
  const [injected, setInjected] = useState(true);
  const [fetchedContent, setFetchedContent] = useState('');
  const [attestation, setAttestation] = useState<AttestationData>({});
  const [steps, setSteps] = useState<PipelineStep[]>([
    { id: 'orchestrator', label: 'Orchestrator Agent', icon: <Bot className="h-4 w-4" />, status: 'idle' },
    { id: 'fetcher', label: 'Research Agent', icon: <Globe className="h-4 w-4" />, status: 'idle' },
    { id: 'gate', label: 'ZeroProof Gate', icon: <ShieldCheck className="h-4 w-4" />, status: 'idle' },
    { id: 'llm', label: 'LLM API', icon: <Database className="h-4 w-4" />, status: 'idle' },
  ]);
  const [layers, setLayers] = useState<LayerStatus[]>([
    { label: 'Layer 0', description: 'Capability Grant', status: 'pass', reason: 'Signed at session start' },
    { label: 'Layer 1', description: 'Prompt Integrity', status: 'idle' },
    { label: 'Layer 2', description: 'Agent Chain + Capability', status: 'idle' },
    { label: 'Layer 3', description: 'Transform Drift', status: 'idle' },
  ]);
  const [result, setResult] = useState('');
  const [blocked, setBlocked] = useState('');

  function setStep(id: string, update: Partial<PipelineStep>) {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, ...update } : s));
  }

  function setLayer(index: number, update: Partial<LayerStatus>) {
    setLayers(prev => prev.map((l, i) => i === index ? { ...l, ...update } : l));
  }

  function logEvent(event: Omit<ThreatEvent, 'id' | 'timestamp'>) {
    onThreat?.({ ...event, id: crypto.randomUUID(), timestamp: Date.now() });
  }

  function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

  async function runPipeline() {
    setRunning(true);
    setResult('');
    setBlocked('');
    setFetchedContent('');
    setSteps(prev => prev.map(s => ({ ...s, status: 'idle', detail: undefined })));
    setLayer(1, { status: 'idle', reason: undefined });
    setLayer(2, { status: 'idle', reason: undefined });
    setLayer(3, { status: 'idle', reason: undefined });

    await sleep(400);

    // Step 1: Orchestrator
    setStep('orchestrator', { status: 'active', detail: 'Task: Research climate change and summarize' });
    await sleep(600);
    setStep('orchestrator', { status: 'pass', detail: 'Delegating to Research Agent' });

    // Step 2: Research Agent — real fetch
    setStep('fetcher', { status: 'active', detail: 'Fetching from live URL... [using web_fetch_text]' });
    await sleep(500);

    const mode = injected ? 'malicious' : 'clean';
    const pageRes = await fetch(`/api/test-page?mode=${mode}`);
    const pageContent = await pageRes.text();
    setFetchedContent(pageContent);

    const isMalicious = injected;
    setStep('fetcher', {
      status: isMalicious ? 'fail' : 'pass',
      detail: isMalicious ? 'Retrieved page contains hidden injection attempt!' : 'Retrieved clean article',
    });

    await sleep(500);

    // Step 3: ZeroProof Gate
    setStep('gate', { status: 'active', detail: 'Verifying agent chain + capabilities…' });
    setLayer(1, { status: 'checking' });
    await sleep(400);
    setLayer(1, { status: 'pass', reason: 'Origin verified via WebAuthn session' });
    setLayer(2, { status: 'checking' });
    await sleep(500);

    if (isMalicious) {
      setLayer(2, {
        status: 'fail',
        reason: "Injected instruction requires 'external_api_write' — not in capability grant",
      });
      setStep('gate', { status: 'fail', detail: 'BLOCKED: Capability escalation attempt rejected' });
      setStep('llm', { status: 'fail', detail: 'Request never reached LLM' });
      const reason = "Capability 'external_api_write' not in grant. Tainted content isolated.";
      setBlocked(`Layer 2 blocked: ${reason}`);
      logEvent({ layer: 'Layer 2', action: 'Capability Check', status: 'blocked', reason });

      setAttestation({
        grantToken,
        layers: [
          { label: 'Layer 0', status: 'pass', reason: 'Signed at session start' },
          { label: 'Layer 1', status: 'pass', reason: 'Origin verified via WebAuthn session' },
          { label: 'Layer 2', status: 'fail', reason: "Injected instruction requires 'external_api_write'" },
          { label: 'Layer 3', status: 'idle' },
        ],
      });
      setRunning(false);
      return;
    }

    // Clean path
    setLayer(2, { status: 'pass', reason: 'web_fetch_text capability granted — chain intact' });
    setLayer(3, { status: 'checking' });
    await sleep(600);

    const driftRes = await fetch('/api/drift-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        received: pageContent,
        forwarded: 'Summary of climate report: CO2 at 425ppm, Arctic ice -15%, sea level +4mm/yr, solar +40%.',
        transformType: 'SUMMARIZE',
      }),
    });
    const driftData = await driftRes.json();
    setLayer(3, { status: 'pass', reason: driftData.reason });
    setStep('gate', { status: 'pass', detail: 'All layers passed — forwarding to LLM' });
    setStep('llm', { status: 'active', detail: 'Processing verified request…' });
    logEvent({ layer: 'All Layers', action: 'Agent Pipeline', status: 'passed', reason: 'All 4 layers verified' });

    await sleep(500);

    const chatRes = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Summarize the climate change data in the context.', grantToken, taintedContext: pageContent }),
    });
    const chatData = await chatRes.json();
    setStep('llm', { status: 'pass', detail: 'Response generated' });
    setResult(chatData.response ?? chatData.error);

    setAttestation({
      grantToken,
      layers: [
        { label: 'Layer 0', status: 'pass', reason: 'Signed at session start' },
        { label: 'Layer 1', status: 'pass', reason: 'Origin verified' },
        { label: 'Layer 2', status: 'pass', reason: 'web_fetch_text granted' },
        { label: 'Layer 3', status: 'pass', reason: driftData.reason },
      ],
    });
    setRunning(false);
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-4 flex-wrap">
        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <div
            onClick={() => !running && setInjected(!injected)}
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
          <span className={injected ? 'text-red-300' : 'text-zinc-400'}>
            {injected ? 'Malicious page (injection active)' : 'Clean page (no injection)'}
          </span>
        </label>
        <Button onClick={runPipeline} disabled={running} className="bg-purple-600 hover:bg-purple-500 text-white">
          {running ? 'Running…' : 'Run Agent Pipeline'}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-3">
          {/* Pipeline steps */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Agent Pipeline</p>
            {steps.map((step, i) => (
              <div key={step.id} className="flex items-start gap-2">
                <div className={cn(
                  'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-all',
                  step.status === 'idle' && 'border-zinc-700 bg-zinc-900 text-zinc-500',
                  step.status === 'active' && 'border-yellow-500/40 bg-yellow-500/10 text-yellow-400',
                  step.status === 'pass' && 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
                  step.status === 'fail' && 'border-red-500/40 bg-red-500/10 text-red-400',
                )}>
                  {step.icon}
                </div>
                <div className={cn(
                  'flex-1 rounded-lg border px-3 py-2 text-sm transition-all',
                  step.status === 'idle' && 'border-zinc-700 bg-zinc-900 text-zinc-500',
                  step.status === 'active' && 'border-yellow-500/30 bg-yellow-500/5 text-yellow-200',
                  step.status === 'pass' && 'border-emerald-500/30 bg-emerald-500/5 text-emerald-200',
                  step.status === 'fail' && 'border-red-500/30 bg-red-500/5 text-red-200',
                )}>
                  <div className="font-medium">{step.label}</div>
                  {step.detail && <div className="text-xs mt-0.5 opacity-75">{step.detail}</div>}
                </div>
                {i < steps.length - 1 && <ArrowRight className="mt-2 h-4 w-4 shrink-0 text-zinc-600" />}
              </div>
            ))}
          </div>

          {/* Fetched page content */}
          {fetchedContent && (
            <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
                Raw fetched content {injected && <span className="text-red-400">(contains injection)</span>}
              </p>
              <pre className="text-xs text-zinc-400 whitespace-pre-wrap font-mono leading-relaxed max-h-32 overflow-y-auto">
                {fetchedContent}
              </pre>
            </div>
          )}

          {blocked && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300 flex gap-2">
              <ShieldX className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{blocked}</span>
            </div>
          )}
          {result && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                <span className="text-xs font-semibold uppercase text-emerald-400">LLM Response (Verified)</span>
              </div>
              {result}
            </div>
          )}
        </div>

        {/* Layer status */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Security Layers</p>
          <LayerStatusPanel layers={layers} />
        </div>
      </div>

      {/* Attestation explorer */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">Cryptographic Proof Chain</p>
        <AttestationExplorer data={attestation} />
      </div>
    </div>
  );
}
