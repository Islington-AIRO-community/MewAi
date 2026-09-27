'use client';

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowUp,
  Circle,
  CornerDownLeft,
  Info,
  Loader2,
  Mic,
  MicOff,
  PencilLine,
  Search,
  ShieldCheck,
  Sparkles,
  WifiOff,
  X,
} from 'lucide-react';
import type { ActionCard, ChatMessage } from '@/lib/types';
import { clockTime, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ActionCardBanner } from './action-card';
import { IntakeChecklist, TicketReview } from './ticket-review';
import type { AiChatApi } from '@/lib/use-ai-chat';
import { usePrefersReducedMotion } from '@/lib/hooks';
import { Eyebrow } from '@/components/ui/primitives';
import { Notice } from '@/components/ui/patterns';
import { SearchField } from '@/components/ui/inputs';
import { useLocale } from '@/lib/i18n';

/* ------------------------------------------------------------------ *
 * Message bubble
 * ------------------------------------------------------------------ */

function MessageBubble({ message }: { message: ChatMessage }) {
  const { t } = useLocale();
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  if (isSystem) {
    return (
      <motion.li
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start gap-2.5 px-1"
      >
        <span
          className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-navy-100 text-navy-500"
          aria-hidden="true"
        >
          <Info className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1 rounded-lg border border-dashed border-navy-200 bg-navy-50/70 px-3 py-2">
          <Eyebrow>{t('chat.system')}</Eyebrow>
          <p className="mt-0.5 text-xs leading-relaxed text-navy-600">{message.text}</p>
          <p className="nums mt-1 text-2xs text-navy-400">{clockTime(message.at)}</p>
        </div>
      </motion.li>
    );
  }

  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className={cn('flex gap-2.5', isUser && 'flex-row-reverse')}
    >
      <span
        className={cn(
          'mt-0.5 grid size-7 shrink-0 place-items-center rounded-full',
          isUser
            ? 'bg-navy-800 text-white'
            : 'bg-gradient-to-br from-dispatch-500 to-dispatch-700 text-white',
        )}
        aria-hidden="true"
      >
        {isUser ? <Circle className="size-3.5" /> : <Sparkles className="size-4" />}
      </span>

      <div className={cn('min-w-0 max-w-[85%] sm:max-w-[75%]', isUser && 'flex flex-col items-end')}>
        <div
          className={cn(
            'rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-xs',
            isUser
              ? 'rounded-tr-sm bg-navy-900 text-white'
              : message.offline
                ? 'rounded-tl-sm border border-dashed border-alert-300 bg-alert-50/60 text-navy-700'
                : 'rounded-tl-sm border border-navy-200 bg-white text-navy-800',
          )}
        >
          {message.text}
          {message.pending && (
            <span className="ml-1 inline-flex gap-0.5 align-middle" aria-hidden="true">
              <span className="size-1 animate-bounce rounded-full bg-current [animation-delay:0ms]" />
              <span className="size-1 animate-bounce rounded-full bg-current [animation-delay:120ms]" />
              <span className="size-1 animate-bounce rounded-full bg-current [animation-delay:240ms]" />
            </span>
          )}
        </div>

        <div
          className={cn(
            'mt-1 flex items-center gap-1.5 px-1 text-2xs text-navy-400',
            isUser && 'flex-row-reverse',
          )}
        >
          <span className="nums font-semibold">{clockTime(message.at)}</span>
          {message.viaVoice && (
            <span className="inline-flex items-center gap-0.5">
              <Mic className="size-3" aria-hidden="true" />
              <span className="sr-only">{t('chat.sentByVoice')}</span>
            </span>
          )}
          {message.confidence !== undefined && (
            <span className="font-semibold text-navy-300">
              {t('chat.sure', { n: Math.round(message.confidence * 100) })}
            </span>
          )}
          {/* Served from the offline set, not the model. Marked visibly rather
              than silently: in an emergency a canned answer presented as a real
              one is worse than an obvious gap. */}
          {message.offline && (
            <span className="inline-flex items-center gap-1 font-bold text-alert-700">
              <WifiOff className="size-3" aria-hidden="true" />
              <span>{t('chat.offlineReply')}</span>
            </span>
          )}
        </div>
      </div>
    </motion.li>
  );
}

/* ------------------------------------------------------------------ *
 * Chat panel
 * ------------------------------------------------------------------ */

