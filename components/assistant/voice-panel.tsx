'use client';

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Keyboard,
  Loader2,
  Mic,
  MicOff,
  PhoneOff,
  Send,
  Sparkles,
  Square,
} from 'lucide-react';
import type { LiveSession, LiveSessionSnapshot } from '@/lib/live-client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { VoiceWaveform } from './voice-waveform';
import { Eyebrow } from '@/components/ui/primitives';
import { useLocale } from '@/lib/i18n';

/**
 * The voice line's controls, transcript and state.
 *
 * Every word on this screen is about something that is actually true right now.
 * That is the whole design rule, and it is a change from what was here before:
 * the panel used to narrate a simulation, so it could promise things that were
 * fiction — a hands-free mode that did not exist, an "Encrypted" badge nobody had
 * verified, a hint about confirming an address to a dispatcher who was not
 * listening. A reporter deciding whether to trust this thing with their location
 * and someone else's phone number is exactly the person who cannot afford
 * optimistic UI, so the awkward facts are the ones that get stated.
 *
 * The three that changed most:
 *
 *  - No hands-free toggle. Voice activity detection is on whenever the microphone
 *    is, so there is nothing to switch; a button implying a mode that does not
 *    exist is worse than its absence.
 *  - No "Encrypted" badge. The socket is `wss://`, which is real, but a badge
 *    asserts a property of a product rather than a property of a transport, and
 *    this app stores a reporter's name, number and address in plain Postgres
 *    columns. What replaced it is the elapsed timer and the live mic state, which
 *    are both checkable.
 *  - The transcript is the call, not a decorative fragment — the same turns that
 *    will be attached to the ticket, so a reporter can read back what they said
 *    before it is stored.
 */

/**
 * Key pairs rather than copy.
 *
 * The sentences live in `lib/i18n-strings.ts` so a language change can swap
 * them; keeping English here as well would give the same string two homes and
 * let them drift.
 */
const STATE_KEYS: Record<
  LiveSessionSnapshot['state'],
  { label: string; hint: string }
> = {
  idle: { label: 'voice.idle', hint: 'voice.idleHint' },
  connecting: { label: 'voice.connecting', hint: 'voice.connectingHint' },
  listening: { label: 'voice.listening', hint: 'voice.listeningHint' },
  thinking: { label: 'voice.thinking', hint: 'voice.thinkingHint' },
  speaking: { label: 'voice.speaking', hint: 'voice.speakingHint' },
  muted: { label: 'voice.muted', hint: 'voice.mutedHint' },
  error: { label: 'voice.error', hint: 'voice.errorHint' },
};

/**
 * What each network step is called, in the reporter's terms.
 *
 * These are three different problems sharing the word "connecting", and the
 * difference matters to whoever is trying to help: waiting on our own server
 * means the backend is down, waiting on the socket means something between the
 * reporter and Google is blocking it, and waiting on setup means the handshake
 * itself was refused. Without these the panel could only ever say "Connecting…",
 * which is true throughout and useless throughout.
 */
const STAGE_KEYS: Record<
  NonNullable<LiveSessionSnapshot['connectingStage']>,
  { label: string; hint: string }
> = {
  token: { label: 'voice.connecting', hint: 'voice.stage.token' },
  socket: { label: 'voice.connecting', hint: 'voice.stage.socket' },
  setup: { label: 'voice.connecting', hint: 'voice.stage.setup' },
};

