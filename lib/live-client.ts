/**
 * Gemini Live voice session: transport, audio, and turn state.
 *
 * No React in here on purpose. Everything the voice UI needs is an event, and
 * keeping the socket and the audio graph outside the component tree means a
 * re-render cannot drop a frame of audio or restart a session.
 *
 * ## Why the browser talks to Google directly
 *
 * The Live API is a bidirectional WebSocket and a Next.js route handler cannot
 * proxy a `101 Switching Protocols` upgrade. So the browser opens the socket
 * itself, holding a single-use token from `/api/ai/live/session` rather than an
 * API key. The key and `AI_API_URL` stay server-side.
 *
 * ## The wire contract, as verified against the live API
 *
 * Four things here are not guessable and were each confirmed by a real
 * handshake. Changing any of them silently breaks the session, so they are
 * called out rather than left as bare literals:
 *
 *  1. `responseModalities` belongs inside `setup.generationConfig`. At the setup
 *     level the server closes the connection with `Unknown name
 *     "responseModalities" at 'setup'`.
 *  2. `['TEXT']` is **rejected** by live models — they are audio-only. The
 *     assistant's words therefore have to come from `outputTranscription`,
 *     never from a text part. This is also why the transcript is the product:
 *     it is the only text that exists.
 *  3. Audio in is `realtimeInput.audio`, base64 PCM16 at 16 kHz. Audio out is
 *     `audio/pcm;rate=24000`.
 *  4. **A `toolCall` is answered before the model speaks.** The turn that calls
 *     a function produces no audio at all; the reply comes after the
 *     `toolResponse`. So the tool response is sent synchronously and never
 *     awaits anything — awaiting there is literal dead air.
 *
 * ## Language
 *
 * Nepali is absent from the selectable `voice_name` list, yet omitting
 * `voiceName` produces correct Devanagari Nepali audio — verified with a
 * real Nepali-only prompt. So `voiceName` is deliberately left unset and the
 * system instruction asks the model to answer in whatever language it hears.
 * Setting it to something in the list would make the assistant answer in a
 * language the reporter did not speak.
 */

import type { SupportType } from './types';

// --------------------------------------------------------------------------
// Wire types. Only the fields this client reads are named.
// --------------------------------------------------------------------------

/** A grant from `POST /api/ai/live/session`. */
export interface LiveGrant {
  token: string;
  expires_at: string;
  model: string;
  ws_url: string;
}

/** One extracted-fact patch from the model's `record_intake` call. */
export interface IntakeExtraction {
  reporter_name?: string;
  reporter_phone?: string;
  victim_name?: string;
  victim_phone?: string;
  summary?: string;
  location?: string;
  people_affected?: string;
  support_needed?: SupportType[];
  urgency?: 'critical' | 'high' | 'medium' | 'low';
  on_behalf_of_other?: boolean;
}

export type VoiceConnection = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'error';

export interface LiveSessionState {
  connection: VoiceConnection;
  /** Set when `connection` is `error`. Safe to show a person. */
  error: string | null;
  /** Rolling input transcript, for the visible transcript panel. */
  userTranscript: string;
  /** Rolling output transcript. The only text the model produces. */
  assistantTranscript: string;
  /** False once the mic is released or muted. */
  capturing: boolean;
  /**
   * True between "the browser has been asked" and "it has answered".
   *
   * Its own flag because the answer is not always immediate: the permission
   * prompt can sit there until it is dealt with, and during that window the
   * session is live, `capturing` is false, and there is no error — which is
   * indistinguishable from connecting unless something says so. See
   * `requestMic`.
   */
  micPending: boolean;
  /**
   * Which network step is in flight, or `null` when none is.
   *
   * This exists because `connection: 'connecting'` is three different situations
   * wearing one word: waiting on our own server for a token, opening a socket to
   * Google, and waiting for Google to accept the setup. When the voice line is
   * reported as "stuck on connecting", which of the three is the entire
   * difference between a backend that is not running, a network that blocks
   * WebSockets, and a handshake being refused — three problems with three
   * different fixes, none of which the reporter can see. So it is stated.
   */
  connectingStage: 'token' | 'socket' | 'setup' | null;
  muted: boolean;
  /** True between the model starting to speak and its turn completing. */
  speaking: boolean;
  /** Seconds of connected session time, for the elapsed readout. */
  elapsed: number;
}

/**
 * The state the voice panel renders. Deliberately a separate, larger shape than
 * `VoiceState` in `lib/types.ts`: that union is a seven-value display state
 * shared with the composer's mic button, and a live session has more to say
 * than it — a transcript, a capture flag, an error, a clock.
 */
export interface LiveSessionSnapshot extends LiveSessionState {
  state: VoiceStateDisplay;
  /**
   * The call so far, as ordered turns — what gets buffered and eventually stored
   * on the ticket.
   *
   * Separate from the two rolling `*Transcript` strings, which are the model's
   * live view of the turn in progress and are not a record. A reporter's phone
   * number is spoken in one turn and then corrected in another; storing the
   * rolling value would keep only the correction, and the record of what the
   * assistant heard first would be gone.
   */
  turns: TranscriptTurnLite[];
}

/** One spoken turn. The shape the ticket-create payload wants. */
export interface TranscriptTurnLite {
  role: 'reporter' | 'assistant';
  text: string;
}

/** Mirrors `VoiceState` in `lib/types.ts`, kept in step by construction. */
export type VoiceStateDisplay =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'muted'
  | 'error';

// --------------------------------------------------------------------------
// Audio format constants
// --------------------------------------------------------------------------

/**
 * Gemini requires 16 kHz mono PCM16 on the wire.
 */
