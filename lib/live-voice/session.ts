import type { LiveToken, WireMessage } from '@/lib/ai-client';

/**
 * The Gemini Live WebSocket protocol, as a state machine.
 *
 * Knows nothing about Web Audio, React, or the ticket pipeline. It takes a token
 * and two byte sinks, and reports turns.
 *
 * ## Every shape below was verified against the live service
 *
 * This is a protocol assembled from a real handshake, so the comments record
 * what the service actually did rather than what a schema implied. Four of
 * these are load-bearing and easy to get wrong:
 *
 * 1. **The setup is pinned in the token, so the client sends almost nothing.**
 *    `bidiGenerateContentSetup` in the ephemeral token overrides the browser's
 *    `setup` wholesale — including a `fieldMask`. Sending one from here would
 *    be inert, and worse, would look like the client controls the model or the
 *    system instruction. It does not. The only thing the client's setup *does*
 *    carry is `sessionResumption.handle` on a reconnect, because resumption is
 *    per-connection state that could not be pinned in a single-use token.
 *
 * 2. **Turns end on `voiceActivity`, not `turnComplete`.**
 *    With automatic voice activity detection, the service closes a spoken turn
 *    with `voiceActivity: {endOfSpeech: true}` and emits `turnComplete` only for
 *    turns it considers finished. An audio turn in practice produced *only* the
 *    `voiceActivity` boundary, so a session that waited for `turnComplete` to
 *    commit the transcript would hang with the last turn unrecorded.
 *
 * 3. **`inputTranscription` is cumulative, not incremental.**
 *    Within one turn the service re-sent the whole utterance on every fragment.
 *    `outputTranscription` is the opposite: incremental fragments that must be
 *    concatenated. Treating them the same way is the single easiest way to end
 *    up with a transcript that is either quadrupled or one word long, and the
 *    failure is silent — it looks like a bad conversation, not a bug.
 *
 * 4. **The microphone keeps sending silence.**
 *    `audioStreamEnd` between turns closes the turn for good, so a turn that was
 *    meant to be a follow-up instead ends the stream and everything after it is
 *    treated as a new conversation. There is no "end of turn" frame to send;
 *    the boundary is the server's to announce.
 */

export const INPUT_MIME = 'audio/pcm;rate=16000';

export type LiveSessionState =
  | 'idle'
  | 'connecting'
  | 'ready'
  | 'reconnecting'
  | 'closed'
  | 'failed';

export type LiveFailureKind =
  | 'socket_refused'
  | 'socket_dropped'
  | 'no_setup'
  | 'rejected'
  | 'gave_up'
  | 'unknown';

export interface LiveSessionEvents {
  onState(state: LiveSessionState): void;
  /** A completed turn, in order. The hook appends these to the transcript. */
  onTurn(turn: WireMessage): void;
  /** The assistant began and stopped talking, for the waveform and the caption. */
  onSpeaking(speaking: boolean): void;
  /** The reporter started talking over queued assistant audio. */
  onInterrupted(): void;
  onFailure(kind: LiveFailureKind, message: string): void;
}

export interface LiveSessionSinks {
  /** 24 kHz mono PCM16 LE from the service. */
  receiveAudio(pcm: ArrayBuffer): void;
  /** Discard everything queued for playback. */
  flushAudio(): void;
}

const BASE64_ALPHABET_SAFE_CHUNK = 0x8000;

/**
 * Base64 without `String.fromCharCode(...bytes)`.
 *
 * Spreading a 6 kB frame into 6 400 arguments is fine; spreading a 30-second
 * buffer is not, and the failure is a `RangeError` on a code path that only runs
 * on a slow device, which is to say during the disaster this app is for.
 */
export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += BASE64_ALPHABET_SAFE_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_ALPHABET_SAFE_CHUNK));
  }
  return btoa(binary);
}

