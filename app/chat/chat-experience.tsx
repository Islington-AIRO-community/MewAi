'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { Info, Keyboard, Mic, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import { ReliefAssistant } from '@/components/assistant/relief-assistant';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useApp } from '@/lib/store';
import { CATEGORIES } from '@/lib/types';

const QUICK_PHRASES = [
  'People are trapped in a collapsed building',
  'Someone cannot breathe and is not responding',
  'We need shelter for a family of five',
  'We have no clean drinking water',
  'A child is missing near the canal',
  'There is a downed power line across the road',
];

export function ChatExperience() {
  const searchParams = useSearchParams();
  const intent = searchParams?.get('intent');
  const { sendMessage } = useApp();
  const [seeded, setSeeded] = React.useState(false);

  // Deep link: /chat?intent=medical opens the conversation with that need.
  React.useEffect(() => {
    if (seeded || !intent) return;
    const cat = CATEGORIES[intent as keyof typeof CATEGORIES];
    if (!cat) return;
    setSeeded(true);
    const t = window.setTimeout(() => {
      sendMessage(`I need help with ${cat.label.toLowerCase()}. ${cat.description}.`);
    }, 400);
    return () => window.clearTimeout(t);
  }, [intent, seeded, sendMessage]);

  return (
    <div className="flex min-h-[calc(100dvh-4.25rem)] flex-col">
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-12">
        {/* ---------- Assistant ---------- */}
        <section
          aria-label="AI Relief Assistant"
          className="flex min-h-[calc(100dvh-4.25rem)] flex-col border-navy-200 lg:col-span-8 lg:border-r"
        >
          <h1 className="sr-only">AI Relief Assistant</h1>
          <ReliefAssistant variant="fullscreen" />
        </section>

        {/* ---------- Side rail ---------- */}
        <aside className="hidden flex-col gap-5 p-5 lg:col-span-4 lg:flex xl:p-6">
          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-sm font-bold text-navy-900">
              <Sparkles className="size-4 text-dispatch-600" aria-hidden="true" />
              Try one of these
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-navy-500">
              Tap a phrase to see what the assistant does with it.
            </p>

            <ul className="mt-3.5 space-y-2">
              {QUICK_PHRASES.map((p) => (
                <li key={p}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => sendMessage(p)}
                    className="h-auto w-full justify-start whitespace-normal py-2.5 text-left text-xs font-semibold leading-snug"
                  >
                    {p}
                  </Button>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-sm font-bold text-navy-900">
              <ShieldCheck className="size-4 text-relief-600" aria-hidden="true" />
              How this works
            </h2>
            <ol className="mt-3.5 space-y-3.5">
              {[
                {
                  t: 'You describe the situation',
                  d: 'In your own words, by voice or text. No forms, no jargon.',
                },
                {
                  t: 'FLARE extracts the details',
                  d: 'People affected, injuries, hazards and urgency — each with a confidence score.',
                },
                {
                  t: 'You confirm before dispatch',
                  d: 'Nothing is sent until you press “Confirm & dispatch”.',
                },
                {
                  t: 'You track it live',
                  d: 'Follow the request from submitted to resolved, with every update logged.',
                },
              ].map((s, i) => (
                <li key={s.t} className="flex gap-3">
                  <span
                    className="grid size-6 shrink-0 place-items-center rounded-full bg-navy-900 text-2xs font-black text-white"
                    aria-hidden="true"
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-navy-900">{s.t}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-navy-500">{s.d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>

          <Card className="border-alert-200 bg-alert-50/60 p-5">
            <h2 className="flex items-center gap-2 text-sm font-bold text-alert-800">
              <Zap className="size-4" aria-hidden="true" />
              If life is in danger
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-alert-800/80">
              Do not wait for a conversation. The red SOS button on every screen sends your live
              location to the nearest crew in one tap.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <Badge tone="alertSolid" size="sm">
                1 tap
              </Badge>
              <span className="text-2xs font-semibold text-alert-800/70">No typing required</span>
            </div>
          </Card>

          <div className="mt-auto space-y-2.5 px-1">
            <p className="flex items-center gap-2 text-2xs text-navy-400">
              <Keyboard className="size-3.5" aria-hidden="true" />
              <span>
                <Kbd>Enter</Kbd> to send · <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> for a new line
              </span>
            </p>
            <p className="flex items-center gap-2 text-2xs text-navy-400">
              <Mic className="size-3.5" aria-hidden="true" />
              Voice mode works hands-free on supported phones
            </p>
            <p className="flex items-center gap-2 text-2xs text-navy-400">
              <Info className="size-3.5" aria-hidden="true" />
              This is a demo. No real messages leave your device.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="mx-0.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-navy-200 bg-white px-1 font-mono text-[10px] font-semibold text-navy-500">
      {children}
    </kbd>
  );
}
