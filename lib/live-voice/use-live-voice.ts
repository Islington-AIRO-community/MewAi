'use client';

import * as React from 'react';
import {
  fetchLiveToken,
  type LiveTokenErrorKind,
  type WireMessage,
} from '@/lib/ai-client';
import {
  AudioError,
  openMicrophone,
  openSpeaker,
  type Microphone,
  type Speaker,
} from './audio';
import { LiveSession, type LiveFailureKind, type LiveSessionState } from './session';

/**
 * One real Gemini Live voice session, as a React hook.
 *
 * ## What owns what
 *
 * The session is a single object with a socket, a mic and a speaker, and it
 * lives for as long as the reporter is in the voice tab. The transcript it
 * produces is the *only* thing that crosses back into the ticket pipeline: the
 * caller hands the completed turns to `useAiChat.ingestTranscript`, which runs
 * them through the same `sendChatTurn` the text composer uses.
 *
 * That indirection is the point. The Live model is a speech model, and the
 * intake model is a text model that owns readiness; two different jobs. The
 * spoken conversation is not a ticket, and nothing here decides it is.
 *
 * ## Everything that can fail is a state, not an exception
 *
 * A voice session has more ways to fail than a text turn — no microphone, no
 * permission, a blocked WebSocket, a dropped socket that reconnects, a
 * microphone permission revoked mid-session. Every one of them renders as
 * something the reporter can read, and every one of them leaves the transcript
 * intact, because the person talking to us during a flood is the only thing we
 * have of their report.
 */

export type LiveVoiceStatus =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'reconnecting'
  | 'unavailable'
  | 'error';

export interface LiveVoiceFailure {
  /**
   * The full vocabulary, not a narrowed one.
   *
   * This used to be `LiveTokenErrorKind | 'audio' | 'gave_up'`, which did not
   * include the session's own kinds — so every socket-level failure had to be
   * flattened into `'gave_up'` to type-check. A refused socket, a service that
   * rejected the setup, and a link that dropped four times therefore all
   * reported the same kind, and nothing downstream could tell them apart. The
   * union is now the union of everything that can actually happen.
   */
  kind: LiveTokenErrorKind | LiveFailureKind | 'audio';
  message: string;
}

export interface LiveVoice {
  status: LiveVoiceStatus;
  /** Set when `status` is `unavailable` or `error`. Copy is ready to render. */
  failure: LiveVoiceFailure | null;
  /** True while the assistant's audio is playing. */
  assistantSpeaking: boolean;
  /** Mic loudness 0..1, decayed by the caller for a usable waveform. */
  level: number;
  /** Completed turns so far, oldest first. Empty until the first turn ends. */
  turns: WireMessage[];
  /** Start a session. Resolves once the socket is open, or sets `failure`. */
  start: () => Promise<void>;
  /** Stop the session and keep the transcript. */
  stop: () => void;
  /** Discard the session and the transcript. */
  reset: () => void;
  /** Deliberately stop listening (the mic mute button). Not a turn boundary. */
  setMuted: (muted: boolean) => void;
  muted: boolean;
}

