'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Maximize2,
  MessageSquareText,
  Mic,
  Minimize2,
  Sparkles,
  X,
} from 'lucide-react';
import type { ActionCard, VoiceState } from '@/lib/types';
import { cn, truncate } from '@/lib/utils';
import { useApp } from '@/lib/store';
import type { AiChatApi } from '@/lib/use-ai-chat';
import { usePrefersReducedMotion } from '@/lib/hooks';
import { Button } from '@/components/ui/button';
import { TabList, TabPanel, TabsProvider } from '@/components/ui/tabs';
import { VoiceOrb } from './voice-waveform';
import { ChatPanel } from './chat-panel';
import { VoicePanel } from './voice-panel';

type Mode = 'chat' | 'voice';

/**
 * The AI Relief Assistant.
 *
 * Two presentations, one engine:
 *  - `variant="floating"`: docked panel anchored above the SOS bar (desktop),
 *    full-height sheet on mobile.
 *  - `variant="fullscreen"`: the dedicated /chat experience.
 *
 * Keyboard: Escape closes the floating panel, `Ctrl/Cmd + K` focuses the
 * composer, and the launcher is a real button with a pressed state.
 */
export function ReliefAssistant({
  variant = 'floating',
  defaultMode = 'chat',
  defaultOpen = false,
  className,
  onOpenChange,
  ai,
}: {
  variant?: 'floating' | 'fullscreen';
  defaultMode?: Mode;
  defaultOpen?: boolean;
  className?: string;
  onOpenChange?: (open: boolean) => void;
  /**
   * The live intake, owned by the mounting surface rather than created here.
   *
   * The hook is a required prop rather than an internal one because the surfaces
   * that can *also* start a conversation — the /chat quick phrases, the
   * `?intent=` deep link, the floating launcher in the shell — must drive the
   * same intake instance, or a ticket draft started in one place would not be
   * the draft the other place is reviewing.
   */
  ai: AiChatApi;
}) {
  const { messages, actionCards, confirmActionCard, dismissActionCard } = useApp();
  const pathname = usePathname();
  const reduced = usePrefersReducedMotion();

  const [open, setOpen] = React.useState(defaultOpen);
  const [mode, setMode] = React.useState<Mode>(defaultMode);
  const [voiceState, setVoiceState] = React.useState<VoiceState>('idle');
  const [handsFree, setHandsFree] = React.useState(false);
  const [transcript, setTranscript] = React.useState('');
  const [hasUnread, setHasUnread] = React.useState(true);
  const [expanded, setExpanded] = React.useState(false);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const closeRef = React.useRef<HTMLButtonElement>(null);

  // Always the latest `ai.send`. The voice loop below schedules work with
  // `setTimeout` and a typing interval, and those callbacks capture the render
  // that started them — so they read the current function through this ref
  // rather than a binding from a possibly long-past render. It is deliberately
  // not an effect dep: `ai.send` changes identity on every draft edit, and
  // depending on it would restart the voice loop mid-conversation.
  const sendRef = React.useRef(ai.send);
  sendRef.current = ai.send;

  const isFullscreen = variant === 'fullscreen';
  const show = isFullscreen ? true : open;

  const setShow = React.useCallback(
    (next: boolean) => {
      setOpen(next);
      onOpenChange?.(next);
    },
    [onOpenChange],
  );

  // Mark the assistant as read once it is actually visible.
  React.useEffect(() => {
    if (show && hasUnread) setHasUnread(false);
  }, [show, hasUnread]);

  // Close on route change (floating variant only).
  React.useEffect(() => {
    if (isFullscreen) return;
    setShow(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  React.useEffect(() => {
    if (!open || isFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setShow(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, isFullscreen, setShow]);

  // Trap focus in the floating panel.
  React.useEffect(() => {
    if (!open || isFullscreen) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const node = panelRef.current;
      if (!node) return;
      const items = Array.from(
        node.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),textarea,input,[tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, isFullscreen]);

  /* ---------------- Voice simulation ---------------- */

  const startVoice = React.useCallback(() => {
    setVoiceState('connecting');
    window.setTimeout(() => setVoiceState('listening'), 700);
  }, []);

  const stopVoice = React.useCallback(() => {
    setVoiceState('idle');
    setTranscript('');
  }, []);

  const toggleMic = React.useCallback(() => {
    setVoiceState((prev) => {
      if (prev === 'muted') return 'listening';
      if (prev === 'listening' || prev === 'speaking' || prev === 'thinking') {
        setTranscript('');
        return 'muted';
      }
      // idle / error -> start a fresh session
      setTimeout(() => setVoiceState('listening'), 400);
      return 'connecting';
    });
  }, []);

  // Simulated turn-taking so the voice UI demonstrates every state.
  React.useEffect(() => {
    if (voiceState !== 'listening') return;
    const lines = [
      'There are three of us in the basement of Fairmount Apartments',
      'The water is coming up fast and my partner cannot walk',
      'We are on Alder Street, Eastvale, block C',
    ];
    let i = 0;
    const typeNext = () => {
      const line = lines[i % lines.length];
      let c = 0;
      setTranscript('');
      const type = window.setInterval(() => {
        c += 3;
        setTranscript(line.slice(0, c));
        if (c >= line.length) {
          window.clearInterval(type);
          i += 1;
          if (i === 1) {
            window.setTimeout(() => {
              setVoiceState('thinking');
              window.setTimeout(() => setVoiceState('speaking'), 900);
            }, 500);
          } else {
            window.setTimeout(() => {
              setVoiceState('speaking');
              // Spoken turns are real turns, so they go through the intake
              // rather than the scripted path. Read from a ref because
              // `ai.send` changes identity on every draft edit and putting it
              // in this effect's deps would restart the loop mid-conversation.
              sendRef.current(line, { viaVoice: true });
            }, 600);
          }
        }
      }, 26);
    };
    typeNext();
  }, [voiceState]);

  // Return to listening after the assistant finishes speaking.
  React.useEffect(() => {
    if (voiceState !== 'speaking') return;
    const t = window.setTimeout(() => {
      setTranscript('');
      setVoiceState('listening');
    }, 2600);
    return () => window.clearTimeout(t);
  }, [voiceState]);

  const handleSend = React.useCallback(
    (text: string) => {
      // Route through the live intake: it drives the backend and advances the
      // ticket draft. The store's scripted replies are the fallback underneath,
      // so a backend outage degrades instead of breaking.
      void ai.send(text);
    },
    [ai],
  );

  const handleConfirm = React.useCallback(
    (card: ActionCard) => {
      confirmActionCard(card.id);
    },
    [confirmActionCard],
  );

  const handleDismiss = React.useCallback(
    (card: ActionCard) => {
      dismissActionCard(card.id);
    },
    [dismissActionCard],
  );

  /* ---------------- Content ---------------- */

  const pendingCards = actionCards.filter((c) => c.status === 'pending');
  const latestAssistant = [...messages].reverse().find((m) => m.role === 'assistant');

  const header = (
    <div
      className={cn(
        'relative shrink-0 border-b px-4 py-3',
        isFullscreen
          ? 'border-navy-200 bg-white'
          : 'border-navy-200/80 bg-gradient-to-r from-navy-900 to-navy-800 text-white',
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-xl',
            isFullscreen
              ? 'bg-gradient-to-br from-dispatch-500 to-dispatch-700 text-white'
              : 'bg-white/10 text-white ring-1 ring-inset ring-white/15',
          )}
          aria-hidden="true"
        >
          <Sparkles className="size-4.5" />
        </span>

        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'truncate text-sm font-bold tracking-tight',
              isFullscreen ? 'text-navy-900' : 'text-white',
            )}
          >
            FLARE Relief Assistant
          </p>
          <p
            className={cn(
              'flex items-center gap-1.5 truncate text-2xs',
              isFullscreen ? 'text-navy-500' : 'text-white/60',
            )}
          >
            <span className="relative flex size-1.5" aria-hidden="true">
              <span
                className={cn(
                  'absolute inset-0 animate-pulse-ring rounded-full',
                  isFullscreen ? 'bg-relief-500' : 'bg-relief-400',
                )}
              />
              <span
                className={cn(
                  'relative size-1.5 rounded-full',
                  isFullscreen ? 'bg-relief-500' : 'bg-relief-400',
                )}
              />
            </span>
            Online · routes to 5 response departments
          </p>
        </div>

        {!isFullscreen && (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghostLight"
              size="iconSm"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              srLabel={expanded ? 'Restore panel size' : 'Expand to full screen'}
            >
              {expanded ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
            </Button>
            <Button
              ref={closeRef}
              variant="ghostLight"
              size="iconSm"
              onClick={() => setShow(false)}
              srLabel="Close the relief assistant"
            >
              <X aria-hidden="true" />
            </Button>
          </div>
        )}
      </div>

      {/* Mode switcher */}
      <div className="mt-3">
        <TabList
          label="Assistant mode"
          items={[
            { id: 'chat', label: 'Text chat', icon: MessageSquareText },
            { id: 'voice', label: 'Live voice', icon: Mic },
          ]}
        />
      </div>
    </div>
  );

  const handleModeChange = React.useCallback(
    (v: string) => {
      setMode(v as Mode);
      if (v === 'voice' && voiceState === 'idle') startVoice();
      if (v === 'chat') stopVoice();
    },
    [voiceState, startVoice, stopVoice],
  );

  const body = (
    <>
      <TabPanel value="chat" className="flex min-h-0 flex-1 flex-col">
        <ChatPanel
          messages={messages}
          actionCards={actionCards}
          isResponding={ai.busy}
          onSend={handleSend}
          onConfirmCard={handleConfirm}
          onDismissCard={handleDismiss}
          voiceState={voiceState}
          onToggleMic={toggleMic}
          ai={ai}
        />
      </TabPanel>

      <TabPanel value="voice" className="flex min-h-0 flex-1 flex-col">
        <VoicePanel
          state={voiceState}
          transcript={transcript}
          handsFree={handsFree}
          onToggleMic={toggleMic}
          onToggleHandsFree={() => setHandsFree((v) => !v)}
          onStop={() => {
            stopVoice();
            setMode('chat');
          }}
          onSwitchToText={() => {
            stopVoice();
            setMode('chat');
          }}
        />
      </TabPanel>
    </>
  );

  /* ---------------- Fullscreen ---------------- */

  if (isFullscreen) {
    return (
      <TabsProvider value={mode} onValueChange={handleModeChange}>
        <div className={cn('flex min-h-0 flex-1 flex-col bg-surface', className)}>
          {header}
          {body}
        </div>
      </TabsProvider>
    );
  }

  /* ---------------- Floating ---------------- */

  return (
    <>
      {/* Launcher */}
      <AnimatePresence>
        {!open && (
          <motion.button
            type="button"
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.8, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.8, y: 12 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            onClick={() => setShow(true)}
            aria-haspopup="dialog"
            aria-expanded="false"
            aria-label={
              hasUnread
                ? 'Open the FLARE Relief Assistant. You have new information captured from a previous conversation.'
                : 'Open the FLARE Relief Assistant'
            }
            className={cn(
              'group no-print no-tap-highlight relative grid size-14 shrink-0 place-items-center rounded-full',
              'bg-navy-900 text-white shadow-lift transition-transform duration-200 hover:scale-105 active:scale-95',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dispatch-600 focus-visible:ring-offset-2',
            )}
          >
            <VoiceOrb state={voiceState === 'idle' ? 'idle' : voiceState} size={56} />
            {hasUnread && (
              <span
                className="absolute -right-0.5 -top-0.5 size-3.5 rounded-full bg-emergency-500 ring-[3px] ring-white"
                aria-hidden="true"
              />
            )}
            {pendingCards.length > 0 && (
              <span
                className="nums absolute -bottom-0.5 -left-0.5 grid min-w-[20px] place-items-center rounded-full bg-dispatch-600 px-1 text-2xs font-black text-white ring-2 ring-white"
                aria-hidden="true"
              >
                {pendingCards.length}
              </span>
            )}
          </motion.button>
        )}
      </AnimatePresence>

      {/* Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="false"
            aria-label="FLARE Relief Assistant"
            data-assistant-panel=""
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.98 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              'pointer-events-auto no-print fixed z-[70] flex flex-col overflow-hidden bg-white shadow-lift',
              'inset-x-0 bottom-0 top-16 rounded-t-3xl',
              // On `sm`+ only the bottom edge is anchored, so the panel would
              // otherwise grow to the full height of the conversation and run off
              // the top of the screen. Cap it to the viewport and let the
              // message list scroll inside instead.
              'sm:inset-auto sm:bottom-[7.25rem] sm:right-4 sm:top-auto sm:max-h-[calc(100dvh-8.75rem)] sm:w-[26.5rem] sm:rounded-3xl sm:border sm:border-navy-200',
              expanded &&
                'sm:bottom-[5.5rem] sm:left-1/2 sm:right-auto sm:max-h-[calc(100dvh-7rem)] sm:w-[min(56rem,94vw)] sm:-translate-x-1/2 sm:rounded-3xl',
              className,
            )}
          >
            {/* Grab handle on mobile */}
            <div className="flex justify-center pt-2 sm:hidden" aria-hidden="true">
              <span className="h-1 w-10 rounded-full bg-navy-200" />
            </div>

            <TabsProvider value={mode} onValueChange={handleModeChange}>
              {header}
              {body}
            </TabsProvider>

            {/* Footnote */}
            <div className="hidden shrink-0 items-center justify-between gap-2 border-t border-navy-100 bg-navy-50/60 px-4 py-2 sm:flex">
              <p className="truncate text-2xs text-navy-400">
                {latestAssistant
                  ? truncate(latestAssistant.text, 54)
                  : 'Describe your situation to begin.'}
              </p>
              <span className="shrink-0 text-2xs font-semibold text-navy-400">v4.2</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