export function VoicePanel({
  snapshot,
  session,
  onStart,
  onToggleMic,
  onSendText,
  onEnd,
  model,
  className,
}: {
  snapshot: LiveSessionSnapshot;
  /** Read for the live input level only. Null until a session opens. */
  session: LiveSession | null;
  onStart: () => void;
  onToggleMic: () => void;
  /** The escape hatch: answer a question by typing, hear the reply spoken. */
  onSendText: (text: string) => void;
  onEnd: () => void;
  model: string;
  className?: string;
}) {
  const { t } = useLocale();
  const stateKeys = STATE_KEYS[snapshot.state];

  /**
   * What the panel says, which is not always what the state is.
   *
   * `displayState` has to collapse a rich session onto a handful of display
   * states, and "the socket is up but the microphone is not" has no honest home
   * among them — it is close enough to `connecting` to land there. That collapse
   * is fine for a wave animation and wrong for a sentence, because the reporter
   * is being asked to allow a microphone and the UI is telling them to wait for a
   * network. So the one thing worth saying plainly overrides the label.
   */
  const waitingOnMic = snapshot.micPending;
  const stageKeys = snapshot.connectingStage
    ? STAGE_KEYS[snapshot.connectingStage]
    : null;
  const label = waitingOnMic
    ? t('voice.micPending')
    : stageKeys
      ? t(stageKeys.label)
      : t(stateKeys.label);
  const hint = waitingOnMic
    ? t('voice.micPendingHint')
    : (stageKeys ? t(stageKeys.hint) : t(stateKeys.hint));

  /**
   * Whether there is a call to hang up on.
   *
   * Distinct from "the session is not idle", because a session that failed
   * *before opening* — no microphone, no token, socket refused — is over, and
   * the useful thing to offer is another try rather than a button that appears
   * to end something which never began.
   */
  const inCall =
    snapshot.connection === 'live' ||
    snapshot.connection === 'connecting' ||
    snapshot.connection === 'reconnecting' ||
    waitingOnMic;
  const failed = snapshot.state === 'error' && !inCall;
  const level = useInputLevel(session, snapshot.capturing);
  const turns = snapshot.turns;
  const turnsRef = React.useRef<HTMLOListElement>(null);

  // The newest turn is the one being read, so keep it in view. Not a layout
  // effect on the count alone: the last turn's text grows as it is transcribed.
  React.useEffect(() => {
    const node = turnsRef.current;
    if (node) node.scrollTo({ top: node.scrollHeight });
  }, [turns]);

  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col overflow-hidden bg-navy-950 text-white',
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 surface-grid-dark opacity-40" aria-hidden="true" />
      <div
        className={cn(
          'pointer-events-none absolute left-1/2 top-1/3 size-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl transition-all duration-700',
          waitingOnMic
            ? 'bg-navy-500/20'
            : snapshot.state === 'listening'
              ? 'bg-emergency-600/25'
            : snapshot.state === 'speaking'
              ? 'bg-dispatch-500/20'
              : 'bg-navy-700/30',
        )}
        aria-hidden="true"
      />

      {/* Status strip */}
      <div className="relative flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn(
              'grid size-8 shrink-0 place-items-center rounded-lg',
              snapshot.state === 'listening' ? 'bg-emergency-500' : 'bg-white/10',
            )}
            aria-hidden="true"
          >
            {snapshot.state === 'connecting' || snapshot.state === 'thinking' || waitingOnMic ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{label}</p>
            <p className="truncate text-2xs text-white/50">{hint}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* Real facts about this session, replacing the badge that was not. */}
          {inCall && snapshot.connection === 'live' && (
            <span className="nums hidden text-2xs font-semibold tabular-nums text-white/50 sm:inline">
              {formatElapsed(snapshot.elapsed)}
            </span>
          )}
          {inCall && (
            <Button
              variant="ghostLight"
              size="iconSm"
              onClick={onEnd}
              srLabel={t('voice.endContinue')}
              className="shrink-0"
            >
              <PhoneOff aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>

      {/* Waveform + transcript */}
      <div className="relative flex min-h-0 flex-1 flex-col px-5 py-5">
        <div className="mx-auto w-full max-w-md">
          <VoiceWaveform
            state={snapshot.state}
            level={level}
            className="h-20"
          />

          {/* One live region for the voice state. `assertive` while listening
              because that is the state a screen-reader user needs to know has
              begun — everything here is opt-in, so nothing announces itself by
              accident until they are already in it. */}
          <p
            role="status"
            aria-live={snapshot.state === 'listening' ? 'assertive' : 'polite'}
            className="mt-3 text-center text-sm font-semibold text-white/80"
          >
            {snapshot.state === 'listening' ? t('voice.iAmListening') : hint}
          </p>

          {snapshot.error && (
            <p
              role="alert"
              className="mt-3 flex items-start gap-2 rounded-xl border border-alert-400/30 bg-alert-500/10 px-3 py-2.5 text-xs font-semibold leading-relaxed text-alert-200"
            >
              {snapshot.error}
            </p>
          )}

          {/* A retry, but only when retrying can actually help. If the call
              dropped mid-sentence the transcript and the draft are still here and
              a second call is a new conversation, not a continuation — the
              session's own reconnect is the right answer there, and it is already
              trying. This is for the failures that never became a call at all. */}
          {failed && (
            <div className="mt-3 flex justify-center">
              <Button variant="ghostLight" size="sm" onClick={onStart}>
                <Mic className="size-4" aria-hidden="true" />
                {t('voice.retry')}
              </Button>
            </div>
          )}

          {/* The call so far. The same turns that will be stored with the
              ticket, so a reporter can read back a phone number before it is
              filed rather than after. */}
          <ol
            ref={turnsRef}
            className="mt-4 max-h-56 min-h-[5.5rem] space-y-2 overflow-y-auto overscroll-contain"
          >
            <AnimatePresence initial={false}>
              {snapshot.turns.map((turn, index) => (
                <motion.li
                  key={`${turn.role}-${index}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    'rounded-2xl border p-3 backdrop-blur',
                    turn.role === 'reporter'
                      ? 'ml-8 border-white/10 bg-white/5'
                      : 'mr-8 border-dispatch-400/25 bg-dispatch-500/10',
                  )}
                >
                  <Eyebrow className="text-white/40">
                    {t(turn.role === 'reporter' ? 'voice.youSaid' : 'voice.iSaid')}
                  </Eyebrow>
                  <p className="mt-1 text-[15px] leading-relaxed text-white/95">
                    {turn.text}
                  </p>
                </motion.li>
              ))}
            </AnimatePresence>
            {snapshot.turns.length === 0 && !snapshot.error && (
              <li className="text-center text-xs leading-relaxed text-white/40">
                {inCall ? t('voice.turnsEmptyInCall') : t('voice.turnsEmptyIdle')}
              </li>
            )}
          </ol>
        </div>
      </div>

      {/* Controls */}
      <div className="relative shrink-0 border-t border-white/10 bg-navy-950/60 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur-xl">
        <div className="mx-auto max-w-md">
          {/* Type instead of speaking. The conversation continues, the model
              still answers aloud, and a caller who cannot speak — or whose
              microphone is broken, or who is somewhere too loud to talk — is
              never stuck. */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const input = e.currentTarget.elements.namedItem('voice-reply');
              if (!(input instanceof HTMLTextAreaElement)) return;
              const text = input.value.trim();
              if (!text) return;
              onSendText(text);
              input.value = '';
            }}
            className="mb-4 flex items-end gap-2"
          >
            <label htmlFor="voice-reply" className="sr-only">
              {t('voice.typeInsteadAria')}
            </label>
            <textarea
              id="voice-reply"
              name="voice-reply"
              rows={1}
              placeholder={t('voice.typeInsteadPlaceholder')}
              className="min-h-11 flex-1 resize-none rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-base leading-relaxed text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/30"
            />
            <Button
              type="submit"
              variant="ghostLight"
              size="icon"
              srLabel={t('voice.sendReply')}
            >
              <Send aria-hidden="true" />
            </Button>
          </form>

          <div className="flex items-center justify-center gap-3">
            {/* Start / stop. One control, because that is the decision: is this
                call happening or not. */}
            <button
              type="button"
              onClick={inCall ? onEnd : onStart}
              aria-label={t(inCall ? 'voice.endCall' : 'voice.startCall')}
              className={cn(
                'group relative grid size-[4.5rem] shrink-0 place-items-center rounded-full transition-all duration-200',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-navy-950',
                inCall
                  ? 'bg-emergency-500 text-white hover:bg-emergency-600'
                  : 'bg-relief-500 text-white hover:bg-relief-600',
              )}
            >
              {inCall && snapshot.state === 'listening' && (
                <span
                  className="absolute inset-0 animate-pulse-ring rounded-full bg-emergency-400/50"
                  aria-hidden="true"
                />
              )}
              {inCall ? (
                <Square className="size-6 fill-current" aria-hidden="true" />
              ) : (
                <Mic className="size-7" aria-hidden="true" />
              )}
            </button>

            {/* Mute. Present only once there is a call to mute. */}
            {inCall && (
              <button
                type="button"
                onClick={onToggleMic}
                aria-pressed={snapshot.muted}
                aria-label={t(snapshot.muted ? 'voice.unmute' : 'voice.mute')}
                className={cn(
                  'grid size-14 shrink-0 place-items-center rounded-full transition-all duration-200',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-navy-950',
                  snapshot.muted
                    ? 'bg-alert-500 text-white hover:bg-alert-600'
                    : 'bg-white/10 text-white ring-1 ring-inset ring-white/20 hover:bg-white/15',
                )}
              >
                {snapshot.muted ? (
                  <MicOff className="size-6" aria-hidden="true" />
                ) : (
                  <Mic className="size-6" aria-hidden="true" />
                )}
              </button>
            )}
          </div>

          <div className="mt-4 flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
            <p className="text-2xs leading-relaxed text-white/45">
              {inCall ? (
                <>
                  {t('voice.handsFree')}{' '}
                  <span className="text-white/30">({model})</span>
                </>
              ) : (
                t('voice.notRecorded')
              )}
            </p>
            <button
              type="button"
              onClick={onEnd}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold text-white underline-offset-4 hover:bg-white/10 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <Keyboard className="size-3.5" aria-hidden="true" />
              {t('voice.useText')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Poll the microphone's actual level.
 *
 * From the session rather than from state, because the analyser node is not
 * React's business and a re-render per audio frame would be absurd. Polled on a
 * timer and written to state only when it moves enough to see, so a silent
 * microphone costs nothing and a loud one still animates.
 */
function useInputLevel(session: LiveSession | null, capturing: boolean): number {
  const [level, setLevel] = React.useState(0);

  React.useEffect(() => {
    if (!session || !capturing) {
      setLevel(0);
      return;
    }
    const timer = window.setInterval(() => {
      const next = session.getInputLevel();
      setLevel((prev) => (Math.abs(prev - next) > 0.02 ? next : prev));
    }, 90);
    return () => window.clearInterval(timer);
  }, [session, capturing]);

  return level;
}

function formatElapsed(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}