export function ChatPanel({
  messages,
  actionCards,
  isResponding,
  onSend,
  onConfirmCard,
  onDismissCard,
  voiceState,
  onToggleMic,
  className,
  autoFocusInput = true,
  showSearch = true,
  ai,
}: {
  messages: ChatMessage[];
  actionCards: ActionCard[];
  isResponding: boolean;
  onSend: (text: string) => void;
  onConfirmCard: (card: ActionCard) => void;
  onDismissCard: (card: ActionCard) => void;
  /**
   * The voice session's visual state, for the composer's mic button. It is the
   * same `VoiceState` the voice tab renders, passed down rather than read from a
   * context, because there is one session per `ReliefAssistant` and that
   * component owns it.
   */
  voiceState: 'idle' | 'listening' | 'thinking' | 'speaking' | 'muted' | 'connecting' | 'error';
  /**
   * Start a session if there is none, otherwise mute/unmute it. The button is
   * the fastest route into voice from the text composer, so it does both jobs
   * rather than being dead until the voice tab has been opened.
   */
  onToggleMic: () => void;
  className?: string;
  autoFocusInput?: boolean;
  showSearch?: boolean;
  /**
   * The live intake. Optional so the store's scripted flow keeps working on
   * its own; when present the panel routes sends through it and renders the
   * ticket review step.
   */
  ai?: AiChatApi;
}) {
  const [draft, setDraft] = React.useState('');
  const [query, setQuery] = React.useState('');
  const [searchOpen, setSearchOpen] = React.useState(false);
  const { t } = useLocale();
  const listRef = React.useRef<HTMLUListElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const reduced = usePrefersReducedMotion();

  // The store's `isResponding` only covers the scripted reply. A live turn takes
  // seconds, so the indicator and the composer's busy state follow whichever is
  // actually in flight — otherwise a second message can be sent into a turn that
  // has not come back yet.
  const waiting = isResponding || Boolean(ai?.busy);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return messages.filter(
      (m) => m.text.toLowerCase().includes(q) || clockTime(m.at).includes(q),
    );
  }, [messages, query]);

  // Keep the transcript pinned to the newest message.
  React.useEffect(() => {
    const el = listRef.current;
    if (!el || query) return;
    el.scrollTo({ top: el.scrollHeight, behavior: reduced ? 'auto' : 'smooth' });
  }, [messages, waiting, reduced, query]);

  React.useEffect(() => {
    if (autoFocusInput) inputRef.current?.focus();
    // Focus on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || waiting) return;
    // Route through the live intake when it is mounted, so the ticket draft
    // advances alongside the transcript.
    if (ai) void ai.send(text);
    else onSend(text);
    setDraft('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
  };

  // The review step replaces the composer: once the intake has everything, the
  // next thing a person needs is to read it back and confirm, not to keep
  // typing. Escape drops back to the conversation without losing the draft.
  const reviewing = Boolean(ai && (ai.status === 'review' || ai.status === 'submitted'));
  React.useEffect(() => {
    if (!reviewing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') ai?.reset();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [reviewing, ai]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit(e);
    }
  };

  const autoGrow = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDraft(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
  };

  const results = filtered ?? messages;
  const micActive = voiceState === 'listening';
  // Three states, three different meanings, so three different labels. A single
  // "mute" label on a button that is really "start a voice session" is how a
  // control ends up doing nothing and looking broken.
  const micIdle = voiceState === 'idle' || voiceState === 'error';
  const micLabel = micIdle
    ? t('voice.startVoice')
    : micActive
      ? t('voice.mute')
      : t('voice.unmute');

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      {/* Search */}
      {showSearch && messages.length > 0 && (
        <div className="shrink-0 border-b border-navy-100 bg-white/80 px-3 py-2.5 backdrop-blur sm:px-4">
          <AnimatePresence initial={false} mode="wait">
            {searchOpen ? (
              <motion.div
                key="search"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="relative">
                  <SearchField
                    ref={searchRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t('chat.searchPlaceholder')}
                    aria-label={t('chat.searchAria')}
                    inputClassName="h-10 pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('');
                      setSearchOpen(false);
                    }}
                    aria-label={t('chat.closeSearch')}
                    className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-navy-400 hover:bg-navy-100 hover:text-navy-700"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </div>
                <p role="status" aria-live="polite" className="mt-1.5 px-1 text-2xs text-navy-400">
                  {query
                    ? t(
                        (filtered?.length ?? 0) === 1
                          ? 'chat.searchMatches'
                          : 'chat.searchMatchesPlural',
                        { n: filtered?.length ?? 0, query },
                      )
                    : t('chat.searchHint')}
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="bar"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center justify-between gap-3"
              >
                <p className="flex items-center gap-1.5 text-xs font-semibold text-navy-500">
                  <ShieldCheck className="size-3.5 text-relief-600" aria-hidden="true" />
                  {t('chat.entries', { n: messages.length })}
                </p>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setSearchOpen(true)}
                  className="shrink-0"
                >
                  <Search className="size-3.5" aria-hidden="true" />
                  {t('chat.searchLog')}
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Transcript */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-surface px-3 py-4 sm:px-4">
        {query && (
          <p className="mb-3 flex items-center gap-1.5 rounded-lg bg-alert-50 px-3 py-2 text-xs font-semibold text-alert-800 ring-1 ring-inset ring-alert-200">
            <Search className="size-3.5" aria-hidden="true" />
            {t('chat.showingResults')}
            <button
              type="button"
              onClick={() => setQuery('')}
              className="ml-auto underline underline-offset-2"
            >
              {t('chat.clear')}
            </button>
          </p>
        )}

        {/* Safety guidance from the assistant sits above the transcript: it is
            the one instruction that must not be scrolled past. */}
        {ai?.safetyNote && !reviewing && (
          <Notice tone="critical" icon={ShieldCheck} className="mb-3">
            {ai.safetyNote}
          </Notice>
        )}

        {/* Sticky note that the live assistant is down. The per-message
            "Offline reply" marker says *which* answers were canned; this says
            why, once, instead of repeating the explanation on every bubble. */}
        {ai?.offline && !reviewing && (
          <Notice tone="caution" icon={WifiOff} className="mb-3">
            {t('chat.offlineNotice')}
          </Notice>
        )}

        {/* Empty state. The transcript starts empty on purpose, so this is the
            first thing a visitor sees and it has to do the job the old seed
            was doing: say what to do next. It states only what the app will
            actually do — ask for what is missing, then read it back before
            anything is sent. No example conversation, no captured fields, and
            no department, because a reporter must not be able to mistake any of
            that for something that already happened. */}
        {messages.length === 0 && !reviewing && (
          <div className="flex min-h-full flex-col items-center justify-center px-2 py-10 text-center">
            <span
              className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-dispatch-500 to-dispatch-700 text-white shadow-soft"
              aria-hidden="true"
            >
              <Sparkles className="size-5" />
            </span>
            <p className="mt-3.5 text-sm font-bold tracking-tight text-navy-900">
              {t('chat.empty.title')}
            </p>
            <p className="mt-1.5 max-w-[30ch] text-xs leading-relaxed text-navy-500">
              {t('chat.empty.body')}
            </p>
            <p className="mt-4 flex items-center gap-1.5 text-2xs font-semibold text-relief-700">
              <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
              {t('chat.empty.reassure')}
            </p>
          </div>
        )}

        {/* `data-no-translate`: the transcript is a record of what the reporter
            said, and a ticket built from it is filed against those words. The
            surrounding chrome — the empty state above, the quick phrases, the
            hints — is all curated copy and is translated normally. */}
        <ul ref={listRef} className="space-y-3.5" data-no-translate>
          {results.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}

          {waiting && (
            <motion.li
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex gap-2.5"
            >
              <span
                className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-dispatch-500 to-dispatch-700 text-white"
                aria-hidden="true"
              >
                <Sparkles className="size-4" />
              </span>
              <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm border border-navy-200 bg-white px-3.5 py-3 shadow-xs">
                <Loader2 className="size-4 animate-spin text-dispatch-600" aria-hidden="true" />
                <span className="text-sm text-navy-500">{t('chat.checking')}</span>
              </div>
              <span role="status" aria-live="polite" className="sr-only">
                {t('chat.typing')}
              </span>
            </motion.li>
          )}

          {/* Inline action cards, placed directly in the conversation flow */}
          {actionCards
            .filter((c) => c.status !== 'dismissed')
            .map((card) => (
              <motion.li
                key={card.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <ActionCardBanner
                  card={card}
                  onConfirm={onConfirmCard}
                  onDismiss={onDismissCard}
                />
              </motion.li>
            ))}
        </ul>
      </div>

      {/* Composer */}
      {/* Still collecting. The list names what is outstanding, so the user knows
          the conversation has a destination. */}
      {ai && !reviewing && ai.missing.length > 0 && (
        <div className="shrink-0 border-t border-navy-100 bg-white px-3 py-2 sm:px-4">
          {ai.asking.length === 0 && <IntakeChecklist state={ai} />}
          <button
            type="button"
            onClick={ai.openReview}
            className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg py-1 text-2xs font-semibold text-navy-500 underline underline-offset-2 transition-colors hover:text-navy-900"
          >
            <PencilLine className="size-3 shrink-0" aria-hidden="true" />
            {t('chat.manualForm')}
          </button>
        </div>
      )}

      {/* Review step. Takes over the composer entirely once the intake has every
          required attribute, so confirming cannot be mistaken for sending
          another message. */}
      {reviewing && ai ? (
        <TicketReview
          state={ai}
          className="safe-bottom shrink-0 border-t border-navy-200 bg-white"
        />
      ) : (
        <form
          onSubmit={submit}
          className="safe-bottom shrink-0 border-t border-navy-200 bg-white/90 px-3 py-3 backdrop-blur-xl sm:px-4"
        >
          {/* Progress toward the review step. The assistant collects a fixed set
              of attributes, so showing how many are left sets an expectation
              the user can actually reach. */}
          {ai && ai.missing.length > 0 && (
            <p className="mb-2.5 flex items-center gap-2 text-2xs font-semibold text-navy-500">
              <span
                className="h-1.5 flex-1 overflow-hidden rounded-full bg-navy-100"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={ai.missing.length + 1}
                aria-valuenow={1}
                aria-label={t('chat.stillNeeded', { n: ai.missing.length })}
              >
                <span
                  className="block h-full rounded-full bg-dispatch-500 transition-[width] duration-500 ease-out"
                  style={{
                    width: `${(1 / (ai.missing.length + 1)) * 100}%`,
                  }}
                />
              </span>
              <span className="nums shrink-0">{t('chat.moreToGo', { n: ai.missing.length })}</span>
            </p>
          )}

          {/* The mic sits *outside* the textarea's own relative box, because
              that box already holds the send button in its bottom-right corner
              and the text field is padded for exactly one control. */}
          <div className="flex items-end gap-2">
            <Button
              type="button"
              variant={micActive ? 'accent' : 'outline'}
              size="iconLg"
              onClick={onToggleMic}
              aria-pressed={micActive}
              srLabel={micLabel}
              className="shrink-0"
            >
              {micIdle ? <Mic aria-hidden="true" /> : micActive ? <MicOff aria-hidden="true" /> : <Mic aria-hidden="true" />}
            </Button>

            <div className="relative min-w-0 flex-1">
              <label htmlFor="relief-chat-input" className="sr-only">
                {t('chat.inputLabel')}
              </label>
              <textarea
                id="relief-chat-input"
                ref={inputRef}
                rows={1}
                value={draft}
                onChange={autoGrow}
                onKeyDown={onKeyDown}
                placeholder={t('chat.inputPlaceholder')}
                aria-describedby="relief-chat-help"
                className={cn(
                  'max-h-40 min-h-[52px] w-full resize-none rounded-xl border border-navy-200 bg-white py-3.5 pl-4 pr-12 text-[15px] leading-relaxed text-navy-800',
                  'placeholder:text-navy-400',
                  'focus-visible:outline-none focus-visible:border-dispatch-500 focus-visible:ring-2 focus-visible:ring-dispatch-600/30',
                )}
              />
              <Button
                type="submit"
                size="icon"
                disabled={!draft.trim() || waiting}
                className="absolute bottom-2.5 right-2.5"
                srLabel={t('chat.send')}
              >
                <ArrowUp aria-hidden="true" />
              </Button>
            </div>
          </div>

          <div
            id="relief-chat-help"
            className="mt-2 flex items-center justify-between gap-3 text-2xs text-navy-400"
          >
            <p className="flex min-w-0 items-center gap-1.5">
              <CornerDownLeft className="size-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{t('chat.keyboardHint')}</span>
            </p>
          </div>
        </form>
      )}
    </div>
  );
}