export function useLiveVoice(): LiveVoice {
  const [status, setStatus] = React.useState<LiveVoiceStatus>('idle');
  const [failure, setFailure] = React.useState<LiveVoiceFailure | null>(null);
  const [assistantSpeaking, setAssistantSpeaking] = React.useState(false);
  const [turns, setTurns] = React.useState<WireMessage[]>([]);
  const [muted, setMutedState] = React.useState(false);

  // `level` is written from a worklet message at ~5 Hz. It is kept in a ref and
  // bumped with a counter so the waveform re-renders against the current value,
  // rather than pushed through `setState` directly — routing the float itself
  // would re-render the whole assistant panel 5 times a second.
  const levelRef = React.useRef(0);
  const [, setLevelTick] = React.useState(0);

  const sessionRef = React.useRef<LiveSession | null>(null);
  const micRef = React.useRef<Microphone | null>(null);
  const speakerRef = React.useRef<Speaker | null>(null);

  const stopRef = React.useRef<() => void>(() => undefined);
  stopRef.current = () => {
    sessionRef.current?.close();
    sessionRef.current = null;
    micRef.current?.close();
    micRef.current = null;
    speakerRef.current?.close();
    speakerRef.current = null;
    levelRef.current = 0;
  };

  React.useEffect(() => stopRef.current, []);

  const start = React.useCallback(async () => {
    if (sessionRef.current) return;
    setStatus('connecting');
    setFailure(null);

    // Order matters on the way up, and differently on the way down.
    //
    // The speaker is opened before the socket so assistant audio has somewhere
    // to go the instant it arrives — a socket that starts talking into a
    // half-open audio graph drops the first words of every reply, which is
    // exactly when a reporter most needs to hear them.
    let speaker: Speaker;
    try {
      speaker = await openSpeaker();
    } catch (error) {
      setFailure({
        kind: 'audio',
        message:
          error instanceof AudioError
            ? error.message
            : 'Audio could not be started. You can continue in text.',
      });
      setStatus('unavailable');
      return;
    }
    speakerRef.current = speaker;

    const token = await fetchLiveToken();
    if (!token.ok) {
      speaker.close();
      speakerRef.current = null;
      setFailure({ kind: token.kind, message: token.message });
      setStatus(token.kind === 'unreachable' ? 'unavailable' : 'error');
      return;
    }

    const session = new LiveSession(
      token.token,
      {
        receiveAudio: (pcm) => speaker.enqueue(pcm),
        flushAudio: () => speaker.flush(),
      },
      {
        onState: (next) => {
          if (next === 'ready') {
            setStatus('listening');
            setFailure(null);
          } else if (next === 'reconnecting') {
            setStatus('reconnecting');
          } else if (next === 'closed') {
            setStatus('idle');
          }
        },
        onTurn: (turn) => setTurns((prev) => [...prev, turn]),
        onSpeaking: setAssistantSpeaking,
        onInterrupted: () => setAssistantSpeaking(false),
        onFailure: (kind, message) => {
          // A dropped socket is not yet a failure. The session is already
          // reconnecting, and a reporter who is mid-emergency should be told
          // that, not shown "Voice unavailable" while it quietly recovers.
          //
          // This deliberately does *not* set `failure`. Every consumer resolves
          // a truthy `failure` to the `error` state first, so setting it here
          // relabelled a healthy reconnect as a dead session — and, because the
          // failure block replaces the controls, it took the stop button away
          // from the person least able to keep waiting.
          if (kind === 'socket_dropped') {
            setStatus('reconnecting');
            return;
          }

          // Terminal. The real `kind` is preserved rather than flattened to
          // 'gave_up': a denied microphone, a refused token and an unreachable
          // backend need different fixes, and an operator cannot tell them
          // apart from a single label.
          setFailure({ kind, message });
          setStatus('error');
          // Release the microphone and the socket. Holding an open mic after a
          // dead session would leave someone's microphone hot in the browser
          // with nobody listening, which is not a thing to do to a reporter.
          stopRef.current?.();
        },
      },
    );
    sessionRef.current = session;

    try {
      const mic = await openMicrophone({
        onFrame: (frame) => session.sendAudio(frame),
        onLevel: (value) => {
          levelRef.current = value;
          // Nudge the waveform without re-rendering the panel.
          setLevelTick((n) => (n + 1) % 1000);
        },
      });
      micRef.current = mic;
    } catch (error) {
      // The socket is open but there is nothing to feed it. Tear the whole
      // thing down rather than leaving a live session burning quota on silence.
      stopRef.current();
      setFailure({
        kind: 'audio',
        message:
          error instanceof AudioError
            ? error.message
            : 'The microphone could not be started. You can continue in text.',
      });
      setStatus('unavailable');
      return;
    }

    session.connect();
  }, []);

  const stop = React.useCallback(() => {
    stopRef.current();
    setStatus('idle');
    setAssistantSpeaking(false);
  }, []);

  const reset = React.useCallback(() => {
    stopRef.current();
    setTurns([]);
    setFailure(null);
    setStatus('idle');
    setAssistantSpeaking(false);
    setMutedState(false);
  }, []);

  const setMuted = React.useCallback((next: boolean) => {
    setMutedState(next);
    micRef.current?.mute(next);
  }, []);

  // Decay the level so the waveform falls back to rest between frames instead
  // of freezing at the last peak. A rAF is the cheapest place to do this that
  // still stops when the tab is hidden.
  React.useEffect(() => {
    if (status === 'idle' || status === 'connecting') return undefined;
    let raf = 0;
    const tick = () => {
      levelRef.current *= 0.82;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [status]);

  return {
    status,
    failure,
    assistantSpeaking,
    level: levelRef.current,
    turns,
    start,
    stop,
    reset,
    setMuted,
    muted,
  };
}