const INPUT_RATE = 16_000;
/** Verified output rate for `gemini-3.8-live`. */
const OUTPUT_RATE = 24_000;
const INPUT_MIME = `audio/pcm;rate=${INPUT_RATE}`;

/** Milliseconds of buffered audio before playback starts, to avoid clipping the first syllable. */
const PLAYBACK_JITTER_MS = 120;

const MAX_RECONNECTS = 3;

/**
 * How long a freshly opened socket may stay silent before it is written off.
 *
 * The socket opening proves nothing: `setup` still has to be accepted, and a
 * connection that never answers it leaves the mic dark with no error anywhere.
 * Someone waiting to report an emergency is not going to conclude that the app
 * is broken — they will conclude the app is not listening. Twenty seconds is
 * generous for a handshake that normally takes under a second, and a microphone
 * permission prompt raised in that window still resolves in time, because it
 * happens *after* `setupComplete` and is not covered by this.
 */
const SETUP_TIMEOUT_MS = 20_000;

/**
 * How long a socket may take to open before it is written off.
 *
 * The setup watchdog above covers "opened, then went quiet", and for a while
 * nothing covered "never opened at all" — which is the failure a firewall that
 * silently drops packets produces, and what an HTTPS-scanning extension or a
 * proxy with no route to `generativelanguage.googleapis.com` produces. A dropped
 * TCP handshake fires neither `onerror` nor `onclose`, so the promise in
 * `openSocket` simply never settles and the panel says "Connecting…" for as long
 * as the reporter is willing to sit there. Nobody waiting on emergency help will
 * conclude the app is broken; they will conclude nobody is listening.
 *
 * The same generous budget as the setup watchdog, for the same reason: a healthy
 * open takes well under a second, and this is bounding a hang rather than racing
 * a slow network.
 */
const OPEN_TIMEOUT_MS = 20_000;

// --------------------------------------------------------------------------
// Session
// --------------------------------------------------------------------------

export interface LiveSessionOptions {
  /** Always the latest `ai` object. See `useAiChat`'s identity caveat in the caller. */
  onExtraction: (patch: IntakeExtraction) => void;
  /**
   * Called when the model believes intake is done. Advisory only — the caller
   * decides readiness from `missingSlots`, because readiness is never the
   * model's call.
   */
  onFinishIntake: () => void;
  /**
   * Builds the setup payload. Server-built prompts live in `lib/live-intake.ts`.
   */
  setup: LiveSetup;
  /** Non-null in development to point at a proxy; null in production. */
  sessionEndpoint?: string;
}

export interface LiveSetup {
  model: string;
  systemInstruction: string;
  tools: unknown[];
}

type Listener = (snapshot: LiveSessionSnapshot) => void;

const EMPTY_STATE: LiveSessionState = {
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
};

/**
 * One live voice session.
 *
 * Construct, then `start()`. Every failure path ends in `connection: 'error'`
 * with a sentence a person can act on, because the UI's job on failure is to
 * offer text chat — not to show a stack trace.
 */
export class LiveSession {
  private readonly options: LiveSessionOptions;
  private socket: WebSocket | null = null;
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private gain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;

  /**
   * `ScriptProcessorNode`, not `AudioWorkletNode`, and the reason is worth
   * stating because it is the wrong answer in the long run.
   *
   * A worklet is the correct tool: it runs off the main thread, and a main-thread
   * audio callback doing a resample under an emergency UI is a place to drop
   * frames. But a worklet module has to be loaded from a URL — a public asset or
   * a `blob:` — and this session cannot be exercised with a real microphone in
   * the environment this was built in. Shipping two audio paths and testing
   * neither is worse than shipping the older one, which works everywhere, and
   * so this uses the deprecated-but-universally-supported node and names the
   * worklet as the follow-up.
   */
  private frameSamples = 1600;

  private state: LiveSessionState = { ...EMPTY_STATE };
  private stateListener: Listener | null = null;

  /**
   * The call, in order. The last element may still be the turn in progress.
   *
   * Built up from rolling transcriptions, and the asymmetry in how they are
   * applied is the whole subtlety:
   *
   *  - `inputTranscription.text` is the *whole current turn*, re-sent as the
   *    model revises it. So a reporter turn is **replaced**, never appended —
   *    appending would store `"my name is"` followed by `"my name is Amina"`
   *    for one sentence.
   *  - `outputTranscription.text` arrives as the model speaks, in segments, and
   *    is the only text this audio-only model emits. So an assistant turn is
   *    **appended**.
   *
   * Turn boundaries come from the model rather than from timers: the first
   * output transcription after a reporter turn ends that turn, and
   * `turnComplete` ends the assistant's.
   */
  private turns: TranscriptTurnLite[] = [];
  private openRole: 'reporter' | 'assistant' | null = null;

  /** Guards against two overlapping sessions and stale socket callbacks. */
  private generation = 0;
  private wantsToRun = false;
  private reconnects = 0;
  private startedAt = 0;
  private clock: number | null = null;
  private setupTimer: number | null = null;
  private openTimer: number | null = null;

  /**
   * Scheduled-but-unplayed output, so an interruption can actually silence it.
   *
   * Audio already handed to `AudioBufferSourceNode.start(when)` is committed: the
   * browser will play it whether or not anything asks it not to. Keeping the
   * nodes is therefore the only way "cut off mid-sentence" means anything, and
   * without it a reporter who interrupts is talked over by the rest of an answer
   * they have already heard the start of.
   */
  private scheduled: AudioBufferSourceNode[] = [];
  private nextAudioAt = 0;
  private resumptionHandle: string | null = null;

  constructor(options: LiveSessionOptions) {
    this.options = options;
  }

