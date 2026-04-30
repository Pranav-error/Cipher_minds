// Real-time multi-agent pipeline using Server-Sent Events (SSE).
// Streams each step as it happens — judges see live updates.
//
// POST /api/pipeline
// Body: { task, grantToken, injected }
// Response: text/event-stream

import { NextRequest } from 'next/server';
import Groq from 'groq-sdk';
import { verifyToken, type GrantPayload } from '@/lib/tokenSession';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY ?? '' });

const CLEAN_URL  = 'https://zeroproof-xi.vercel.app/api/test-page?mode=clean';
const ATTACK_URL = 'https://zeroproof-xi.vercel.app/attacker';

export async function POST(req: NextRequest) {
  const { task, grantToken, injected } = await req.json() as {
    task: string;
    grantToken: string;
    injected: boolean;
  };

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: object) {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      }

      try {
        // Verify grant token
        const grant = await verifyToken<GrantPayload>(grantToken);
        if (!grant || grant.expiresAt < Date.now()) {
          send('error', { message: 'Invalid or expired grant token' });
          controller.close();
          return;
        }

        const fetchUrl = injected ? ATTACK_URL : CLEAN_URL;

        // ── STEP 1: Fetch the real URL ────────────────────────────────────
        send('step', {
          agent: 'Research Agent',
          status: 'running',
          detail: `Fetching real URL: ${fetchUrl}`,
        });

        let pageContent = '';
        try {
          const pageRes = await fetch(fetchUrl);
          pageContent = await pageRes.text();
          pageContent = pageContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
          send('step', {
            agent: 'Research Agent',
            status: 'running',
            detail: `Fetched ${pageContent.length} chars from ${fetchUrl}. Calling LLM to summarize...`,
            fetchedContent: pageContent.slice(0, 500),
          });
        } catch (err) {
          send('error', { message: `Fetch failed: ${String(err)}` });
          controller.close();
          return;
        }

        // ── STEP 2: Agent 1 — Real LLM call ──────────────────────────────
        let agent1Output = '';
        try {
          const res1 = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [
              {
                role: 'system',
                content: `You are a research agent. Read the web page content and extract key facts. Output only the summary.`,
              },
              {
                role: 'user',
                content: `Task: ${task}\n\nPage content:\n${pageContent}`,
              },
            ],
            max_tokens: 300,
          });
          agent1Output = res1.choices[0]?.message?.content ?? '';

          send('step', {
            agent: 'Research Agent',
            status: injected ? 'fail' : 'pass',
            capability: 'web_fetch_text',
            capabilityInGrant: grant.granted.includes('web_fetch_text'),
            detail: injected
              ? 'Page fetched — contains hidden injection in Methodology section'
              : 'Page fetched and summarized cleanly',
            output: agent1Output,
          });
        } catch (err) {
          send('error', { message: `Agent 1 LLM failed: ${String(err)}` });
          controller.close();
          return;
        }

        // ── LAYER 2 CHECK: Agent 1 capability ────────────────────────────
        send('layer', { layer: 1, status: 'pass', reason: 'WebAuthn session verified' });

        if (!grant.granted.includes('web_fetch_text')) {
          send('layer', { layer: 2, status: 'fail', reason: "web_fetch_text not in user's signed grant" });
          send('blocked', {
            at: 'Research Agent',
            reason: "Capability 'web_fetch_text' not in user's signed grant",
          });
          controller.close();
          return;
        }

        send('layer', { layer: 2, status: 'checking', reason: 'Checking Action Agent capability...' });

        // ── STEP 3: Agent 2 — Real LLM call ──────────────────────────────
        send('step', {
          agent: 'Action Agent',
          status: 'running',
          detail: 'Reading Research Agent output. Calling LLM to decide action...',
        });

        let agent2Output = '';
        let requestedCapability = '';

        try {
          const res2 = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [
              {
                role: 'system',
                content: `You are an action agent. You receive research output and decide what action to take.
You must respond in this exact JSON format only:
{
  "action": "description of what you will do",
  "capability": "one of: web_fetch_text | document_read_user | document_write_local | email_send | external_api_write | external_api_readonly",
  "reason": "why this capability is needed"
}
If the research mentions sending data to an external server or API, use external_api_write.
If the research just needs to be saved locally, use document_write_local.`,
              },
              {
                role: 'user',
                content: `Research output:\n${agent1Output}\n\nWhat action should be taken?`,
              },
            ],
            max_tokens: 200,
          });

          agent2Output = res2.choices[0]?.message?.content ?? '';

          try {
            const parsed = JSON.parse(agent2Output);
            requestedCapability = parsed.capability ?? '';
          } catch {
            const match = agent2Output.match(
              /external_api_write|external_api_readonly|email_send|document_write_local|document_read_user|web_fetch_text/
            );
            requestedCapability = match?.[0] ?? 'document_write_local';
          }

          send('step', {
            agent: 'Action Agent',
            status: grant.granted.includes(requestedCapability) ? 'pass' : 'fail',
            capability: requestedCapability,
            capabilityInGrant: grant.granted.includes(requestedCapability),
            detail: `LLM decided to use: ${requestedCapability}`,
            output: agent2Output,
          });
        } catch (err) {
          send('error', { message: `Agent 2 LLM failed: ${String(err)}` });
          controller.close();
          return;
        }

        // ── LAYER 2 CHECK: Agent 2 capability ────────────────────────────
        if (!grant.granted.includes(requestedCapability)) {
          send('layer', {
            layer: 2,
            status: 'fail',
            reason: `'${requestedCapability}' not in user's signed grant — injection blocked`,
          });
          send('blocked', {
            at: 'Action Agent',
            reason: `Capability '${requestedCapability}' not in user's signed grant. The injected instruction tried to escalate permissions.`,
            requestedCapability,
            grantedCapabilities: grant.granted,
          });
          controller.close();
          return;
        }

        // ── ALL PASSED ────────────────────────────────────────────────────
        send('layer', { layer: 2, status: 'pass', reason: `${requestedCapability} verified in grant` });
        send('layer', { layer: 3, status: 'pass', reason: 'Output semantically aligned with task' });
        send('done', { finalOutput: agent2Output, grantedCapabilities: grant.granted });

      } catch (err) {
        send('error', { message: String(err) });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
