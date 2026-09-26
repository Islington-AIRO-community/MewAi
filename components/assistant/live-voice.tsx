'use client';

import * as React from 'react';
import { LiveSession, type LiveSessionSnapshot } from '@/lib/live-client';
import {
  INTAKE_TOOLS,
  VOICE_SYSTEM_INSTRUCTION,
  extractionToDraft,
} from '@/lib/live-intake';
import { missingSlots } from '@/lib/ticket-intake';
import type { AiChatApi } from '@/lib/use-ai-chat';
import { VoicePanel } from './voice-panel';

/**
 * The live voice line, on `/chat`.
 *
 * This component owns the `LiveSession` and nothing else does. The session is a
 * WebSocket, an `AudioContext` and a microphone, and all three belong to one
 * object's lifetime: putting any of them in React state would mean a re-render
 * could drop a frame of audio, and putting them in a context would let a second
 * mount open a second microphone.
 *
 * So this is the boundary. It owns the session, it feeds the intake, and it
 * renders the panel. `lib/live-client.ts` knows nothing about React and this file
 * knows nothing about audio.
 *
 * ## The intake is shared, not duplicated
 *
 * A voice conversation and a typed one build the same ticket draft through the
 * same `useAiChat` instance the composer uses. That is why extraction arrives via
 * `ai.applyExtraction` rather than a local draft: two drafts would mean the
 * review form showing one while the conversation fills in the other.
 *
 * It is `applyExtraction` and not `edit` for the reason documented on that
 * method — a model's misheard phone number must not be pinned as a correction
 * the reporter cannot override.
 *
 * ## Voice is available here and nowhere else
 *
 * The floating assistant is text-only. It sits above the SOS bar on every page
 * including the ones someone opens while panicking, and a microphone prompt
 * there competes with the button they came for. `/chat` is where someone has
 * chosen to describe an emergency in their own words, which is the only context
 * in which asking for a microphone is the obvious next question.
 */

/**
 * The model the voice line asks for.
 *
 * Duplicated from the backend's `gemini_live_model`, and deliberately so: the
 * model named in `setup` and the one the server minted the grant for are two
 * independent statements of the same thing, and the server's is the one that
 * decides whether the handshake works. If they ever disagree the session fails
 * to open rather than quietly switching models.
 */
const LIVE_MODEL = 'gemini-3.8-live';

/**
 * The idle snapshot, so the panel never renders an `undefined` field on mount.
 *
 * `subscribe` delivers the real one synchronously, so this is only ever seen for
 * the single render before a session exists.
 */
const IDLE: LiveSessionSnapshot = {
  connection: 'idle',
  error: null,
  userTranscript: '',
  assistantTranscript: '',
  capturing: false,
  micPending: false,
  connectingStage: null,
  muted: false,
  speaking: false,
  elapsed: 0,
  state: 'idle',
  turns: [],
};