  // ------------------------------------------------------------------------
  // Public surface
  // ------------------------------------------------------------------------

  getState(): LiveSessionSnapshot {
    return { ...this.state, state: displayState(this.state), turns: [...this.turns] };
  }

  /**
   * The call as a plain list, for the buffer that travels with the ticket.
   *
   * Exposed separately from `getState()` because the two have different owners:
   * the snapshot drives a panel that re-renders constantly, and this is read
   * once, at submit.
   */
  getTranscript(): TranscriptTurnLite[] {
    return this.turns
      .map((turn) => ({ role: turn.role, text: turn.text.trim() }))
      .filter((turn) => turn.text.length > 0);
  }

  /**
   * The only channel state arrives on, and it fires immediately with the current
   * snapshot.
   *
   * There is deliberately no `onState` constructor option beside it. An earlier
   * shape had one, and it was declared but never invoked — `patch` and
   * `emitTurns` only notified `stateListener` — so a caller who passed `onState`
   * got a panel frozen at its initial state while the call ran perfectly. Two
   * names for one channel is one too many; `subscribe` can also be replaced and
   * unsubscribed from, which an option could not do.
   */
  subscribe(listener: Listener): () => void {
    this.stateListener = listener;
    listener(this.getState());
    return () => {
      if (this.stateListener === listener) this.stateListener = null;
    };
  }

