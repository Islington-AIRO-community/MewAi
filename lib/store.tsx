'use client';

import * as React from 'react';
import { useSession } from 'next-auth/react';
import { sessionToUser, type SessionUser } from '@/lib/session-user';
import {
  DEFAULT_REPLY,
  INITIAL_ACTION_CARDS,
  INITIAL_MESSAGES,
  REPORTS,
  SCRIPTED_REPLIES,
} from '@/lib/mock-data';
import type { StoredTicket } from '@/lib/ai-client';
import type { ActionCard, ChatMessage, Report, StageId } from '@/lib/types';
import { routeForSupportTypes, SUPPORT_TYPES } from '@/lib/types';
import { reportCodeFromId } from '@/lib/utils';

/* ------------------------------------------------------------------ *
 * Session
 * ------------------------------------------------------------------ */

export type { SessionUser } from '@/lib/session-user';

interface AppState {
  user: SessionUser | null;
  reports: Report[];
  messages: ChatMessage[];
  actionCards: ActionCard[];
  /** Monotonic id seed so new reports never collide with mock data. */
  nextReportSeq: number;
}

interface AppContextValue extends AppState {
  sendMessage: (
    text: string,
    opts?: { viaVoice?: boolean; deferReply?: boolean },
  ) => Promise<void>;
  isResponding: boolean;
  /**
   * Append an assistant turn to the shared transcript.
   *
   * The counterpart to `sendMessage({ deferReply: true })`: the live AI intake
   * owns the reply text, and the transcript is still shared, so this is how a
   * model answer and an offline fallback get into the same list the dashboard
   * and the floating assistant read from.
   */
  appendAssistantMessage: (message: {
    text: string;
    confidence?: number;
    actionCardId?: string;
    offline?: boolean;
  }) => void;
  /** The scripted reply for a message, without sending it. */
  scriptedReplyFor: (text: string) => { text: string; confidence: number };
  confirmActionCard: (cardId: string) => Report | null;
  dismissActionCard: (cardId: string) => void;
  /**
   * Fold a written AI ticket into the report list.
   *
   * The ticket row on the AI backend is the durable record; this is the same
   * event seen from the dashboard's side, so a submitted ticket is trackable in
   * the UI like any other report. It starts at `submitted` — an admin reviews
   * the queue before anything moves, and `advanceStage` is what the demo
   * simulate control drives from there.
   */
  createReportFromTicket: (ticket: StoredTicket) => Report;
  /** Advance a report's lifecycle (used by the demo "simulate" control). */
  advanceStage: (reportId: string) => void;
  triggerSos: (payload: { label: string; lat: number; lng: number }) => Report;
  getReport: (id: string) => Report | undefined;
}

const AppContext = React.createContext<AppContextValue | null>(null);

const STAGE_FLOW: StageId[] = ['submitted', 'triage', 'dispatched', 'on-site', 'resolved'];

const AVATAR_SVG = (hue: number) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="hsl(${hue},42%,32%)"/><circle cx="32" cy="25" r="11" fill="hsl(${hue},60%,82%)"/><path d="M10 62c2-13 11-19 22-19s20 6 22 19z" fill="hsl(${hue},60%,82%)"/></svg>`,
  )}`;

/**
 * The single source of truth for session, reports, transcript and action cards.
 *
 * MUST be mounted inside a `<SessionProvider>`: `useSession` throws rather than
 * degrading if it is not, so an `AppProvider` rendered without one takes the
 * whole app down rather than one component. `SessionProvider` is therefore an
 * *outer* wrapper here — see `components/layout/app-shell.tsx`, which nests it
 * above this provider deliberately. If you move these providers, keep
 * `SessionProvider` on the outside.
 */
