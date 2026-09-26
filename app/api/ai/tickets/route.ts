import { NextResponse } from 'next/server';
import type { SupportType } from '@/lib/types';
import {
  AI_TIMEOUT_MS,
  backendUnreachable,
  backendUrl,
  badRequest,
} from '../_shared';

/**
 * `POST /api/ai/tickets` — proxy for `POST /api/tickets` on the AI backend.
 *
 * The final write of the intake. Everything the backend rejects is echoed back
 * verbatim: its 422 names the exact missing attributes, and the review form
 * highlights those fields, so a second validation layer here would only risk
 * disagreeing with the authoritative one.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SUPPORT_TYPES = new Set<SupportType>([
  'rescue',
  'relief-supplies',
  'medical',
  'security',
]);
const URGENCIES = new Set(['critical', 'high', 'medium', 'low']);

/** Trim a field to a string, capped, treating null/undefined as absent. */
function text(value: unknown, max: number): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value).slice(0, max);
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

/** Discriminated on `ok` so the failure path narrows to a real string. */
type Validation = { ok: true; payload: Record<string, unknown> } | { ok: false; error: string };

function validate(body: unknown): Validation {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }
  const b = body as Record<string, unknown>;

  const supportRaw = b.support_needed;
  if (!Array.isArray(supportRaw) || supportRaw.length === 0) {
    return { ok: false, error: 'At least one support type is required.' };
  }
  const support = [
    ...new Set(
      supportRaw.filter(
        (value): value is SupportType =>
          typeof value === 'string' && SUPPORT_TYPES.has(value as SupportType),
      ),
    ),
  ];
  if (support.length === 0) {
    return {
      ok: false,
      error: `\`support_needed\` must contain at least one of: ${[...SUPPORT_TYPES].join(', ')}.`,
    };
  }

  const urgency = b.urgency;
  if (typeof urgency !== 'string' || !URGENCIES.has(urgency)) {
    return { ok: false, error: '`urgency` must be one of: critical, high, medium, low.' };
  }

  return {
    ok: true,
    payload: {
      reporter_name: text(b.reporter_name, 120),
      reporter_phone: text(b.reporter_phone, 40),
      victim_name: text(b.victim_name, 120),
      victim_phone: text(b.victim_phone, 40),
      summary: text(b.summary, 4000),
      location: text(b.location, 400),
      people_affected: b.people_affected ?? null,
      support_needed: support,
      urgency,
      on_behalf_of_other: b.on_behalf_of_other === true,
      notes: text(b.notes, 2000),
      source: 'ai-chat',
      session_id: text(b.session_id, 64) || 'anonymous',
    },
  };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest('Request body must be valid JSON.');
  }

  const result = validate(body);
  if (!result.ok) return badRequest(result.error);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const upstream = await fetch(`${backendUrl()}/api/tickets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result.payload),
      signal: controller.signal,
    });
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return backendUnreachable(error);
  } finally {
    clearTimeout(timer);
  }
}