export function fromBase64(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

interface WireEnvelope {
  setupComplete?: unknown;
  realtimeInputConfig?: unknown;
  goAway?: { timeLeft?: string | null };
  sessionResumptionUpdate?: { newHandle?: string | null; resumable?: boolean };
  serverContent?: {
    modelTurn?: {
      parts?: Array<{
        inlineData?: { data?: string; mimeType?: string };
        text?: string;
      }>;
      role?: string;
    };
    inputTranscription?: { text?: string } | null;
    outputTranscription?: { text?: string } | null;
    turnComplete?: boolean;
    interrupted?: boolean;
  };
  voiceActivity?: { startOfSpeech?: boolean; endOfSpeech?: boolean };
}

/**
 * ReadyState values as plain numbers.
 *
 * `WebSocket.OPEN` reads better but needs the global to exist, and this module
 * is exercised in Node by the protocol tests, where a stub socket carries no
 * constants. The values are fixed by the WHATWG spec, so this is not a guess.
 */
/**
 * How long a socket must stay up before the backoff counter resets.
 *
 * The counter cannot simply reset on `setupComplete`. A link that completes the
 * handshake and is then dropped — a token the service refuses after accepting
 * the TCP connection, a captive portal, a proxy that allows the socket and
 * kills the stream — produces `setupComplete` every single time, so a naive
 * reset means the counter never climbs and the session reconnects forever. The
 * token is single-use and billable, so an unbounded retry loop is a real cost,
 * and it is invisible because each attempt looks successful.
 *
 * Resetting only after a connection has *stayed* up distinguishes a genuine
 * blip (retry immediately, the conversation resumes) from a poisoned link
 * (back off, then give up and hand the reporter back to text).
 */
const STABLE_CONNECTION_MS = 10_000;

const SOCKET_OPEN = 1;


export type SocketFactory = (url: string) => WebSocket;

export class LiveSession {
  private socket: WebSocket | null = null;
  private resumptionHandle: string | null = null;
  private closedByCaller = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stableTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;

  /** Transcription state for the turn currently in progress. */
  private userTurnText = '';
  private assistantTurnText = '';
  private userTurnOpen = false;
  private assistantSpeaking = false;

  constructor(
    private readonly token: LiveToken,
    private readonly sinks: LiveSessionSinks,
    private readonly events: LiveSessionEvents,
    /**
     * Injectable so the protocol tests can drive `onopen`/`onmessage`/
     * `onclose` against a stub instead of a real network. The rules pinned
     * here are all about *which* frame ends a turn and whether a transcript is
     * cumulative or incremental — neither of which is observable without
     * replaying envelopes, and the real service will not produce those
     * envelopes on demand.
     */
    private readonly socketFactory: SocketFactory = (url) => new WebSocket(url),
  ) {}

  /**
   * A handle for resuming an interrupted connection.
   *
   * Read this when the UI offers "reconnect", because the service sends the
   * latest handle at unpredictable points — a handle from mid-session is stale
   * and resuming on it silently loses the turns since.
   */
  get resumableHandle(): string | null {
    return this.resumptionHandle;
  }

  connect(): void {
    this.closedByCaller = false;
    this.open(false);
  }

  private open(isReconnect: boolean): void {
    this.events.onState(isReconnect ? 'reconnecting' : 'connecting');

    let socket: WebSocket;
    try {
      socket = this.socketFactory(this.token.ws_url);
    } catch {
      this.events.onFailure(
        'socket_refused',
        'The voice connection could not be opened. You can continue in text.',
      );
      return;
    }
    socket.binaryType = 'arraybuffer';
    this.socket = socket;

    socket.onopen = () => {
      // The client sends exactly one thing: where to resume. Nothing else.
      //
      // It used to also send a top-level `realtimeInputConfig`. That field is
      // not a client message at all — the wire only accepts `setup`,
      // `clientContent`, `realtimeInput` and `toolResponse` — so the service
      // rejected the frame with 1007 "Unknown name" and closed the socket. The
      // symptom was an instant "voice unavailable" with no explanation, because
      // the close was the only thing we were listening for.
      //
      // Deleting it is also strictly better than fixing it. Turn-taking is
      // already pinned in the token, including `activityHandling:
      // START_OF_ACTIVITY_INTERRUPTS`, which is what lets a shouting reporter
      // cut the model off mid-sentence. A client-side override would have
      // replaced that with a bare activity-detection block and quietly removed
      // the barge-in — a safety feature, lost to a redundant message.
      this.send({
        setup: this.resumptionHandle
          ? { sessionResumption: { handle: this.resumptionHandle } }
          : {},
      });
    };

    socket.onmessage = (event: MessageEvent) => {
      const data = event.data;
      if (typeof data === 'string') {
        this.receive(data);
        return;
      }
      // `binaryType` is 'arraybuffer', so if the service ever sends a frame as
      // binary it arrives here rather than as a string. Guarding on `string`
      // alone silently discards it, and a session that receives nothing looks
      // identical to one that is being ignored — which is exactly the failure
      // this function was rewritten to prevent.
      if (data instanceof ArrayBuffer) {
        this.receive(new TextDecoder().decode(data));
      }
    };

    socket.onerror = () => {
      // `error` is always followed by `close` for a WebSocket, so the failure
      // is reported there with the code that explains it. Reporting here too
      // would double-report every disconnect.
    };

    socket.onclose = (event: CloseEvent) => {
      this.socket = null;
      // A socket that dies before it was stable must not clear the counter
      // after the fact, or the poisoned-link case never escalates.
      if (this.stableTimer) {
        clearTimeout(this.stableTimer);
        this.stableTimer = null;
      }
      this.commitAssistantTurn();
      this.commitUserTurn();

      if (this.closedByCaller) {
        this.events.onState('closed');
        return;
      }

      // The close code is the only evidence of *why* a socket died, and the
      // socket runs browser -> Gemini directly, so nothing on our servers ever
      // sees it. Discarding the event made a refused handshake (1006), a policy
      // rejection (1008) and a protocol error (1002) indistinguishable from each
      // other and from a normal close (1000) — four unrelated faults presenting
      // as one identical sentence. Logged rather than shown: the reporter needs
      // an instruction, an operator needs the number.
      const code = event?.code ?? 1006;
      const reason = event?.reason || '';
      console.warn(
        `[live] socket closed code=${code}${reason ? ` reason=${reason}` : ''} ` +
          `attempt=${this.attempt} stable=${this.resumptionHandle ? 'resumable' : 'none'}`,
      );
      const detail = ` (code ${code})`;

      if (this.attempt >= 4) {
        this.events.onFailure(
          'gave_up',
          'The voice connection dropped and could not be restored' +
            `${detail}. Your conversation is saved — continue in text.`,
        );
        this.events.onState('failed');
        return;
      }

      this.events.onFailure(
        'socket_dropped',
        `The voice connection dropped${detail}. Reconnecting…`,
      );
      const delay = Math.min(8000, 500 * 2 ** this.attempt);
      this.attempt += 1;
      this.reconnectTimer = setTimeout(() => this.open(true), delay);
    };
  }

  /**
   * Forward one microphone frame.
   *
   * Frames keep arriving for the life of the session, silence included, and
   * that is deliberate. There is no "the reporter finished" frame to send — the
   * boundary is `voiceActivity.endOfSpeech`, and it only arrives if the socket
   * is still being fed when the reporter goes quiet.
   */
  sendAudio(frame: ArrayBuffer): void {
    if (!frame.byteLength) return;
    // `realtimeInput.audio`, not `realtimeInput.mediaChunks`.
    //
    // `mediaChunks` is deprecated. On v1beta the service rejects it outright
    // with `realtime_input.media_chunks is deprecated. Use audio, video, or text
    // instead` — which is how it was found. On v1alpha, the version we pin, it
    // is worse: the frame is *accepted and silently discarded*, so every
    // microphone sample was dropped on the floor. The session looked flawless
    // — `setupComplete`, "Listening", a live waveform — and the model was sent
    // pure silence, so it never spoke and voice activity detection never fired.
    // Not one error, not one log line, from either end.
    //
    // A deprecated field that the pinned API version quietly ignores is the
    // worst shape a protocol bug can take: it cannot be discovered by reading
    // our own code, and the loud version of it lives on an endpoint we do not
    // call. Hence the e2e test that asserts audio actually comes back.
    this.send({
      realtimeInput: {
        audio: { mimeType: INPUT_MIME, data: toBase64(new Uint8Array(frame)) },
      },
    });
  }

  close(): void {
    this.closedByCaller = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.stableTimer) {
      clearTimeout(this.stableTimer);
      this.stableTimer = null;
    }
    this.commitAssistantTurn();
    this.commitUserTurn();
    const socket = this.socket;
    this.socket = null;
    socket?.close(1000, 'client closed');
    this.events.onState('closed');
  }

  private send(message: unknown): void {
    const socket = this.socket;
    if (!socket || socket.readyState !== SOCKET_OPEN) return;
    socket.send(JSON.stringify(message));
  }

  private receive(raw: string): void {
    let envelope: WireEnvelope;
    try {
      envelope = JSON.parse(raw) as WireEnvelope;
    } catch {
      return;
    }

    // A service rejection explains itself, and then closes the socket. Ignoring
    // it meant the close was the only signal we had, so a config the service
    // refused presented to the reporter as a random dropped call — the exact
    // failure that cost real time here, and the one thing this layer exists to
    // prevent. The service's own words go to the log; the reporter gets a
    // plain instruction they can act on.
    const rejection = (envelope as { error?: { code?: number; message?: string } }).error;
    if (rejection) {
      const detail = rejection.message?.trim();
      console.warn(
        `[live] service rejected the session: code=${rejection.code ?? '?'} ` +
          `message=${detail ?? '(none)'}`,
      );
      // Terminal and not retried. A rejection is deterministic — the same
      // setup would be refused identically five more times, burning the retry
      // budget and the reporter's patience to arrive at the same answer.
      this.closedByCaller = true;
      this.socket?.close(1000, 'service rejected the session');
      this.socket = null;
      this.events.onFailure(
        'rejected',
        'The voice service could not start this session. You can keep going in text.',
      );
      this.events.onState('failed');
      return;
    }

    if (envelope.setupComplete) {
      // Not a straight reset — see `STABLE_CONNECTION_MS`. A connection that
      // reaches `setupComplete` but dies immediately must still count as a
      // failed attempt, or a poisoned link retries forever.
      this.stableTimer = setTimeout(() => {
        this.stableTimer = null;
        this.attempt = 0;
      }, STABLE_CONNECTION_MS);
      this.events.onState('ready');
      return;
    }

    if (envelope.goAway) this.noteGoAway(envelope.goAway.timeLeft ?? null);

    if (envelope.sessionResumptionUpdate?.newHandle) {
      this.resumptionHandle = envelope.sessionResumptionUpdate.newHandle ?? null;
    }

    if (envelope.voiceActivity) {
      this.onVoiceActivity(envelope.voiceActivity);
    }

    const content = envelope.serverContent;
    if (!content) return;

    // An interruption invalidates whatever the assistant was about to say.
    // Discard the partial output transcription too, or the reporter ends up
    // reading back the half-sentence they just talked over.
    if (content.interrupted) {
      this.assistantTurnText = '';
      if (this.assistantSpeaking) {
        this.assistantSpeaking = false;
        this.events.onSpeaking(false);
      }
      this.sinks.flushAudio();
      this.events.onInterrupted();
    }

    for (const part of content.modelTurn?.parts ?? []) {
      if (part.inlineData?.data) {
        try {
          this.sinks.receiveAudio(fromBase64(part.inlineData.data));
        } catch {
          // A malformed fragment is not worth ending the session over.
        }
      }
    }

    if (content.outputTranscription?.text) {
      this.assistantTurnText += content.outputTranscription.text;
      if (!this.assistantSpeaking) {
        this.assistantSpeaking = true;
        this.events.onSpeaking(true);
      }
    }

    // Cumulative: keep the newest value, never append.
    if (content.inputTranscription?.text !== undefined && content.inputTranscription?.text !== null) {
      this.userTurnOpen = true;
      this.userTurnText = content.inputTranscription.text;
    }

    if (content.turnComplete) {
      this.commitAssistantTurn();
      this.commitUserTurn();
    }
  }

  private onVoiceActivity(activity: { startOfSpeech?: boolean; endOfSpeech?: boolean }): void {
    if (activity.startOfSpeech) {
      this.userTurnOpen = true;
      // Queue the reporter talking over whatever was about to play, even if the
      // service has not sent `interrupted` yet.
      this.sinks.flushAudio();
    }
    if (activity.endOfSpeech) {
      this.commitUserTurn();
    }
  }

  private commitUserTurn(): void {
    const text = this.userTurnText.trim();
    this.userTurnText = '';
    this.userTurnOpen = false;
    if (!text) return;
    this.events.onTurn({ role: 'user', text });
  }

  private commitAssistantTurn(): void {
    const text = this.assistantTurnText.trim();
    this.assistantTurnText = '';
    if (this.assistantSpeaking) {
      this.assistantSpeaking = false;
      this.events.onSpeaking(false);
    }
    if (!text) return;
    this.events.onTurn({ role: 'assistant', text });
  }

  private noteGoAway(timeLeft: string | null): void {
    if (!timeLeft) return;
    // The service tells us how long the socket has left. Reconnecting early
    // inside that window keeps the conversation audibly continuous instead of
    // dropping to silence and back.
    const ms = Date.parse(timeLeft) - Date.now();
    if (!Number.isFinite(ms) || ms <= 0) return;
    const safeDelay = Math.max(250, Math.min(ms, 30_000));
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.closedByCaller && this.socket) {
        const socket = this.socket;
        this.socket = null;
        socket.close(1000, 'go away');
      }
    }, safeDelay);
  }

  /** Whether a user turn is currently open, for the "still listening" hint. */
  get userTurnInProgress(): boolean {
    return this.userTurnOpen;
  }
}