export function AppProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const user = React.useMemo(() => sessionToUser(session, status), [session, status]);
  const [reports, setReports] = React.useState<Report[]>(REPORTS);
  const [messages, setMessages] = React.useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [actionCards, setActionCards] = React.useState<ActionCard[]>(INITIAL_ACTION_CARDS);
  const [isResponding, setIsResponding] = React.useState(false);
  const [nextReportSeq, setNextReportSeq] = React.useState(426);
  const idSeed = React.useRef(0);

  const nextId = React.useCallback((prefix: string) => {
    idSeed.current += 1;
    return `${prefix}-${Date.now().toString(36)}-${idSeed.current}`;
  }, []);

  const nowIso = React.useCallback(() => new Date().toISOString(), []);

  const getReport = React.useCallback(
    (id: string) => reports.find((r) => r.id === id),
    [reports],
  );

  /* ---- Assistant messaging ---- */

  const scriptedReplyFor = React.useCallback<AppContextValue['scriptedReplyFor']>(
    (text) => {
      const scripted = SCRIPTED_REPLIES.find((s) => s.match.test(text));
      return {
        text: scripted?.text ?? DEFAULT_REPLY.text,
        confidence: scripted?.confidence ?? DEFAULT_REPLY.confidence,
      };
    },
    [],
  );

  const appendAssistantMessage = React.useCallback<AppContextValue['appendAssistantMessage']>(
    ({ text, confidence, actionCardId, offline }) => {
      const message: ChatMessage = {
        id: nextId('m'),
        role: 'assistant',
        text,
        at: nowIso(),
        confidence,
        actionCardId,
        offline,
      };
      setMessages((prev) => [...prev, message]);
      setIsResponding(false);
    },
    [nextId, nowIso],
  );

  const sendMessage = React.useCallback<AppContextValue['sendMessage']>(
    async (text, opts) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      const userMessage: ChatMessage = {
        id: nextId('m'),
        role: 'user',
        text: trimmed,
        at: nowIso(),
        viaVoice: opts?.viaVoice,
      };
      setMessages((prev) => [...prev, userMessage]);
      setIsResponding(true);

      // `deferReply` hands the assistant turn to the caller — used by the live
      // AI intake, which has a real reply coming and only wants the user
      // message to land in the shared transcript immediately. Resolving without
      // clearing `isResponding` is deliberate: the caller's turn is still
      // in flight, and it settles the indicator via `appendAssistantMessage`.
      if (opts?.deferReply) return;

      // Latency scaled to message length: feels responsive but not instant.
      const delay = Math.min(1400, 420 + trimmed.length * 12);
      await new Promise((r) => setTimeout(r, delay));

      const scripted = SCRIPTED_REPLIES.find((s) => s.match.test(trimmed));

      let newCard: ActionCard | null = null;
      if (scripted?.actionCard) {
        newCard = {
          ...scripted.actionCard,
          id: nextId('ac'),
          createdAt: nowIso(),
          status: 'pending',
        };
        setActionCards((prev) => [...prev, newCard as ActionCard]);
      }

      appendAssistantMessage({
        text: scripted?.text ?? DEFAULT_REPLY.text,
        confidence: scripted?.confidence ?? DEFAULT_REPLY.confidence,
        actionCardId: newCard?.id ?? undefined,
      });
    },
    [nextId, nowIso, appendAssistantMessage],
  );

  /* ---- Action card -> report dispatch ---- */

  const confirmActionCard = React.useCallback<AppContextValue['confirmActionCard']>(
    (cardId) => {
      const card = actionCards.find((c) => c.id === cardId);
      if (!card || card.status !== 'pending') return null;

      const seq = nextReportSeq;
      setNextReportSeq((n) => n + 1);
      const id = String(seq);
      const at = nowIso();

      const categoryByDept: Record<string, Report['category']> = {
        'dept-medical': 'medical',
        'dept-sar': 'search-rescue',
        'dept-shelter': 'shelter',
        'dept-logistics': 'food-water',
        'dept-fire': 'infrastructure',
      };

      const report: Report = {
        id,
        title: card.headline.replace(/ — .*$/, ''),
        summary: card.headline,
        category: categoryByDept[card.departmentId] ?? 'medical',
        priority: card.kind === 'dispatch' ? 'critical' : 'high',
        departmentId: card.departmentId,
        reporterName: user?.name ?? 'You',
        createdAt: at,
        updatedAt: at,
        currentStage: 'triage',
        stageTimestamps: { submitted: at, triage: at },
        location: {
          label: 'Your current location',
          area: 'Northbank Region',
          lat: 40.7581,
          lng: -74.0013,
          landmark: 'Shared from your device',
        },
        peopleAffected: 1,
        vulnerability: [],
        contactPreference: 'sms',
        channel: 'chat',
        extracted: card.fields.map((f) => ({
          label: f.label,
          value: f.value,
          confidence: card.confidence,
        })),
        timeline: [
          {
            id: nextId('e'),
            at,
            stageId: 'triage',
            title: 'Report submitted via AI Relief Assistant',
            detail: card.fields.map((f) => `${f.label}: ${f.value}`).join(' · '),
            actor: user?.name ?? 'You',
            actorRole: 'reporter',
            tags: ['Chat', `Confidence ${Math.round(card.confidence * 100)}%`],
          },
        ],
      };

      setReports((prev) => [report, ...prev]);
      setActionCards((prev) =>
        prev.map((c) => (c.id === cardId ? { ...c, status: 'confirmed', reportId: id } : c)),
      );
      setMessages((prev) => [
        ...prev,
        {
          id: nextId('m'),
          role: 'system',
          at,
          text: `Dispatch confirmed. Report ${reportCodeFromId(id)} created and pushed to the response team. You can track it from your dashboard.`,
        },
      ]);

      return report;
    },
    [actionCards, nextReportSeq, nowIso, nextId, user],
  );

  /* ---- AI ticket -> report ---- */

  const createReportFromTicket = React.useCallback<AppContextValue['createReportFromTicket']>(
    (ticket) => {
      const seq = nextReportSeq;
      setNextReportSeq((n) => n + 1);
      const id = String(seq);
      // The backend stamps `created_at`; the report adopts it rather than
      // inventing its own clock reading, so the two records cannot disagree
      // about when the call came in.
      const at = ticket.created_at;

      const route = routeForSupportTypes(ticket.support_needed);
      const primary = ticket.support_needed[0];
      const primaryLabel = primary ? SUPPORT_TYPES[primary].label : 'Relief support';

      // The 1–6 attributes from the spec, in order, as the report's extraction
      // panel. This is the same list the review form showed the reporter, so a
      // responder sees what was actually confirmed rather than a re-summary.
      const extracted = [
        { label: 'Your name', value: ticket.reporter_name },
        { label: 'Your contact number', value: ticket.reporter_phone },
        ...(ticket.on_behalf_of_other
          ? [
              { label: 'Person who needs help', value: ticket.victim_name },
              { label: 'Their contact number', value: ticket.victim_phone },
            ]
          : []),
        { label: 'What is happening', value: ticket.summary },
        { label: 'Ticket time', value: at },
        { label: 'Location', value: ticket.location },
        {
          label: 'Support needed',
          value: ticket.support_needed
            .map((t) => SUPPORT_TYPES[t]?.label ?? t)
            .join(', '),
        },
      ].filter((field) => field.value.trim().length > 0);

      const report: Report = {
        id,
        title: ticket.location
          ? `${primaryLabel} — ${ticket.location}`
          : primaryLabel,
        summary: ticket.summary,
        category: route.category,
        priority: ticket.urgency,
        departmentId: route.departmentId,
        reporterName: ticket.reporter_name || user?.name || 'You',
        createdAt: at,
        updatedAt: at,
        // Nothing has been triaged yet. An admin reviews the queue first, which
        // is the hand-off the reporter is told about on the receipt.
        currentStage: 'submitted',
        stageTimestamps: { submitted: at },
        location: {
          label: ticket.location || 'Location not given',
          area: 'Reported by text',
          // No geocoding in this app: the "map" is CSS/SVG around a fixed
          // centre. A ticket carries a described address, not coordinates, so
          // the point stands in for the area and the text carries the detail.
          lat: 40.7581,
          lng: -74.0013,
          landmark: ticket.location || 'Described by the reporter',
        },
        peopleAffected: ticket.people_affected ?? 1,
        vulnerability: [],
        contactPreference: 'sms',
        channel: 'chat',
        extracted: extracted.map((field) => ({ ...field, confidence: 1 })),
        timeline: [
          {
            id: nextId('e'),
            at,
            stageId: 'submitted',
            title: `Ticket ${ticket.id} submitted via AI Relief Assistant`,
            detail: ticket.summary,
            actor: ticket.reporter_name || user?.name || 'You',
            actorRole: 'reporter',
            tags: ['Chat', ticket.id, ...ticket.support_needed],
          },
        ],
      };

      setReports((prev) => [report, ...prev]);
      setMessages((prev) => [
        ...prev,
        {
          id: nextId('m'),
          role: 'system',
          at,
          text: `Ticket ${ticket.id} submitted and logged as ${reportCodeFromId(id)}. It is now in the response team's review queue — they will contact ${report.reporterName} on ${report.contactPreference === 'sms' ? `the number ${ticket.reporter_phone || 'provided'}` : 'the number provided'}.`,
        },
      ]);

      return report;
    },
    [nextReportSeq, nextId, user],
  );

  const dismissActionCard = React.useCallback<AppContextValue['dismissActionCard']>(
    (cardId) => {
      setActionCards((prev) =>
        prev.map((c) => (c.id === cardId ? { ...c, status: 'dismissed' } : c)),
      );
      setMessages((prev) => [
        ...prev,
        {
          id: nextId('m'),
          role: 'system',
          at: nowIso(),
          text: 'Capture dismissed. The details are still saved in this conversation if you need to send them later.',
        },
      ]);
    },
    [nextId, nowIso],
  );

  /* ---- Lifecycle simulation ---- */

  const advanceStage = React.useCallback<AppContextValue['advanceStage']>(
    (reportId) => {
      const at = nowIso();
      setReports((prev) =>
        prev.map((r) => {
          if (r.id !== reportId) return r;
          const idx = STAGE_FLOW.indexOf(r.currentStage);
          const next = STAGE_FLOW[Math.min(idx + 1, STAGE_FLOW.length - 1)];
          if (next === r.currentStage) return r;
          return {
            ...r,
            currentStage: next,
            updatedAt: at,
            stageTimestamps: { ...r.stageTimestamps, [next]: at },
            timeline: [
              ...r.timeline,
              {
                id: nextId('e'),
                at,
                stageId: next,
                title: `Stage updated: ${next.replace('-', ' ')}`,
                detail: 'Simulated update from the dispatch console.',
                actor: 'Dispatch Console',
                actorRole: 'department',
              },
            ],
          };
        }),
      );
    },
    [nowIso, nextId],
  );

  /* ---- SOS ---- */

  const triggerSos = React.useCallback<AppContextValue['triggerSos']>(
    ({ label, lat, lng }) => {
      const seq = nextReportSeq;
      setNextReportSeq((n) => n + 1);
      const id = String(seq);
      const at = nowIso();

      const report: Report = {
        id,
        title: `SOS — ${label}`,
        summary: `Distress signal triggered from the SOS quick-access bar. ${label}. Location shared live with the nearest response units.`,
        category: 'medical',
        priority: 'critical',
        departmentId: 'dept-medical',
        reporterName: user?.name ?? 'You',
        createdAt: at,
        updatedAt: at,
        currentStage: 'dispatched',
        stageTimestamps: { submitted: at, triage: at, dispatched: at },
        location: {
          label: 'Live location',
          area: 'Northbank Region',
          lat,
          lng,
          landmark: 'GPS fix from your device',
        },
        peopleAffected: 1,
        vulnerability: ['Distress signal'],
        contactPreference: 'call',
        channel: 'sos',
        etaMinutes: 4,
        responder: {
          name: 'Medic Alpha-2',
          unit: 'EMS Rapid Response',
          callSign: 'ALPHA-2',
          etaMinutes: 4,
          certifications: ['ALS', 'Rapid Response'],
        },
        extracted: [
          { label: 'Signal', value: '1-tap SOS', confidence: 1 },
          { label: 'Location', value: `Live GPS ${lat.toFixed(4)}, ${lng.toFixed(4)}`, confidence: 1 },
          { label: 'Priority', value: 'CRITICAL', confidence: 1 },
        ],
        timeline: [
          {
            id: nextId('e'),
            at,
            stageId: 'submitted',
            title: 'SOS distress signal sent',
            detail: `One-tap emergency alert with live location: ${label}.`,
            actor: user?.name ?? 'You',
            actorRole: 'reporter',
            tags: ['SOS', '1 tap'],
          },
          {
            id: nextId('e'),
            at,
            stageId: 'dispatched',
            title: 'Nearest units auto-dispatched',
            detail: 'Fastest two crews diverted to the signal location. ETA 4 minutes.',
            actor: 'FLARE Auto-Dispatch',
            actorRole: 'system',
            tags: ['Auto-dispatch', 'ETA 4 min'],
          },
        ],
      };

      setReports((prev) => [report, ...prev]);
      return report;
    },
    [nextReportSeq, nowIso, nextId, user],
  );

  const value = React.useMemo<AppContextValue>(
    () => ({
      user,
      reports,
      messages,
      actionCards,
      nextReportSeq,
      sendMessage,
      isResponding,
      appendAssistantMessage,
      scriptedReplyFor,
      confirmActionCard,
      dismissActionCard,
      createReportFromTicket,
      advanceStage,
      triggerSos,
      getReport,
    }),
    [
      user,
      reports,
      messages,
      actionCards,
      nextReportSeq,
      sendMessage,
      isResponding,
      appendAssistantMessage,
      scriptedReplyFor,
      confirmActionCard,
      dismissActionCard,
      createReportFromTicket,
      advanceStage,
      triggerSos,
      getReport,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = React.useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}

export { AVATAR_SVG };
