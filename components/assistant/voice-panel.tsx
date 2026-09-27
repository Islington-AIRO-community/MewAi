'use client';

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CheckCheck,
  Keyboard,
  Loader2,
  Mic,
  MicOff,
  PhoneOff,
  Radio,
  Sparkles,
} from 'lucide-react';
import type { VoiceState } from '@/lib/types';
import type { LiveVoiceFailure, LiveVoiceStatus } from '@/lib/live-voice/use-live-voice';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { VoiceWaveform } from './voice-waveform';
import { VOICE_PROMPTS } from '@/lib/mock-data';

/**
 * `muted` is here because the waveform renders it, and a flat line is a true
 * signal that the microphone is off — better than a waveform that keeps moving
 * on a muting it does not know about. `thinking` is absent because a real
 * session never enters it: the server decides when to speak, so the gap between
 * the reporter finishing and the assistant starting is silence, and rendering a
 * spinner for it would be inventing latency that does not exist.
 */
const STATE_COPY: Record<
  Exclude<VoiceState, 'thinking'>,
  { label: string; hint: string; tone: 'navy' | 'emergency' | 'alert' | 'relief' }
> = {
  idle: {
    label: 'Voice mode ready',
    hint: 'Tap the microphone to start talking',
    tone: 'navy',
  },
  connecting: {
    label: 'Connecting…',
    hint: 'Securing an encrypted voice channel',
    tone: 'navy',
  },
  listening: {
    label: 'Listening',
    hint: 'Speak naturally — I will confirm the address before dispatching',
    tone: 'emergency',
  },
  speaking: {
    label: 'Speaking',
    hint: 'Confirm the details I read back to you',
    tone: 'navy',
  },
  muted: {
    label: 'Microphone off',
    hint: 'You can still hear me. Unmute when you are ready to speak.',
    tone: 'alert',
  },
  error: {
    label: 'Voice unavailable',
    hint: 'Falling back to text chat so you are never blocked',
    tone: 'alert',
  },
};

