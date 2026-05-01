'use client';

import { Shield, ShieldCheck, ShieldX, ShieldOff, Loader2, ChevronsRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface LayerStatus {
  label: string;
  description: string;
  status: 'idle' | 'checking' | 'pass' | 'fail' | 'bypassed' | 'skipped';
  reason?: string;
}

const DEFAULT_LAYERS: LayerStatus[] = [
  { label: 'Layer 0', description: 'Capability Grant', status: 'idle' },
  { label: 'Layer 1', description: 'Prompt Integrity', status: 'idle' },
  { label: 'Layer 2', description: 'Agent Chain', status: 'idle' },
  { label: 'Layer 3', description: 'Transform Drift', status: 'idle' },
];

interface Props {
  layers?: LayerStatus[];
}

export function LayerStatusPanel({ layers = DEFAULT_LAYERS }: Props) {
  return (
    <div className="flex flex-col gap-2">
      {layers.map((layer, i) => (
        <div
          key={i}
          className={cn(
            'flex items-start gap-3 rounded-lg border px-4 py-3 text-sm transition-all duration-300',
            layer.status === 'idle'     && 'border-zinc-700 bg-zinc-900 text-zinc-400',
            layer.status === 'checking' && 'border-yellow-500/40 bg-yellow-500/5 text-yellow-300',
            layer.status === 'pass'     && 'border-emerald-500/40 bg-emerald-500/5 text-emerald-300',
            layer.status === 'fail'     && 'border-red-500/40 bg-red-500/5 text-red-300',
            layer.status === 'bypassed' && 'border-orange-500/30 bg-orange-500/5 text-orange-300',
            layer.status === 'skipped'  && 'border-zinc-600 bg-zinc-800/50 text-zinc-400',
          )}
        >
          <div className="mt-0.5 shrink-0">
            {layer.status === 'idle'     && <Shield         className="h-4 w-4 text-zinc-500" />}
            {layer.status === 'checking' && <Loader2        className="h-4 w-4 animate-spin text-yellow-400" />}
            {layer.status === 'pass'     && <ShieldCheck    className="h-4 w-4 text-emerald-400" />}
            {layer.status === 'fail'     && <ShieldX        className="h-4 w-4 text-red-400" />}
            {layer.status === 'bypassed' && <ShieldOff      className="h-4 w-4 text-orange-400" />}
            {layer.status === 'skipped'  && <ChevronsRight  className="h-4 w-4 text-zinc-500" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-mono font-semibold">{layer.label}</span>
              <span className="text-xs text-zinc-500">{layer.description}</span>
              {layer.status !== 'idle' && (
                <span className={cn(
                  'ml-auto rounded px-1.5 py-0.5 text-xs font-semibold',
                  layer.status === 'checking' && 'bg-yellow-500/20 text-yellow-300',
                  layer.status === 'pass'     && 'bg-emerald-500/20 text-emerald-300',
                  layer.status === 'fail'     && 'bg-red-500/20 text-red-300',
                  layer.status === 'bypassed' && 'bg-orange-500/20 text-orange-300',
                  layer.status === 'skipped'  && 'bg-zinc-700 text-zinc-400',
                )}>
                  {layer.status === 'checking' ? 'Checking...'
                  : layer.status === 'pass'    ? 'PASS'
                  : layer.status === 'fail'    ? 'FAIL'
                  : layer.status === 'bypassed'? 'BYPASSED'
                  : layer.status === 'skipped' ? 'NOT REACHED'
                  : ''}
                </span>
              )}
            </div>
            {layer.reason && (
              <p className="mt-1 text-xs opacity-75">{layer.reason}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
