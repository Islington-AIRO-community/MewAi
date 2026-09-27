'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { Info, Keyboard, Mic, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import { ReliefAssistant } from '@/components/assistant/relief-assistant';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAiChatInstance } from '@/lib/ai-chat-context';
import { CATEGORIES } from '@/lib/types';
import { Kbd } from '@/components/ui/primitives';
import { useLocale } from '@/lib/i18n';

/**
 * First-person sentences the reporter can tap instead of typing.
 *
 * These are speech, not chrome, so they follow the UI language: a Nepali
 * speaker taps a Nepali sentence and that is what reaches Gemini. Translating
 * them is therefore not cosmetic — it is the actual input.
 */
const QUICK_PHRASE_KEYS = [
  'chat.quick.trapped',
  'chat.quick.notBreathing',
  'chat.quick.shelter',
  'chat.quick.water',
  'chat.quick.missingChild',
  'chat.quick.powerLine',
  'chat.quick.armed',
] as const;

export function ChatExperience() {
  const searchParams = useSearchParams();
  const intent = searchParams?.get('intent');
  // The conversation's one intake, shared with the floating launcher mounted in
  // `AppShell`. A phrase tapped here and one tapped in the floating assistant
  // build the same ticket draft, because they are the same conversation.
  const ai = useAiChatInstance();
  const { t, label } = useLocale();
  const [seeded, setSeeded] = React.useState(false);

  // Deep link: /chat?intent=medical records that the reporter came through the
  // medical tile. This used to call `ai.send()` with an invented first-person
  // sentence, which both displayed as something they had said and sent to Gemini
  // as something they had said.
  //
  // `label` is a dependency because the note quotes the category in the UI
  // language; the `seeded` guard is what stops a language change from
  // re-seeding the transcript.
  React.useEffect(() => {
    if (seeded || !intent) return;
    const cat = CATEGORIES[intent as keyof typeof CATEGORIES];
    if (!cat) return;
    setSeeded(true);
    ai.noteIntent(
      t('chat.intentNote', { category: label('category', cat.id, cat.label) }),
    );
  }, [intent, seeded, ai, t, label]);

  return (
    <div className="flex min-h-[calc(100dvh-4.25rem)] flex-col">
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-12">
        {/* ---------- Assistant ---------- */}
        <section
          aria-label={t('chat.ariaLabel')}
          className="flex min-h-[calc(100dvh-4.25rem)] flex-col border-navy-200 lg:col-span-8 lg:border-r"
        >
          <h1 className="sr-only">{t('chat.ariaLabel')}</h1>
          <ReliefAssistant variant="fullscreen" ai={ai} />
        </section>

        {/* ---------- Side rail ---------- */}
        <aside className="hidden flex-col gap-5 p-5 lg:col-span-4 lg:flex xl:p-6">
          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-sm font-bold text-navy-900">
              <Sparkles className="size-4 text-dispatch-600" aria-hidden="true" />
              {t('chat.tryThese')}
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-navy-500">{t('chat.tryTheseHint')}</p>

            <ul className="mt-3.5 space-y-2">
              {QUICK_PHRASE_KEYS.map((key) => (
                <li key={key}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void ai.send(t(key))}
                    disabled={ai.busy}
                    className="h-auto w-full justify-start whitespace-normal py-2.5 text-left text-xs font-semibold leading-snug"
                  >
                    {t(key)}
                  </Button>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-sm font-bold text-navy-900">
              <ShieldCheck className="size-4 text-relief-600" aria-hidden="true" />
              {t('chat.howItWorks')}
            </h2>
            <ol className="mt-3.5 space-y-3.5">
              {(
                [
                  ['chat.step.describe.t', 'chat.step.describe.d'],
                  ['chat.step.notes.t', 'chat.step.notes.d'],
                  ['chat.step.check.t', 'chat.step.check.d'],
                  ['chat.step.track.t', 'chat.step.track.d'],
                ] as const
              ).map(([titleKey, bodyKey], i) => (
                <li key={titleKey} className="flex gap-3">
                  <span
                    className="grid size-6 shrink-0 place-items-center rounded-full bg-navy-900 text-2xs font-black text-white"
                    aria-hidden="true"
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-navy-900">{t(titleKey)}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-navy-500">{t(bodyKey)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>

          <Card className="border-alert-200 bg-alert-50/60 p-5">
            <h2 className="flex items-center gap-2 text-sm font-bold text-alert-800">
              <Zap className="size-4" aria-hidden="true" />
              {t('chat.danger.title')}
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-alert-800/80">
              {t('chat.danger.body')}
            </p>
            <div className="mt-3 flex items-center gap-2">
              <Badge tone="alertSolid" size="sm">
                {t('chat.danger.badge')}
              </Badge>
              <span className="text-2xs font-semibold text-alert-800/70">
                {t('chat.danger.noTyping')}
              </span>
            </div>
          </Card>

          <div className="mt-auto space-y-2.5 px-1">
            <p className="flex items-center gap-2 text-2xs text-navy-400">
              <Keyboard className="size-3.5" aria-hidden="true" />
              <span>
                <Kbd>Enter</Kbd> {t('chat.keys.send')} · <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd>{' '}
                {t('chat.keys.newline')}
              </span>
            </p>
            <p className="flex items-center gap-2 text-2xs text-navy-400">
              <Mic className="size-3.5" aria-hidden="true" />
              {t('chat.keys.voice')}
            </p>
            <p className="flex items-center gap-2 text-2xs text-navy-400">
              <Info className="size-3.5" aria-hidden="true" />
              {t('chat.keys.privacy')}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
