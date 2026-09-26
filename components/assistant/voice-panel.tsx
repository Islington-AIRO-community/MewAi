'use client';

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Hand,
  Keyboard,
  Loader2,
  Mic,
  MicOff,
  PhoneOff,
  Radio,
  Sparkles,
  Square,
  Volume2,
} from 'lucide-react';
import type { VoiceState } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { VoiceWaveform } from './voice-waveform';
import { VOICE_PROMPTS } from '@/lib/mock-data';

const STATE_COPY: Record<VoiceState, { label: string; hint: string; tone: 'navy' | 'emergency' | 'alert' | 'relief' }> = {
  idle: { label: 'Voice mode ready', hint: 'Tap the microphone to start talking', tone: 'navy' },
  connecting: { label: 'Connecting…', hint: 'Securing an encrypted voice channel', tone: 'navy' },
  listening: { label: 'Listening', hint: 'Speak naturally — I will confirm the address before dispatching', tone: 'emergency' },
  thinking: { label: 'Processing', hint: 'Matching your request to a response team', tone: 'navy' },
  speaking: { label: 'Speaking', hint: 'Confirm the details I read back to you', tone: 'navy' },
  muted: { label: 'Muted', hint: 'The microphone is off. Unmute when you are ready.', tone: 'alert' },
  error: { label: 'Voice unavailable', hint: 'Falling back to text chat so you are never blocked', tone: 'alert' },
};

export function VoicePanel({
  state,
  transcript,
  handsFree,
  onToggleMic,
  onToggleHandsFree,
  onStop,
  onSwitchToText,
  className,
}: {
  state: VoiceState;
  /** Live partial transcript from the last utterance. */
  transcript: string;
  handsFree: boolean;
  onToggleMic: () => void;
  onToggleHandsFree: () => void;
  onStop: () => void;
  onSwitchToText: () => void;
  className?: string;
}) {
  const copy = STATE_COPY[state];
  const muted = state === 'muted';
  const live = state === 'listening' || state === 'speaking' || state === 'thinking';

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
            {state === 'connecting' || state === 'thinking' ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="size-4" aria-hidden="true" />
            )}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{copy.label}</p>
            <p className="truncate text-2xs text-white/50">{copy.hint}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
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
          <VoiceWaveform state={state} className="h-24" />

          <p
            role="status"
            aria-live={state === 'listening' ? 'assertive' : 'polite'}
            className="mt-4 text-center text-sm font-semibold text-white/80"
          >
            {state === 'listening' ? 'I am listening…' : copy.hint}
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
                    {state === 'listening' && (
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
                  {VOICE_PROMPTS[state === 'listening' ? 2 : 0]}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="relative shrink-0 border-t border-white/10 bg-navy-950/60 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-md items-center justify-center gap-3">
          {/* Mute */}
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
            {muted ? <MicOff className="size-6" aria-hidden="true" /> : <Mic className="size-6" aria-hidden="true" />}
          </button>

          {/* Primary talk / stop */}
          <button
            type="button"
            onClick={live ? onStop : onToggleMic}
            aria-label={live ? 'Stop listening' : 'Start talking'}
            className={cn(
              'group relative grid size-[4.5rem] shrink-0 place-items-center rounded-full transition-all duration-200',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-navy-950',
              live
                ? 'bg-emergency-500 text-white hover:bg-emergency-600'
                : 'bg-relief-500 text-white hover:bg-relief-600',
            )}
          >
            {live && !state.includes('speak') && (
              <span
                className="absolute inset-0 animate-pulse-ring rounded-full bg-emergency-400/50"
                aria-hidden="true"
              />
            )}
            {live ? (
              <Square className="size-6 fill-current" aria-hidden="true" />
            ) : (
              <Volume2 className="size-7" aria-hidden="true" />
            )}
          </button>

          {/* Hands-free */}
          <button
            type="button"
            onClick={onToggleHandsFree}
            aria-pressed={handsFree}
            aria-label={handsFree ? 'Turn off hands-free mode' : 'Turn on hands-free mode'}
            className={cn(
              'grid size-14 shrink-0 place-items-center rounded-full transition-all duration-200',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-navy-950',
              handsFree
                ? 'bg-dispatch-500 text-white hover:bg-dispatch-600'
                : 'bg-white/10 text-white ring-1 ring-inset ring-white/20 hover:bg-white/15',
            )}
          >
            <Hand className="size-6" aria-hidden="true" />
          </button>
        </div>

        {/* Hands-free status */}
        <div className="mx-auto mt-4 max-w-md">
          <AnimatePresence mode="wait">
            {handsFree ? (
              <motion.div
                key="hf"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center justify-center gap-2 rounded-xl border border-dispatch-400/30 bg-dispatch-500/10 px-3 py-2.5"
              >
                <span className="relative flex size-2" aria-hidden="true">
                  <span className="absolute inset-0 animate-pulse-ring rounded-full bg-dispatch-300" />
                  <span className="relative size-2 rounded-full bg-dispatch-300" />
                </span>
                <p className="text-xs font-semibold text-dispatch-200">
                  Hands-free is on — say{' '}
                  <span className="font-bold text-white">&ldquo;help&rdquo;</span> any time
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="off"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center justify-center gap-3"
              >
                <p className="text-xs text-white/45">Prefer typing?</p>
                <button
                  type="button"
                  onClick={onSwitchToText}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold text-white underline-offset-4 hover:bg-white/10 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <Keyboard className="size-3.5" aria-hidden="true" />
                  Switch to text chat
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