  /**
   * Ask for the microphone. **Call this from a click handler.**
   *
   * This is the single most important ordering rule in the file, and getting it
   * wrong produces a bug that looks like a network problem: the symptom is a
   * panel that says "Connecting…" forever.
   *
   * `getUserMedia` is gated behind *transient user activation* on iOS Safari and
   * is merely rude without it elsewhere. So the request has to happen inside the
   * event handler that the person actually triggered. If you instead let it be
   * reached from a socket callback — a `message` event arriving after a token
   * mint and a WebSocket handshake — the activation has expired by then, and on
   * iOS the call fails outright. On desktop Chrome the prompt still appears, but
   * it appears for something the reporter never asked for, and if it is dismissed
   * the promise never settles: not resolved, not rejected, no error, no mic. That
   * last case is the worst one, because `displayState` has nothing to report —
   * no `error`, connection `live`, `capturing` false — so it renders as
   * "Connecting…" indefinitely with nothing for the reporter to act on.
   *
   * So: gesture first, mic second, network third. Requesting here and letting
   * `beginCapture` reuse the stream also means a denied permission costs no
   * token and no socket.
   *
   * Resolves `false` when permission is refused or there is no usable input, and
   * leaves the reason in the snapshot for the panel to show.
   */
  async requestMic(): Promise<boolean> {
    if (this.stream) return true;
    if (!navigator.mediaDevices?.getUserMedia) {
      this.fail(
        'This browser will not give a web page microphone access here. A page served over plain HTTP on a network address cannot — use https, or open this on localhost. Typing still works.',
      );
      return false;
    }
    this.patch({ micPending: true, error: null });
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          // A reporter may be shouting over floodwater. Let the browser's AGC
          // work rather than hard-gating a quiet gain.
          autoGainControl: true,
        },
      });
      this.patch({ micPending: false });

      // Wake the audio hardware now, while the activation is still valid.
      //
      // The `AudioContext` would otherwise be created later, from the
      // `setupComplete` socket callback, and a context created without a gesture
      // starts `suspended` under the autoplay policy — then `await
      // context.resume()` in `beginCapture` either rejects or never settles, and
      // the session sits live with `capturing` false, which is the same silent
      // "Connecting…" this method already exists to prevent, one layer down.
      //
      // Best-effort: `enqueueAudio` re-resumes a suspended context on its own, so
      // failing to prime it here is not worth failing the call over.
      try {
        const context = this.ensureAudioContext();
        if (context.state === 'suspended') await context.resume();
      } catch {
        // Ignored on purpose. See above.
      }

      return true;
    } catch (error) {
      this.patch({ micPending: false, capturing: false });
      this.fail(
        error instanceof DOMException && error.name === 'NotAllowedError'
          ? 'Microphone access was blocked, so voice cannot start. You can allow it in your browser’s site settings, or keep typing instead.'
          : 'No microphone could be opened, so voice cannot start. You can keep typing instead.',
      );
      return false;
    }
  }

  /**
   * Open a session: mint a token, connect, then capture.
   *
   * Rejects only if the session never opened. Once open, later failures are
   * reported through state rather than as a rejection, because a voice call
   * that drops at second 40 is not something the caller can retry — the person
   * is mid-sentence.
   *
   * Call `requestMic()` first, from the click. This only does the network half.
   */
  async start(): Promise<void> {
    this.wantsToRun = true;
    this.reconnects = 0;
    this.patch({ error: null, connection: 'connecting' });
    try {
      await this.openSocket();
    } catch (error) {
      this.wantsToRun = false;
      this.fail(messageFor(error));
      throw error;
    }
  }

  /**
   * Close everything and release the microphone.
   *
   * Must fully drop the tracks. A session that stops reading a mic but leaves
   * it live shows the user a recording indicator that no longer leads anywhere,
   * which during an emergency reads as surveillance.
   */
  async stop(): Promise<void> {
    this.wantsToRun = false;
    this.generation += 1;
    this.stopClock();
    this.disarmSetupTimeout();
    this.disarmOpenTimeout();

    this.teardownAudio();
    this.stopScheduledAudio();

    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close(1000, 'client closed');
      }
    }

    // The turns survive `stop()` on purpose, and this is the only place that is
    // not obvious: the caller reads them *after* stopping, when the review form
    // is submitted. A `stop()` that forgot them would file a spoken ticket with no
    // record of the call, which is the failure this whole feature is arranged to
    // prevent. They are dropped in `reset()` instead.
    this.patch({
      connection: 'idle',
      capturing: false,
      micPending: false,
      connectingStage: null,
      speaking: false,
      muted: false,
      error: null,
      userTranscript: '',
      assistantTranscript: '',
      elapsed: 0,
    });
  }

  /**
   * Forget the call.
   *
   * Distinct from `stop()`: this is the reporter choosing to start over, and
   * keeping turns from a discarded attempt would attach a conversation about one
   * emergency to a ticket about another.
   */
  resetTranscript(): void {
    this.turns = [];
    this.openRole = null;
    this.resumptionHandle = null;
    this.emitTurns();
  }

  /** Release the mic but keep the socket, so unmuting is instant. */
  pauseCapture(): void {
    if (!this.state.capturing) return;
    this.teardownCaptureGraph();
    this.patch({ capturing: false });
  }

  resumeCapture(): void {
    if (this.state.capturing) return;
    void this.beginCapture();
  }

  setMuted(muted: boolean): void {
    if (muted === this.state.muted) return;
    this.patch({ muted });
    if (muted) {
      this.pauseCapture();
    } else if (this.state.connection === 'live') {
      void this.beginCapture();
    }
  }

  /**
   * Inject a text turn.
   *
   * The escape hatch that keeps intake alive: someone who cannot speak, or whose
   * mic failed, can still answer a question and hear the reply read back.
   */
  sendText(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    this.send({
      clientContent: {
        turns: [{ role: 'user', parts: [{ text: trimmed }] }],
        turnComplete: true,
      },
    });
    this.patch({
      userTranscript: this.state.userTranscript ? `${this.state.userTranscript} ${trimmed}` : trimmed,
    });
    // A typed turn is complete the moment it is sent, so it is committed rather
    // than left open to be replaced by a transcription that will never come. This
    // matters for the path that exists precisely when voice is unavailable: the
    // reporter types, the model speaks back, and both halves of that exchange
    // belong in the record.
    this.closeTurn();
    this.turns.push({ role: 'reporter', text: trimmed });
    this.emitTurns();
  }

  // ------------------------------------------------------------------------
  // Socket
  // ------------------------------------------------------------------------

  private async openSocket(): Promise<void> {
    this.patch({ connectingStage: 'token' });
    const grant = await fetchLiveGrant(this.options.sessionEndpoint);
    const generation = ++this.generation;

    await new Promise<void>((resolve, reject) => {
      let socket: WebSocket;
      try {
        socket = new WebSocket(grant.ws_url);
      } catch {
        reject(new Error('This browser could not open a voice connection.'));
        return;
      }
      this.socket = socket;
      this.patch({ connectingStage: 'socket' });

      /**
       * Bound the open itself. `onerror` is not a substitute: a handshake that
       * is dropped rather than refused produces no event at all, so without this
       * the promise below never settles.
       */
      this.armOpenTimeout(generation, () => {
        reject(
          new Error(
            'The voice channel could not be opened to Google. This is usually the ' +
              'network rather than this app — a firewall, a proxy, or a privacy ' +
              'extension blocking the connection. Text chat still works.',
          ),
        );
      });

      const onOpenError = () => {
        if (generation !== this.generation) return;
        this.disarmOpenTimeout();
        reject(new Error('The voice connection was refused.'));
      };

      socket.onerror = onOpenError;
      socket.onclose = (event) => {
        socket.onerror = null;
        if (generation !== this.generation) return;
        this.disarmOpenTimeout();
        this.onSocketClosed(event);
      };
      socket.onmessage = (event) => {
        if (generation !== this.generation) return;
        this.onMessage(event.data, generation);
      };
      socket.onopen = () => {
        if (generation !== this.generation) return;
        this.disarmOpenTimeout();
        socket.onerror = null;
        socket.onopen = () => {};
        this.onSocketOpen();
        resolve();
      };
    });
  }

  /**
   * Write off a socket that never opened, and take it down on the way out.
   *
   * Closing it is not just tidiness: the socket is still referenced by
   * `this.socket` and by its own handlers, so leaving it to dangle would let a
   * late `onopen` run `onSocketOpen` and send a setup on a connection the
   * session has already given up on.
   */
  private armOpenTimeout(generation: number, onExpire: () => void): void {
    this.disarmOpenTimeout();
    this.openTimer = window.setTimeout(() => {
      this.openTimer = null;
      if (generation !== this.generation) return;
      onExpire();
      const socket = this.socket;
      if (socket) {
        socket.onopen = null;
        socket.onerror = null;
        socket.onclose = null;
        if (socket.readyState === WebSocket.CONNECTING) socket.close();
      }
    }, OPEN_TIMEOUT_MS);
  }

  private disarmOpenTimeout(): void {
    if (this.openTimer !== null) {
      window.clearTimeout(this.openTimer);
      this.openTimer = null;
    }
  }

  private onSocketOpen(): void {
    this.startedAt = Date.now();
    this.startClock();
    this.armSetupTimeout();
    this.patch({ connectingStage: 'setup' });
    this.send({ setup: this.buildSetup() });
  }

  /**
   * Write off a socket that opened and then said nothing.
   *
   * Without this, a connection that is accepted by the network and then never
   * completes setup is indistinguishable from a working one: `connection` reads
   * `connecting` forever, the mic never opens, and the reporter has no idea
   * whether anyone is listening.
   */
  private armSetupTimeout(): void {
    this.disarmSetupTimeout();
    const generation = this.generation;
    this.setupTimer = window.setTimeout(() => {
      if (generation !== this.generation) return;
      this.disarmSetupTimeout();
      // Closing is enough: `onSocketClosed` owns the retry and the give-up, and
      // routing through it means a stalled setup and a dropped call are reported
      // and recovered from the same way.
      this.socket?.close(4000, 'setup timeout');
    }, SETUP_TIMEOUT_MS);
  }

  private disarmSetupTimeout(): void {
    if (this.setupTimer !== null) {
      window.clearTimeout(this.setupTimer);
      this.setupTimer = null;
    }
  }

  private buildSetup(): Record<string, unknown> {
    return {
      model: `models/${this.options.setup.model}`,
      // `responseModalities` lives here, not at the setup level — see the header.
      generationConfig: { responseModalities: ['AUDIO'] },
      // Both transcriptions on. Input drives the visible transcript; output is
      // the *only* text this model emits, so the review form depends on it.
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      systemInstruction: { parts: [{ text: this.options.setup.systemInstruction }] },
      // Server-side voice activity detection: the model decides when a turn ends,
      // which is what makes this feel like a conversation rather than a
      // push-to-talk radio.
      realtimeInputConfig: { automaticActivityDetection: { disabled: false } },
      tools: this.options.setup.tools,
      // Asking for a handle is what makes resumption possible at all. On a
      // reconnect the handle goes here, in the setup of the *new* socket.
      //
      // It is deliberately not a separate `sessionResumption` message sent after
      // `setup`: by then the new session has already been configured from an
      // empty context, and the whole point of the handle is to restore the old
      // one. Sent this way the conversation continues instead of restarting,
      // which is the difference between a dropped call and a person having to
      // re-explain a flood.
      sessionResumption: this.resumptionHandle
        ? { handle: this.resumptionHandle }
        : {},
    };
  }

  private send(payload: unknown): void {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(payload));
  }

  // ------------------------------------------------------------------------
  // Inbound messages
  // ------------------------------------------------------------------------

  /**
   * One inbound frame.
   *
   * The `typeof data !== 'string'` guard this replaces was the whole reason voice
   * did not work, and the reason it looked correct is worth writing down.
   *
   * **The Live API answers on binary frames, not text ones.** A browser's
   * `WebSocket` therefore delivers `message` as a `Blob` — `binaryType` defaults
   * to `'blob'` — which is an object. So the guard threw away every frame the
   * server ever sent: not just `setupComplete`, but `serverContent`, `toolCall`
   * and `sessionResumptionUpdate`. The entire receive path was dead, and the
   * session sat waiting for a reply that had already arrived and been discarded.
   * The visible symptom was the panel stuck on "Starting the voice session" until
   * the setup watchdog gave up, three times over.
   *
   * Nothing caught it because the Python probes passed. The `websockets` library
   * is lenient about frame types and returns text payloads as `str` whether they
   * arrived as text or binary, so a probe built on it is structurally incapable
   * of seeing this. Node's built-in `WebSocket` and the browser are both strict
   * and they agree with each other — which is why the same handshake that passed
   * under Python failed in a browser. Verified directly: the `setupComplete`
   * frame arrives as `Blob`, not `string`.
   */
  private onMessage(data: unknown, generation: number): void {
    void this.handleFrame(data, generation);
  }

  private async handleFrame(data: unknown, generation: number): Promise<void> {
    const text = await frameToText(data);
    // Re-checked after the await, because decoding yields to the event loop and a
    // `stop()` in that gap must not let a discarded frame patch a dead session.
    if (text === null || generation !== this.generation) return;
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return;
    }
    this.route(message);
  }

  private route(message: Record<string, unknown>): void {
    if ('setupComplete' in message) {
      // The session exists. Only now is `live` true — claiming it at socket-open
      // would mean telling someone they are connected to a service that has not
      // accepted their setup yet.
      this.disarmSetupTimeout();
      this.patch({ connection: 'live', error: null, connectingStage: null });
      void this.beginCapture();
      return;
    }
    if ('goAway' in message) {
      // Google is about to close the session. Stop cleanly so the reconnect is
      // ours rather than a surprise socket error mid-word.
      this.pauseCapture();
      return;
    }
    if ('sessionResumptionUpdate' in message) {
      const handle = (message.sessionResumptionUpdate as { newHandle?: string } | undefined)
        ?.newHandle;
      if (typeof handle === 'string' && handle) this.resumptionHandle = handle;
      return;
    }
    if ('toolCall' in message) {
      this.onToolCall(message.toolCall);
      return;
    }
    if ('serverContent' in message) {
      this.onServerContent(message.serverContent as Record<string, unknown>);
    }
  }

  private onServerContent(content: Record<string, unknown>): void {
    // Cut off mid-sentence: stop the audio we have not played, or the tail of an
    // interrupted answer plays over the person who interrupted.
    if (content.interrupted === true) {
      this.stopScheduledAudio();
      // An interrupted assistant turn is still what was said, so it stays in the
      // record — but it is closed, so the next thing the model says is a new turn
      // rather than an append onto half a sentence.
      this.closeTurn();
      this.patch({ speaking: false });
    }

    const transcript = content.inputTranscription as { text?: string } | undefined;
    if (typeof transcript?.text === 'string' && transcript.text) {
      this.patch({ userTranscript: transcript.text });
      this.noteReporterTurn(transcript.text);
    }

    const spoken = content.outputTranscription as { text?: string } | undefined;
    if (typeof spoken?.text === 'string' && spoken.text) {
      this.patch({
        assistantTranscript: this.state.assistantTranscript
          ? `${this.state.assistantTranscript} ${spoken.text}`
          : spoken.text,
      });
      this.noteAssistantTurn(spoken.text);
    }

    const modelTurn = content.modelTurn as { parts?: unknown[] } | undefined;
    if (Array.isArray(modelTurn?.parts)) {
      for (const part of modelTurn.parts) {
        const data = (part as { inlineData?: { data?: string; mimeType?: string } }).inlineData;
        if (typeof data?.data === 'string' && data.data) this.enqueueAudio(data.data);
      }
    }

    if (content.turnComplete === true) {
      this.closeTurn();
      this.patch({ speaking: false });
    }
  }

  /**
   * The reporter's turn, which the server re-sends in full as it revises it.
   *
   * Replaced rather than appended — see the `turns` field for why the asymmetry
   * with the assistant's turns is correct and not an oversight.
   */
  private noteReporterTurn(text: string): void {
    const last = this.turns[this.turns.length - 1];
    if (this.openRole === 'reporter' && last?.role === 'reporter') {
      this.turns[this.turns.length - 1] = { role: 'reporter', text };
    } else {
      this.turns.push({ role: 'reporter', text });
      this.openRole = 'reporter';
    }
    this.emitTurns();
  }

  /**
   * The assistant's turn, which arrives in segments as the model speaks.
   *
   * The first segment after a reporter turn also closes that turn, because the
   * model only starts answering once it has finished listening — there is no
   * earlier signal, and inferring it from "the model started talking" is both
   * correct and necessary.
   */
  private noteAssistantTurn(text: string): void {
    const last = this.turns[this.turns.length - 1];
    if (this.openRole === 'assistant' && last?.role === 'assistant') {
      this.turns[this.turns.length - 1] = {
        role: 'assistant',
        text: `${last.text} ${text}`.trim(),
      };
    } else {
      this.turns.push({ role: 'assistant', text });
      this.openRole = 'assistant';
    }
    this.emitTurns();
  }

  private closeTurn(): void {
    this.openRole = null;
  }

  private emitTurns(): void {
    this.stateListener?.(this.getState());
  }

  private onToolCall(toolCall: unknown): void {
    const calls = (toolCall as { functionCalls?: unknown[] } | undefined)?.functionCalls;
    if (!Array.isArray(calls)) return;

    for (const call of calls as {
      id?: string;
      name?: string;
      args?: Record<string, unknown>;
    }[]) {
      const name = call.name ?? '';
      const args = call.args ?? {};

      // Synchronous by design. The model produces no audio on a turn that calls
      // a function, so anything awaited here is silence the person waits out.
      let result: unknown;
      if (name === 'record_intake') {
        this.options.onExtraction(args as IntakeExtraction);
        result = { recorded: true };
      } else if (name === 'finish_intake') {
        this.options.onFinishIntake();
        result = { recorded: true };
      } else {
        // An unknown call still gets a response: leaving one unanswered stalls
        // the turn and the session goes quiet with no explanation.
        result = { recorded: false, reason: 'unknown tool' };
      }

      this.send({
        toolResponse: {
          functionResponses: [{ id: call.id, name, response: result }],
        },
      });
    }
  }

  // ------------------------------------------------------------------------
  // Reconnect
  // ------------------------------------------------------------------------

  private onSocketClosed(event: CloseEvent): void {
    this.disarmSetupTimeout();
    this.disarmOpenTimeout();
    this.teardownAudio();
    this.stopScheduledAudio();
    this.stopClock();

    if (!this.wantsToRun) {
      this.patch({ connection: 'idle', capturing: false, speaking: false });
      return;
    }

    if (this.reconnects >= MAX_RECONNECTS) {
      this.wantsToRun = false;
      this.fail(
        'The voice connection dropped and could not be restored. Text chat is still available.',
      );
      return;
    }

    this.reconnects += 1;
    this.patch({ connection: 'reconnecting' });

    void this.reconnect(event);
  }

  private async reconnect(previous: CloseEvent): Promise<void> {
    try {
      // A token is single-use, so every attempt mints a fresh one. The
      // resumption handle is what carries the conversation, not the token, and
      // `buildSetup` sends it on the new socket — so it must survive the close,
      // which means nothing here may clear it.
      await this.openSocket();
      // 1000/4000 mean a deliberate stop or a setup that never arrived. A normal
      // close is a `stop()` and never reaches here, and the setup watchdog closes
      // with 4000 precisely so this treats it as a failure rather than resuming a
      // session that never existed.
      if (previous.code === 1000 || previous.code === 4000) this.wantsToRun = false;
    } catch {
      this.reconnects = MAX_RECONNECTS;
      this.wantsToRun = false;
      this.fail('The voice connection could not be restored. Text chat is still available.');
    }
  }

  // ------------------------------------------------------------------------
  // Capture
  // ------------------------------------------------------------------------

  private async beginCapture(): Promise<void> {
    if (this.state.muted) return;

    // The stream comes from `requestMic`, which the caller invoked inside a real
    // user gesture. Falling back to asking here would reintroduce exactly the
    // bug that method exists to prevent: by the time `setupComplete` has come
    // back over a socket, the activation is gone and the request either fails or
    // hangs with no error at all.
    if (!this.stream) {
      this.fail(
        'The microphone was not opened, so voice cannot start. You can keep typing instead.',
      );
      return;
    }

    if (this.state.muted) {
      this.releaseStream();
      return;
    }

    try {
      const context = this.ensureAudioContext();
      await context.resume();

      // ~100 ms of audio, in *context-rate* frames.
      //
      // `createScriptProcessor`'s buffer size is in samples at the context's rate,
      // not the 16 kHz we are about to send, so a constant derived from
      // `INPUT_RATE` would silently mean 33 ms at 48 kHz. Derived here instead, so
      // the frame is the size the comment claims at every device rate.
      this.frameSamples = Math.max(256, Math.round(context.sampleRate * 0.1));
      const source = context.createMediaStreamSource(this.stream);
      const processor = context.createScriptProcessor(this.frameSamples, 1, 1);
      const gain = context.createGain();
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;

      // The processor must be connected onward or it never fires. A zero gain
      // keeps it in the graph without echoing the reporter's own voice back at
      // them through the speakers.
      gain.gain.value = 0;
      source.connect(processor);
      processor.connect(gain);
      gain.connect(context.destination);
      gain.connect(analyser);

      processor.onaudioprocess = (event) => {
        this.onAudioFrame(event.inputBuffer.getChannelData(0));
      };

      this.source = source;
      this.processor = processor;
      this.gain = gain;
      this.analyser = analyser;
      this.patch({ capturing: true, error: null });
    } catch {
      this.releaseStream();
      this.fail('This browser could not start the microphone. You can keep typing instead.');
    }
  }

  /**
   * Resample a mic frame to 16 kHz mono PCM16 and send it.
   *
   * Browsers hand over audio at 44.1 or 48 kHz, and Gemini requires 16 kHz, so
   * the naive path — sending the native rate — is rejected outright. Linear
   * interpolation rather than a windowed sinc: it is a few lines, and voice
   * transcription does not audibly care at this ratio.
   */
  private onAudioFrame(samples: Float32Array): void {
    const context = this.audioContext;
    if (!context || this.state.muted) return;
    if (context.sampleRate === INPUT_RATE) {
      this.sendAudio(samples);
      return;
    }
    const ratio = context.sampleRate / INPUT_RATE;
    const outLength = Math.floor(samples.length / ratio);
    if (outLength < 1) return;
    const out = new Float32Array(outLength);
    for (let i = 0; i < outLength; i += 1) {
      const position = i * ratio;
      const index = Math.floor(position);
      const frac = position - index;
      const a = samples[index] ?? 0;
      const b = samples[index + 1] ?? a;
      out[i] = a + (b - a) * frac;
    }
    this.sendAudio(out);
  }

  private sendAudio(samples: Float32Array): void {
    if (samples.length < 1) return;
    const bytes = new ArrayBuffer(samples.length * 2);
    const view = new DataView(bytes);
    for (let i = 0; i < samples.length; i += 1) {
      const clamped = Math.max(-1, Math.min(1, samples[i] ?? 0));
      view.setInt16(i * 2, clamped * 0x7fff, true);
    }
    this.send({
      realtimeInput: { audio: { data: toBase64(bytes), mimeType: INPUT_MIME } },
    });
  }

  // ------------------------------------------------------------------------
  // Playback
  // ------------------------------------------------------------------------

  private enqueueAudio(base64: string): void {
    const context = this.ensureAudioContext();
    if (context.state === 'suspended') void context.resume();

    let bytes: Uint8Array;
    try {
      bytes = fromBase64(base64);
    } catch {
      return;
    }
    if (!bytes.length) return;

    // 16-bit mono: two bytes per sample.
    const frames = Math.floor(bytes.length / 2);
    if (frames < 1) return;

    const buffer = context.createBuffer(1, frames, OUTPUT_RATE);
    const channel = buffer.getChannelData(0);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let i = 0; i < frames; i += 1) {
      channel[i] = view.getInt16(i * 2, true) / 0x8000;
    }

    const now = context.currentTime;
    if (this.nextAudioAt < now) {
      this.nextAudioAt = now + PLAYBACK_JITTER_MS / 1000;
      this.patch({ speaking: true });
    }

    const node = context.createBufferSource();
    node.buffer = buffer;
    node.connect(context.destination);
    node.start(this.nextAudioAt);
    this.nextAudioAt += buffer.duration;
    this.scheduled.push(node);
    // Self-pruning: a node that has finished playing cannot be stopped, and
    // holding every buffer of a two-minute call would be a slow leak of audio
    // memory. Pruned on `ended`, so the list only ever holds what could still
    // make a sound.
    node.onended = () => {
      const index = this.scheduled.indexOf(node);
      if (index >= 0) this.scheduled.splice(index, 1);
    };
  }

  private ensureAudioContext(): AudioContext {
    if (this.audioContext) return this.audioContext;
    const Ctor: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.audioContext = new Ctor();
    return this.audioContext;
  }

  /**
   * Silence every committed-but-unplayed buffer.
   *
   * `nextAudioAt = 0` alone is not interruption, it is amnesia: audio already
   * handed to the browser with a start time will play regardless of what this
   * class believes, so the reporter who interrupts is talked over by the rest of
   * an answer they had already started to hear. Each node is stopped explicitly
   * and disconnected so it releases its buffer.
   */
  private stopScheduledAudio(): void {
    for (const node of this.scheduled) {
      node.onended = null;
      try {
        node.stop();
      } catch {
        // Already stopped, or never started. Either way there is nothing to do.
      }
      node.disconnect();
    }
    this.scheduled = [];
    this.nextAudioAt = 0;
  }

  private teardownCaptureGraph(): void {
    if (this.processor) {
      this.processor.onaudioprocess = null;
      this.processor.disconnect();
      this.processor = null;
    }
    this.source?.disconnect();
    this.source = null;
    this.gain?.disconnect();
    this.gain = null;
    this.analyser = null;
  }

  private teardownAudio(): void {
    this.teardownCaptureGraph();
    this.releaseStream();
  }

  private releaseStream(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }

  // ------------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------------

  /** Current mic RMS in 0..1, for driving the waveform from real audio. */
  getInputLevel(): number {
    const analyser = this.analyser;
    if (!analyser) return 0;
    const bins = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(bins);
    let sum = 0;
    for (const bin of bins) {
      const centred = (bin - 128) / 128;
      sum += centred * centred;
    }
    const rms = Math.sqrt(sum / Math.max(1, bins.length));
    return Math.min(1, rms * 4);
  }

  private patch(next: Partial<LiveSessionState>): void {
    this.state = { ...this.state, ...next };
    this.stateListener?.(this.getState());
  }

  private fail(error: string): void {
    this.patch({
      connection: 'error',
      error,
      capturing: false,
      micPending: false,
      connectingStage: null,
      speaking: false,
    });
  }

  private startClock(): void {
    this.stopClock();
    this.clock = window.setInterval(() => {
      this.patch({ elapsed: Math.floor((Date.now() - this.startedAt) / 1000) });
    }, 1000);
  }

  private stopClock(): void {
    if (this.clock !== null) {
      window.clearInterval(this.clock);
      this.clock = null;
    }
  }
}