export function LiveVoice({
  ai,
  onEnd,
  className,
}: {
  /** The shared intake. Required, and the same object the composer uses. */
  ai: AiChatApi;
  /** Hand the conversation back to text chat, keeping the call's turns. */
  onEnd: () => void;
  className?: string;
}) {
  const [snapshot, setSnapshot] = React.useState<LiveSessionSnapshot>(IDLE);

  /**
   * The session in two forms, because it is needed in two ways.
   *
   * The ref is for imperative calls — `stop()`, `getTranscript()` — from
   * callbacks and cleanups that must not re-subscribe when the session changes.
   * The state is for *rendering*: the panel polls `getInputLevel()` off it, and
   * a ref is invisible to React, so passing `sessionRef.current` as a prop would
   * hand the panel a `null` on the first render and then fix it only as a side
   * effect of the next unrelated state update. Storing it makes the panel's view
   * of the session an actual part of the render rather than a coincidence.
   */
  const [session, setSession] = React.useState<LiveSession | null>(null);
  const sessionRef = React.useRef<LiveSession | null>(null);
  const unsubscribeRef = React.useRef<(() => void) | null>(null);

  /**
   * Always the latest intake.
   *
   * These callbacks fire from socket events and from the tool dispatcher, not
   * from a render, so they cannot close over whatever was current when the
   * session was created — and the session is created once, possibly before the
   * reporter has said or typed anything.
   */
  const aiRef = React.useRef(ai);
  aiRef.current = ai;

  /**
   * Mirror the call into the intake, but only when it has actually changed.
   *
   * Without the guard this would run on every snapshot, and a snapshot arrives
   * once a second for the elapsed clock. Each one would push a fresh array into
   * `useAiChat` state and re-render the whole conversation, the composer and the
   * review form sixty times a minute, for a transcript that had not moved. The
   * signature is the turn count plus the last turn's text, which changes exactly
   * when something is said.
   */
  const lastSignature = React.useRef('');
  const syncTranscript = React.useCallback((turns: LiveSessionSnapshot['turns']) => {
    const last = turns[turns.length - 1];
    const signature = `${turns.length}:${last?.role ?? ''}:${last?.text ?? ''}`;
    if (signature === lastSignature.current) return;
    lastSignature.current = signature;
    aiRef.current.setVoiceTranscript(turns);
  }, []);

  /**
   * Open a session, exactly once per mount.
   *
   * The `sessionRef` guard is belt-and-braces against a second call rather than
   * the primary mechanism: `TabPanel` unmounts this component when the tab
   * changes, so a fresh mount is a deliberate second call. What the guard does
   * catch is a re-entrant `start` from the panel's own button while a connection
   * attempt is still in flight — `start()` awaits a token mint, and a second
   * click in that window would otherwise open two sockets and two microphones.
   */
  const start = React.useCallback(async () => {
    if (sessionRef.current) return;
    const session = new LiveSession({
      onExtraction: (args) => {
        const patch = extractionToDraft(args);
        if (Object.keys(patch).length > 0) aiRef.current.applyExtraction(patch);
      },
      onFinishIntake: () => {
        // Advisory, and checked here rather than trusted. A voice agent will
        // confidently call this after three sentences, so the same predicate that
        // gates the composer gates the review form: `missingSlots` is the
        // authority, exactly as `ai-backend/app/slots.py` is for the text path.
        if (missingSlots(aiRef.current.draft).length === 0) aiRef.current.openReview();
      },
      setup: {
        model: LIVE_MODEL,
        systemInstruction: VOICE_SYSTEM_INSTRUCTION,
        tools: INTAKE_TOOLS,
      },
    });
    sessionRef.current = session;
    setSession(session);
    // The single state channel. It fires immediately with the current snapshot,
    // then on every patch — `start()` below would otherwise leave the panel on
    // its idle snapshot until something else happened to re-render it.
    unsubscribeRef.current = session.subscribe((next) => {
      setSnapshot(next);
      syncTranscript(next.turns);
    });
    try {
      // The gesture-first order, and it is the whole fix for a panel stuck on
      // "Connecting…". The mic is requested from inside the click handler that
      // started this, before the token is minted and before the socket opens, so
      // the permission prompt belongs to something the reporter asked for and
      // the activation is still valid. Asking later — from the `setupComplete`
      // callback, as this used to — expired the activation and left the promise
      // either failing outright on iOS or hanging with no error on desktop.
      if (!(await session.requestMic())) {
        await discard();
        return;
      }
      await session.start();
    } catch {
      // `start` has already put a sentence in the snapshot. There is nothing to
      // retry and nothing to clean up: the way forward is text chat, one tap away.
      await discard();
    }

    /**
     * Throw away a session that never opened, so the Start button means "start".
     *
     * Without this the failed session stays in the ref, `start` early-returns on
     * its `sessionRef.current` guard, and a reporter who blocked the microphone
     * by accident gets a dead button and no way back except the text tab. The
     * snapshot keeps the error — the sentence explaining what happened is the
     * whole value of having failed — while the session object goes.
     */
    async function discard(): Promise<void> {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      await session.stop();
      sessionRef.current = null;
      setSession(null);
    }
  }, [syncTranscript]);

  /**
   * Unmounting is the only thing that ends a call.
   *
   * `TabPanel` renders `null` unless its tab is active, so this component exists
   * exactly while the voice tab is on screen and is gone the moment it is not —
   * which is what releases the microphone. Note what is *not* here: nothing
   * starts on mount. Opening a tab must not open a microphone, both because that
   * is a recording indicator nobody consented to and because the request needs
   * a gesture to survive. The Start button is the gesture.
   */
  React.useEffect(
    () => () => {
      // One cleanup, so the order of the two halves is stated rather than
      // inherited from the order two effects happen to be declared in.
      //
      // Sync first, then stop. `stop()` deliberately keeps the turns, so either
      // order would work today — but a reporter's last words being read after
      // the microphone is released is the order that keeps being correct if
      // `stop()` ever grows a "and clear them" branch.
      const ending = sessionRef.current;
      if (ending) syncTranscript(ending.getTranscript());
      void ending?.stop();
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      sessionRef.current = null;
      setSession(null);
    },
    [syncTranscript],
  );

  const end = React.useCallback(() => {
    const ending = sessionRef.current;
    if (ending) {
      // The last sync, before the unmount that ends the call.
      syncTranscript(ending.getTranscript());
    }
    void ending?.stop();
    onEnd();
  }, [onEnd, syncTranscript]);

  return (
    <VoicePanel
      snapshot={snapshot}
      session={session}
      onStart={() => void start()}
      onToggleMic={() => {
        const session = sessionRef.current;
        if (!session) {
          void start();
          return;
        }
        session.setMuted(!snapshot.muted);
      }}
      onSendText={(text) => sessionRef.current?.sendText(text)}
      onEnd={end}
      model={LIVE_MODEL}
      className={className}
    />
  );
}
