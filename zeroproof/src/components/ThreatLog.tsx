'use client';

import { ShieldCheck, ShieldX, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ThreatEvent = {
  id: string;
  timestamp: number;
  layer: string;
  action: string;
  status: 'blocked' | 'passed' | 'warning';
  reason: string;
};

interface Props {
  events: ThreatEvent[];
}

export function ThreatLog({ events }: Props) {
  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4 text-center text-xs text-zinc-500">
        No events yet — run a demo to see live security events
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-900 overflow-hidden">
      <div className="flex items-center justify-between border-b border-zinc-700 px-4 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Live Security Events
        </span>
        <span className="text-xs text-zinc-500">{events.length} event{events.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="divide-y divide-zinc-800 max-h-48 overflow-y-auto">
        {[...events].reverse().map(ev => (
          <div key={ev.id} className={cn(
            'flex items-start gap-3 px-4 py-2.5 text-xs',
            ev.status === 'blocked' && 'bg-red-500/5',
            ev.status === 'passed' && 'bg-emerald-500/5',
            ev.status === 'warning' && 'bg-yellow-500/5',
          )}>
            <div className="mt-0.5 shrink-0">
              {ev.status === 'blocked'
                ? <ShieldX className="h-3.5 w-3.5 text-red-400" />
                : ev.status === 'passed'
                  ? <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                  : <ShieldX className="h-3.5 w-3.5 text-yellow-400" />
              }
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn(
                  'font-semibold',
                  ev.status === 'blocked' && 'text-red-300',
                  ev.status === 'passed' && 'text-emerald-300',
                  ev.status === 'warning' && 'text-yellow-300',
                )}>
                  {ev.status === 'blocked' ? 'BLOCKED' : ev.status === 'passed' ? 'PASSED' : 'WARNING'}
                </span>
                <span className="rounded border border-zinc-600 bg-zinc-800 px-1.5 py-px font-mono text-zinc-300">
                  {ev.layer}
                </span>
                <span className="text-zinc-300">{ev.action}</span>
              </div>
              <p className="mt-0.5 text-zinc-500 truncate">{ev.reason}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0 text-zinc-600">
              <Clock className="h-3 w-3" />
              {new Date(ev.timestamp).toLocaleTimeString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