// --------------------------------------------------------------------------
// Display mapping
// --------------------------------------------------------------------------

/**
 * Collapse the richer session state onto the seven display states the voice
 * panel already knows how to word.
 *
 * `reconnecting` reads as `connecting` because that is what it is from the
 * reporter's side, and a separate state would mean a fifth copy of this union to
 * keep in step.
 *
 * `error` is checked before `connection`, and the order is deliberate: a denied
 * microphone leaves the socket *live* — the reporter can still type and the model
 * can still speak back — and if that read as `listening` the UI would show a
 * pulsing microphone to someone who has not been given permission to use one.
 * The state says error, the sentence says why, and the way forward is typing.
 */
export function displayState(state: LiveSessionState): VoiceStateDisplay {
  if (state.error !== null) return 'error';
  if (state.connection === 'error') return 'error';
  if (state.connection === 'idle') return 'idle';
  if (state.connection === 'connecting' || state.connection === 'reconnecting') {
    return 'connecting';
  }
  if (state.muted) return 'muted';
  if (state.speaking) return 'speaking';
  // Live, not muted, not speaking, and the mic has not opened yet — the window
  // between `setupComplete` and the permission prompt resolving. `connecting`
  // rather than `idle`, because idle reads as "not started" and this is a
  // started session whose first frame is still on its way.
  if (!state.capturing) return 'connecting';
  return 'listening';
}