export function VoicePanel({
  status,
  assistantSpeaking,
  muted,
  failure,
  transcript,
  level,
  canSubmit,
  onToggleMic,
  onStop,
  onSubmit,
  onSwitchToText,
  className,
}: {
  status: LiveVoiceStatus;
  /** True while the assistant's audio is playing. */
  assistantSpeaking: boolean;
  /** The microphone is off. The session keeps running. */
  muted: boolean;
  /** Set when voice cannot continue. Copy is ready to render as-is. */
  failure: LiveVoiceFailure | null;
  /** What the reporter said on their most recent completed turn. */
  transcript: string;
  /** Mic loudness 0..1, for the waveform. */
  level: number;
  /** True once there is a spoken turn worth turning into a ticket. */
  canSubmit: boolean;
  onToggleMic: () => void;
  onStop: () => void;
  /** Hand the spoken conversation to the intake. */
  onSubmit: () => void;
  onSwitchToText: () => void;
  className?: string;
}) {
  // The visual vocabulary is still `VoiceState`, because the waveform is
  // built around it. The mapping is the honest one: a real session has fewer
  // states than the simulation did, because the server decides when to speak
  // and the microphone never closes. There is no "thinking" — the gap between
  // the reporter finishing and the assistant starting is silence, and inventing
  // a state for it would be inventing latency that does not exist.
  const state: VoiceState = failure
    ? 'error'
    : status === 'idle'
      ? 'idle'
      : status === 'connecting' || status === 'reconnecting'
        ? 'connecting'
        : assistantSpeaking
          ? 'speaking'
          : muted
            ? 'muted'
            : 'listening';

  const copy = STATE_COPY[state];
  const live = status === 'listening' || status === 'reconnecting';
  const busy = status === 'connecting';

  // The failure message is rendered once, in the block at the foot of the
  // panel. It used to be *also* used as the hint here, so a single failure
  // printed the same sentence two or three times — which reads as several
  // different errors, and is exactly the wrong impression to give someone who
  // needs to know whether help is still available. The hint carries the
  // instruction; the block carries the reason.
  const hint = failure
    ? 'Nothing you said has been lost.'
    : status === 'reconnecting'
      ? 'Reconnecting — your conversation is saved'
      : copy.hint;

  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col overflow-hidden bg-navy-950 text-white',
        className,
      )}
    >
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0 surface-grid-dark opacity-40" aria-hidden="true" />
      <div
        className={cn(
          'pointer-events-none absolute left-1/2 top-1/3 size-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl transition-all duration-700',
          state === 'listening'
            ? 'bg-emergency-600/25'
            : state === 'speaking'
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
              state === 'listening' ? 'bg-emergency-500' : 'bg-white/10',
            )}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="size-4" aria-hidden="true" />
            )}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{copy.label}</p>
            <p className="truncate text-2xs text-white/50">{hint}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* The socket is a direct `wss://` to Google, so this is a true
              statement rather than decoration: audio never touches our server. */}
          <Badge tone="glass" size="sm">
            <Radio className="size-3" aria-hidden="true" />
            Encrypted
          </Badge>
          <Button
            variant="ghostLight"
            size="iconSm"
            onClick={onStop}
            srLabel="End voice session"
            className="shrink-0"
          >
            <PhoneOff aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* Waveform stage */}
      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center px-5 py-6">
        <div className="w-full max-w-md">
          <VoiceWaveform state={state} amplitude={0.35 + level * 3.2} className="h-24" />

          <p
            role="status"
            aria-live={state === 'listening' ? 'assertive' : 'polite'}
            className="mt-4 text-center text-sm font-semibold text-white/80"
          >
            {muted
              ? 'Microphone off'
              : state === 'listening'
                ? assistantSpeaking
                  ? 'I am speaking — you can interrupt me at any time'
                  : 'I am listening…'
                : hint}
          </p>

          {/* Live transcript */}
          <div className="mt-4 min-h-[5.5rem]">
            <AnimatePresence mode="wait">
              {transcript ? (
                <motion.div
                  key="transcript"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur"
                >
                  <p className="text-2xs font-bold uppercase tracking-[0.1em] text-white/40">
                    You said
                  </p>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-white/95">
                    {transcript}
                    {state === 'listening' && !muted && (
                      <span
                        className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-emergency-400 align-middle"
                        aria-hidden="true"
                      />
                    )}
                  </p>
                </motion.div>
              ) : (
                <motion.p
                  key="hint"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center text-xs leading-relaxed text-white/40"
                >
                  {status === 'idle' ? VOICE_PROMPTS[0] : copy.hint}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="relative shrink-0 border-t border-white/10 bg-navy-950/60 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-md flex-col items-center gap-4">
          {failure ? (
            <>
              <p className="text-center text-xs leading-relaxed text-alert-200">
                {failure.message}
              </p>
              <Button variant="primary" size="lg" onClick={onSwitchToText} className="w-full">
                <Keyboard className="size-4" aria-hidden="true" />
                Continue in text chat
              </Button>
            </>
          ) : (
            <>
              {/* There is no push-to-talk button, and the reason matters.
                  The microphone is open for the whole session and the server
                  decides where a turn ends, so a button that looked like
                  "hold to speak" would be describing a control that does
                  nothing. Mute is the only thing the reporter needs mid-session,
                  and "I'm done" is the one action that ends it. */}
              <Button
                variant="primary"
                size="lg"
                onClick={onSubmit}
                disabled={!canSubmit}
                className="w-full"
              >
                <CheckCheck className="size-4" aria-hidden="true" />
                {canSubmit
                  ? 'I have told you everything'
                  : 'Nothing heard yet'}
              </Button>

              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={onToggleMic}
                  aria-pressed={muted}
                  aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}
                  className={cn(
                    'grid size-14 shrink-0 place-items-center rounded-full transition-all duration-200',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-navy-950',
                    muted
                      ? 'bg-alert-500 text-white hover:bg-alert-600'
                      : 'bg-white/10 text-white ring-1 ring-inset ring-white/20 hover:bg-white/15',
                  )}
                >
                  {muted ? (
                    <MicOff className="size-6" aria-hidden="true" />
                  ) : (
                    <Mic className="size-6" aria-hidden="true" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={onStop}
                  aria-label="End voice session"
                  className={cn(
                    'grid size-14 shrink-0 place-items-center rounded-full transition-all duration-200',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-navy-950',
                    live
                      ? 'bg-emergency-500 text-white hover:bg-emergency-600'
                      : 'bg-white/10 text-white ring-1 ring-inset ring-white/20 hover:bg-white/15',
                  )}
                >
                  <PhoneOff className="size-6" aria-hidden="true" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

