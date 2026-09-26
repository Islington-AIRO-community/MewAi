'use client';

import * as React from 'react';
import {
  DEFAULT_REPLY,
  INITIAL_ACTION_CARDS,
  INITIAL_MESSAGES,
  REPORTS,
  SCRIPTED_REPLIES,
} from '@/lib/mock-data';
import type { ActionCard, ChatMessage, Report, StageId } from '@/lib/types';
import { reportCodeFromId } from '@/lib/utils';

/* ------------------------------------------------------------------ *
 * Session
 * ------------------------------------------------------------------ */

export interface SessionUser {
  name: string;
  email: string;
  avatarHref: string | null;
  initials: string;
  verified: boolean;
}

interface AppState {
  user: SessionUser | null;
  reports: Report[];
  messages: ChatMessage[];
  actionCards: ActionCard[];
  /** Monotonic id seed so new reports never collide with mock data. */
  nextReportSeq: number;
}

interface AppContextValue extends AppState {
  signIn: (user: SessionUser) => void;
  signOut: () => void;
  sendMessage: (text: string, opts?: { viaVoice?: boolean }) => Promise<void>;
  isResponding: boolean;
  confirmActionCard: (cardId: string) => Report | null;
  dismissActionCard: (cardId: string) => void;
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

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<SessionUser | null>(null);
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

  const signIn = React.useCallback((next: SessionUser) => setUser(next), []);
  const signOut = React.useCallback(() => setUser(null), []);

  const getReport = React.useCallback(
    (id: string) => reports.find((r) => r.id === id),
    [reports],
  );

  /* ---- Assistant messaging ---- */

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

      const scripted = SCRIPTED_REPLIES.find((s) => s.match.test(trimmed));
      const replyText = scripted?.text ?? DEFAULT_REPLY.text;
      const confidence = scripted?.confidence ?? DEFAULT_REPLY.confidence;

      // Latency scaled to message length: feels responsive but not instant.
      const delay = Math.min(1400, 420 + trimmed.length * 12);
      await new Promise((r) => setTimeout(r, delay));

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

      const assistantMessage: ChatMessage = {
        id: nextId('m'),
        role: 'assistant',
        text: replyText,
        at: nowIso(),
        confidence,
        actionCardId: newCard?.id,
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setIsResponding(false);
    },
    [nextId, nowIso],
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
      signIn,
      signOut,
      sendMessage,
      isResponding,
      confirmActionCard,
      dismissActionCard,
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
      signIn,
      signOut,
      sendMessage,
      isResponding,
      confirmActionCard,
      dismissActionCard,
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