// --------------------------------------------------------------------------
// Grant + encoding helpers
// --------------------------------------------------------------------------

/**
 * Ask our own server for a single-use Live token.
 *
 * Resolves or throws with a message meant for a person: voice failing must never
 * surface as an unhandled rejection with a raw status code in it.
 */
export async function fetchLiveGrant(endpoint?: string): Promise<LiveGrant> {
  let response: Response;
  try {
    response = await fetch(endpoint ?? '/api/ai/live/session', { method: 'POST' });
  } catch {
    throw new Error('The relief assistant could not be reached to start voice.');
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      detail?: unknown;
      error?: unknown;
    } | null;
    // Two fields, and which one carries the sentence depends on who failed.
    //
    // `backendUnreachable` in `_shared.ts` sends `error`. `backendRefused` sends
    // `error` *and* `detail`, where `detail` is whatever the Gemini-side failure
    // said — sometimes a useful sentence, sometimes an object, sometimes null.
    // Reading only `detail` (as this did) therefore threw away the human message
    // on the common case and displayed the generic fallback instead, and reading
    // only `error` would miss a refusal worth naming. So: a non-empty *string*
    // detail wins, `error` is the fallback, and anything non-string is ignored
    // rather than rendered as `[object Object]` to someone in an emergency.
    const detail = typeof body?.detail === 'string' ? body.detail.trim() : '';
    const message = typeof body?.error === 'string' ? body.error.trim() : '';
    throw new Error(
      detail || message || 'Voice is starting unavailable. Text chat still works.',
    );
  }
  const grant = (await response.json()) as LiveGrant;
  if (!grant.ws_url || !grant.token) {
    throw new Error('Voice is starting unavailable. Text chat still works.');
  }
  return grant;
}

