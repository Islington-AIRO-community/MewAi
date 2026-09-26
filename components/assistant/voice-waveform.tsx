'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { usePrefersReducedMotion } from '@/lib/hooks';
import type { VoiceState } from '@/lib/types';

const BAR_COUNT = 32;

/**
 * Audio-reactive waveform.
 *
 * In a live build this is fed by an AnalyserNode. Here it is driven by a
 * deterministic pseudo-random envelope so the motion is calm and stable
 * rather than frantic — the visual language is "steady, present, calm".
 *
 * When the user prefers reduced motion, bars settle into a static,
 * state-appropriate silhouette instead of animating.
 */
export function VoiceWaveform({
  state,
  className,
  bars = BAR_COUNT,
  amplitude = 1,
}: {
  state: VoiceState;
  className?: string;
  bars?: number;
  /** Scales the whole envelope; used for the compact launcher orb. */
  amplitude?: number;
}) {
  const reduced = usePrefersReducedMotion();
  const [levels, setLevels] = React.useState<number[]>(() =>
    Array.from({ length: bars }, (_, i) => 0.3 + 0.2 * Math.sin(i / 3)),
  );

  const active = state === 'listening' || state === 'speaking';
  const rafRef = React.useRef<number | null>(null);
  const tRef = React.useRef(0);

  React.useEffect(() => {
    if (!active || reduced) {
      // Settled silhouette: flat, quiet, clearly "not transcribing".
      setLevels(Array.from({ length: bars }, (_, i) => 0.16 + 0.1 * Math.abs(Math.sin(i / 4))));
      return;
    }

    const tick = () => {
      tRef.current += 0.055;
      const next = Array.from({ length: bars }, (_, i) => {
        // Layered sines + envelope gives an organic, speech-like rhythm.
        const base =
          0.34 +
          0.3 * Math.abs(Math.sin(tRef.current + i * 0.36)) +
          0.2 * Math.abs(Math.sin(tRef.current * 1.7 - i * 0.22)) +
          0.1 * Math.abs(Math.cos(tRef.current * 2.6 + i * 0.5));
        // Taper the edges so it reads as a waveform, not a bar chart.
        const taper = Math.sin((i / (bars - 1)) * Math.PI) ** 0.7;
        return Math.max(0.1, Math.min(1, base * taper));
      });
      setLevels(next);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [active, reduced, bars]);

  const colorFor = (level: number) => {
    if (!active) return 'bg-navy-200';
    if (state === 'speaking') {
      return level > 0.68 ? 'bg-emergency-300' : level > 0.4 ? 'bg-emergency-400' : 'bg-emergency-500/50';
    }
    return level > 0.68 ? 'bg-white' : level > 0.4 ? 'bg-white/75' : 'bg-white/45';
  };

  return (
    <div
      className={cn('flex h-16 w-full items-center justify-center gap-[3px]', className)}
      role="img"
      aria-label={waveformLabel(state)}
    >
      {levels.map((level, i) => (
        <motion.span
          key={i}
          className={cn('wave-bar w-1 rounded-full', colorFor(level))}
          style={{
            height: `${Math.max(8, level * 100)}%`,
            maxHeight: '100%',
            transition: 'background-color 300ms ease',
          }}
          animate={reduced ? undefined : { scaleY: 1 }}
        />
      ))}
    </div>
  );
}

function waveformLabel(state: VoiceState): string {
  switch (state) {
    case 'listening':
      return 'Audio waveform showing an active listening state';
    case 'speaking':
      return 'Audio waveform showing the assistant speaking';
    case 'thinking':
      return 'Audio waveform paused while the assistant processes';
    case 'muted':
      return 'Audio waveform flat, microphone muted';
    case 'connecting':
      return 'Audio waveform connecting to the voice service';
    case 'error':
      return 'Audio waveform unavailable';
    default:
      return 'Audio waveform idle';
  }
}

/**
 * Compact circular orb used on the launcher button. Breathing halo signals
 * availability without needing to read anything.
 */
export function VoiceOrb({
  state,
  className,
  size = 56,
}: {
  state: VoiceState;
  className?: string;
  size?: number;
}) {
  const reduced = usePrefersReducedMotion();
  const active = state === 'listening';
  const thinking = state === 'thinking' || state === 'speaking';

  return (
    <span
      className={cn('relative grid place-items-center', className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {active && !reduced && (
        <>
          <motion.span
            className="absolute inset-0 rounded-full bg-emergency-400/40"
            animate={{ scale: [1, 1.45], opacity: [0.5, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
          />
          <motion.span
            className="absolute inset-0 rounded-full bg-emergency-300/30"
            animate={{ scale: [1, 1.7], opacity: [0.4, 0] }}
            transition={{ duration: 2, repeat: Infinity, delay: 0.6, ease: 'easeOut' }}
          />
        </>
      )}
      <span
        className={cn(
          'grid place-items-center rounded-full ring-1 ring-inset transition-colors duration-300',
          active
            ? 'bg-emergency-500 text-white ring-emergency-300'
            : thinking
              ? 'bg-navy-900 text-white ring-navy-400'
              : 'bg-navy-900/90 text-white ring-white/20',
        )}
        style={{ width: size * 0.62, height: size * 0.62 }}
      >
        <VoiceWaveform state={state} bars={9} className="h-6 w-6" amplitude={0.8} />
      </span>
    </span>
  );
}