/**
 * Read a WebSocket frame as text, whatever shape the runtime delivers it in.
 *
 * A browser hands text *and* binary payloads over as `Blob`; Node's `WebSocket`
 * hands binary over as `Blob` too, and would hand an `ArrayBuffer` to anyone who
 * set `binaryType`; a `string` shows up when a runtime is lenient. All three are
 * handled because the one this originally got wrong was the one that actually
 * happens.
 *
 * `null` means "not a frame I can read", which the caller treats as nothing to do
 * rather than as an error — a socket that sends something unrecognised is not
 * worth tearing a call down over.
 */
async function frameToText(data: unknown): Promise<string | null> {
  if (typeof data === 'string') return data;
  if (typeof ArrayBuffer !== 'undefined' && data instanceof ArrayBuffer) {
    return new TextDecoder().decode(data);
  }
  if (typeof Blob !== 'undefined' && data instanceof Blob) return data.text();
  if (ArrayBuffer.isView(data)) {
    // `byteOffset` matters: a view onto a pooled buffer starts partway in, and
    // decoding from zero would prepend another frame's bytes.
    const view: ArrayBufferView = data;
    return new TextDecoder().decode(
      new Uint8Array(view.buffer as ArrayBuffer, view.byteOffset, view.byteLength),
    );
  }
  return null;
}

function messageFor(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Voice is starting unavailable. Text chat still works.';
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  // Chunked, because `String.fromCharCode(...bytes)` blows the argument limit on
  // a 1-second frame.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
