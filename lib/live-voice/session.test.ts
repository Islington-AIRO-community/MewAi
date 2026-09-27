import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveToken, WireMessage } from '@/lib/ai-client';
import {
  LiveSession,
  fromBase64,
  INPUT_MIME,
  toBase64,
  type LiveSessionEvents,
  type LiveSessionSinks,
  type SocketFactory,
} from './session';

/**
 * The Gemini Live transcript rules, pinned.
 *
 * ## Why this file exists
 *
 * Every rule below was reverse-engineered by watching a real socket, not read
 * off a schema, and each one fails **silently**. A cumulative transcript treated
 * as incremental produces a conversation that looks like a rambling reporter.
 * An incremental one treated as cumulative produces the last word of every
 * sentence. A turn committed on `turnComplete` when the service only ever sends
 * `voiceActivity` drops the final turn of every conversation — usually the one
 * containing the location.
 *
 * None of those look like a bug. They look like a bad conversation, they pass
 * code review, and they ship to someone who is trapped. So the behaviour is
 * asserted here rather than described in a comment and trusted to stay true.
 *
 * These tests replace the Stage 0 probes under `/tmp`, which are gone. That
 * matters: the probes proved the rules once, and nothing held them after that.
 */

const TOKEN: LiveToken = {
  ws_url: 'wss://example.invalid/socket?access_token=stub',
  token: 'stub',
  expires_at: '2026-09-27T10:00:00Z',
};

// `session.ts` warns on every close, which is the point of it — but a dozen
// dropped sockets would bury the actual test output. The close-code tests
// below re-spy to assert on it.
beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** A WebSocket stand-in that records what the session sent it. */
class StubSocket {
  readyState = 1;
  binaryType = 'binary';
  sent: unknown[] = [];
  closed: { code?: number; reason?: string } | null = null;

  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null = null;
  onerror: (() => void) | null = null;

  send(payload: string): void {
    this.sent.push(JSON.parse(payload));
  }

  close(code?: number, reason?: string): void {
    this.closed = { code, reason };
    this.readyState = 3;
  }

  /* --- driving the socket --- */

  open(): void {
    this.onopen?.();
  }

  deliver(envelope: unknown): void {
    this.onmessage?.({ data: JSON.stringify(envelope) });
  }

  dropFromServer(): void {
    this.readyState = 3;
    this.onclose?.({ code: 1006 });
  }
}

function setup() {
  const sockets: StubSocket[] = [];
  const factory: SocketFactory = () => {
    const socket = new StubSocket();
    sockets.push(socket);
    return socket as unknown as WebSocket;
  };

  const turns: WireMessage[] = [];
  const states: string[] = [];
  const failures: Array<{ kind: string; message: string }> = [];
  const interruptions: number[] = [];

  const events: LiveSessionEvents = {
    onState: (state) => states.push(state),
    onTurn: (turn) => turns.push(turn),
    onSpeaking: vi.fn(),
    onInterrupted: () => interruptions.push(turns.length),
    onFailure: (kind, message) => failures.push({ kind, message }),
  };

  const flushAudio = vi.fn();
  const receiveAudio = vi.fn();
  const sinks: LiveSessionSinks = { receiveAudio, flushAudio };

  const session = new LiveSession(TOKEN, sinks, events, factory);
  return {
    session,
    sockets,
    turns,
    states,
    failures,
    interruptions,
    flushAudio,
    receiveAudio,
  };
}

/** A socket that has finished its handshake. */
function connected() {
  const ctx = setup();
  ctx.session.connect();
  const socket = ctx.sockets[0];
  socket.open();
  socket.deliver({ setupComplete: {} });
  return { ...ctx, socket };
}

describe('input transcription is cumulative, not incremental', () => {
  it('emits one user turn with the final text, not the fragments concatenated', () => {
    const { socket, turns } = connected();

    socket.deliver({ voiceActivity: { startOfSpeech: true } });
    // The service re-sends the whole utterance on each fragment. Reading these
    // as deltas is what produced a transcript repeated four times over.
    socket.deliver({ serverContent: { inputTranscription: { text: 'We are' } } });
    socket.deliver({ serverContent: { inputTranscription: { text: 'We are trapped' } } });
    socket.deliver({
      serverContent: { inputTranscription: { text: 'We are trapped upstairs' } },
    });
    socket.deliver({ voiceContent: {}, serverContent: {}, voiceActivity: { endOfSpeech: true } });

    expect(turns).toEqual([{ role: 'user', text: 'We are trapped upstairs' }]);
  });

  it('keeps consecutive turns separate', () => {
    const { socket, turns } = connected();

    socket.deliver({ voiceActivity: { startOfSpeech: true } });
    socket.deliver({ serverContent: { inputTranscription: { text: 'first thing' } } });
    socket.deliver({ voiceActivity: { endOfSpeech: true } });

    socket.deliver({ voiceActivity: { startOfSpeech: true } });
    socket.deliver({ serverContent: { inputTranscription: { text: 'second thing' } } });
    socket.deliver({ voiceActivity: { endOfSpeech: true } });

    expect(turns).toEqual([
      { role: 'user', text: 'first thing' },
      { role: 'user', text: 'second thing' },
    ]);
  });
});

describe('output transcription is incremental, not cumulative', () => {
  it('concatenates fragments into one assistant turn', () => {
    const { socket, turns } = connected();

    socket.deliver({ serverContent: { outputTranscription: { text: 'I ' } } });
    socket.deliver({ serverContent: { outputTranscription: { text: 'can ' } } });
    socket.deliver({ serverContent: { outputTranscription: { text: 'help.' } } });
    socket.deliver({ serverContent: { turnComplete: true } });

    expect(turns).toEqual([{ role: 'assistant', text: 'I can help.' }]);
  });
});

describe('a turn ends on voiceActivity, not turnComplete', () => {
  it('commits the final user turn when the service never sends turnComplete', () => {
    const { socket, turns } = connected();

    socket.deliver({ voiceActivity: { startOfSpeech: true } });
    socket.deliver({
      serverContent: { inputTranscription: { text: 'we are on Mill Road' } },
    });
    // No `turnComplete` anywhere. Waiting for one drops the last thing the
    // reporter said, which is routinely the location a crew needs.
    socket.deliver({ voiceActivity: { endOfSpeech: true } });

    expect(turns).toEqual([{ role: 'user', text: 'we are on Mill Road' }]);
  });

  it('does not commit an empty turn', () => {
    const { socket, turns } = connected();

    socket.deliver({ voiceActivity: { startOfSpeech: true } });
    socket.deliver({ serverContent: { inputTranscription: { text: '   ' } } });
    socket.deliver({ voiceActivity: { endOfSpeech: true } });

    expect(turns).toEqual([]);
  });
});

describe('interruption', () => {
  it('discards the partial assistant turn so a half-sentence is never shown', () => {
    const { socket, turns } = connected();

    socket.deliver({ serverContent: { outputTranscription: { text: 'a crew is on the' } } });
    socket.deliver({ serverContent: { interrupted: true } });
    socket.deliver({ voiceActivity: { startOfSpeech: true } });
    socket.deliver({ serverContent: { inputTranscription: { text: 'no wait' } } });
    socket.deliver({ voiceActivity: { endOfSpeech: true } });

    // The reporter is mid-emergency; telling them a crew is on the way when it
    // is not is the single worst output this backend could produce.
    expect(turns).toEqual([{ role: 'user', text: 'no wait' }]);
  });

  it('flushes queued audio and reports the interruption', () => {
    const { socket, flushAudio, interruptions } = connected();

    socket.deliver({ serverContent: { outputTranscription: { text: 'a crew is' } } });
    expect(flushAudio).not.toHaveBeenCalled();

    socket.deliver({ serverContent: { interrupted: true } });

    expect(flushAudio).toHaveBeenCalled();
    expect(interruptions).toHaveLength(1);
  });

  it('flushes on the start of speech even before the service acknowledges it', () => {
    const { socket, flushAudio } = connected();

    socket.deliver({ voiceActivity: { startOfSpeech: true } });

    expect(flushAudio).toHaveBeenCalled();
  });
});

describe('resumption', () => {
  it('keeps the latest handle, not the first', () => {
    const { session, socket } = connected();

    socket.deliver({ sessionResumptionUpdate: { newHandle: 'stale', resumable: true } });
    socket.deliver({ sessionResumptionUpdate: { newHandle: 'fresh', resumable: true } });

    expect(session.resumableHandle).toBe('fresh');
  });

  it('sends the handle in the setup of a reconnect', () => {
    vi.useFakeTimers();
    try {
      const ctx = setup();
      ctx.session.connect();
      const first = ctx.sockets[0];
      first.open();
      first.deliver({ setupComplete: {} });
      first.deliver({ sessionResumptionUpdate: { newHandle: 'abc123' } });

      first.dropFromServer();
      vi.advanceTimersByTime(1_000);

      expect(ctx.sockets).toHaveLength(2);
      // The reconnect socket only speaks once the service accepts it.
      ctx.sockets[1].open();
      const reconnectSetup = ctx.sockets[1].sent[0] as {
        setup: { sessionResumption?: { handle?: string } };
      };
      expect(reconnectSetup.setup.sessionResumption?.handle).toBe('abc123');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the client cannot override the pinned setup', () => {
  it('never sends a model, voice, or system instruction', () => {
    const { socket } = connected();

    const flat = JSON.stringify(socket.sent);
    for (const forbidden of [
      'gemini-',
      'system_instruction',
      'systemInstruction',
      'generation_config',
      'generationConfig',
      'speech_config',
      'voice',
      'Charon',
    ]) {
      expect(flat).not.toContain(forbidden);
    }
  });

  it('sends nothing but the setup — no invalid top-level frames', () => {
    const { socket } = connected();

    // A top-level `realtimeInputConfig` is not a client message. The service
    // rejects the whole frame with 1007 "Unknown name" and closes, which
    // reached the reporter as an unexplained "voice unavailable". Turn-taking
    // is pinned in the token instead.
    for (const message of socket.sent as Array<Record<string, unknown>>) {
      expect(Object.keys(message)).toEqual(['setup']);
    }
    expect(socket.sent).toHaveLength(1);
  });

  it('does not override the pinned turn-taking config', () => {
    const { socket } = connected();

    const flat = JSON.stringify(socket.sent);
    // `activityHandling: START_OF_ACTIVITY_INTERRUPTS` is what lets a shouting
    // reporter cut the model off mid-sentence. A client-side VAD block would
    // have replaced it and quietly removed the barge-in.
    expect(flat).not.toContain('realtimeInputConfig');
    expect(flat).not.toContain('automaticActivityDetection');
    expect(flat).not.toContain('silenceDurationMs');
  });
});

describe('audio frames', () => {
  it('are sent as base64 PCM at the rate the service expects', () => {
    const { session, socket } = connected();

    const pcm = new Int16Array([1, -1, 32767, -32768]);
    session.sendAudio(pcm.buffer);

    const message = socket.sent.at(-1) as {
      realtimeInput: { audio: { mimeType: string; data: string } };
    };
    expect(message.realtimeInput.audio.mimeType).toBe(INPUT_MIME);
    expect(INPUT_MIME).toBe('audio/pcm;rate=16000');
  });

  it('go out as realtimeInput.audio, never the deprecated mediaChunks', () => {
    const { session, socket } = connected();

    session.sendAudio(new Int16Array([1, 2, 3]).buffer);

    // `mediaChunks` is accepted and *silently discarded* on v1alpha, the
    // version we pin. The session looks perfect and the model hears nothing.
    // v1beta rejects it loudly; we do not call v1beta, so nothing would ever
    // have told us. Assert the field name instead of trusting a comment.
    const message = socket.sent.at(-1) as Record<string, Record<string, unknown>>;
    expect(Object.keys(message)).toEqual(['realtimeInput']);
    expect(Object.keys(message.realtimeInput)).toEqual(['audio']);
    expect(JSON.stringify(socket.sent)).not.toContain('mediaChunks');
  });

  it('survive a base64 round trip byte for byte', () => {
    const original = new Uint8Array([0, 1, 127, 128, 254, 255, 42]);
    expect(new Uint8Array(fromBase64(toBase64(original)))).toEqual(original);
  });

  it('survive the trip through the wire encoding unchanged', () => {
    const { session, socket } = connected();
    const pcm = new Int16Array([1234, -4321, 7]);

    session.sendAudio(pcm.buffer);
    const message = socket.sent.at(-1) as {
      realtimeInput: { audio: { data: string } };
    };
    const decoded = new Int16Array(fromBase64(message.realtimeInput.audio.data));

    expect(Array.from(decoded)).toEqual(Array.from(pcm));
  });

  it('are dropped when empty rather than sent as a zero-length chunk', () => {
    const { session, socket } = connected();
    const before = socket.sent.length;

    session.sendAudio(new ArrayBuffer(0));

    expect(socket.sent).toHaveLength(before);
  });

  it('decodes server audio for playback', () => {
    const { session, receiveAudio } = connected();
    const pcm = new Int16Array([100, -100]);

    // A server frame arrives as base64 inline data inside a model turn part.
    (session as unknown as { receive(raw: string): void }).receive(
      JSON.stringify({
        serverContent: {
          modelTurn: {
            parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: toBase64(new Uint8Array(pcm.buffer)) } }],
          },
        },
      }),
    );

    expect(receiveAudio).toHaveBeenCalledTimes(1);
    expect(Array.from(new Int16Array(receiveAudio.mock.calls[0][0]))).toEqual([100, -100]);
  });
});

describe('a service rejection explains itself', () => {
  it('surfaces the error frame instead of letting it look like a drop', () => {
    const { socket, failures, states } = connected();

    // Exactly what the service sends for a field it does not recognise.
    socket.deliver({
      error: {
        code: 1007,
        message: 'Invalid JSON payload received. Unknown name "realtimeInputConfig".',
      },
    });

    expect(failures[0]?.kind).toBe('rejected');
    expect(failures[0]?.message).toMatch(/could not start this session/i);
    expect(failures[0]?.message).not.toMatch(/dropped/i);
    expect(states).toContain('failed');
  });

  it('does not burn the retry budget on a deterministic rejection', () => {
    vi.useFakeTimers();
    try {
      const { socket, sockets, failures } = connected();

      socket.deliver({ error: { code: 1007, message: 'Unknown name.' } });
      vi.advanceTimersByTime(60_000);

      // The same setup would be refused identically five more times.
      expect(sockets).toHaveLength(1);
      expect(failures.filter((f) => f.kind === 'gave_up')).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the service message in the log, not in the reporter-facing text', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { socket, failures } = connected();

    socket.deliver({ error: { code: 1007, message: 'Unknown name "foo".' } });

    // The operator needs the field name; the reporter needs an instruction.
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Unknown name "foo"'));
    expect(failures[0]?.message).not.toContain('foo');
  });
});

describe('the close code is preserved', () => {
  it('puts the code in the drop message so a refused handshake is diagnosable', () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { socket, failures } = connected();

      // 1008 is a policy rejection; 1006 is a handshake the peer never
      // accepted. Both used to produce one identical sentence.
      socket.onclose?.({ code: 1008, reason: 'policy' });

      expect(failures[0]?.kind).toBe('socket_dropped');
      expect(failures[0]?.message).toContain('1008');
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('code=1008'));
    } finally {
      warn.mockRestore();
      vi.useRealTimers();
    }
  });

  it('surfaces the code in the give-up message after exhausting retries', () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const ctx = setup();
      ctx.session.connect();

      for (let i = 0; i < 8; i += 1) {
        const socket = ctx.sockets[ctx.sockets.length - 1];
        socket.open();
        socket.deliver({ setupComplete: {} });
        socket.onclose?.({ code: 1006 });
        vi.advanceTimersByTime(60_000);
      }

      const gaveUp = ctx.failures.find((f) => f.kind === 'gave_up');
      expect(gaveUp?.message).toContain('code 1006');
    } finally {
      warn.mockRestore();
      vi.useRealTimers();
    }
  });
});

describe('reconnect', () => {
  it('reports a drop as a recoverable reconnect, not a dead session', () => {
    vi.useFakeTimers();
    try {
      const { socket, states, failures } = connected();

      socket.dropFromServer();

      // Immediately after the drop the reporter is told what happened and that
      // help is on the way — not that the session ended.
      expect(failures[0]?.kind).toBe('socket_dropped');
      expect(states).not.toContain('failed');

      vi.advanceTimersByTime(1_000);
      expect(states).toContain('reconnecting');
    } finally {
      vi.useRealTimers();
    }
  });

  it('escalates through a poisoned link and gives up instead of retrying forever', () => {
    vi.useFakeTimers();
    try {
      const ctx = setup();
      ctx.session.connect();

      // Every attempt reaches `setupComplete` and then dies immediately, which
      // is the case that makes a naive "reset on setup" backoff loop forever on
      // a single-use billable token.
      for (let i = 0; i < 8; i += 1) {
        const socket = ctx.sockets[ctx.sockets.length - 1];
        socket.open();
        socket.deliver({ setupComplete: {} });
        socket.dropFromServer();
        vi.advanceTimersByTime(60_000);
      }

      expect(ctx.failures.some((f) => f.kind === 'gave_up')).toBe(true);
      expect(ctx.states).toContain('failed');
      // Bounded: five attempts, not eight.
      expect(ctx.sockets).toHaveLength(5);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does give the fast path back after a link has been stable', () => {
    vi.useFakeTimers();
    try {
      const ctx = setup();
      ctx.session.connect();
      const first = ctx.sockets[0];
      first.open();
      first.deliver({ setupComplete: {} });

      // Held open past the stability window, then blipped.
      vi.advanceTimersByTime(11_000);
      first.dropFromServer();
      vi.advanceTimersByTime(1_000);

      // The next link should get attempt 0 again — a real blip, not a poison.
      ctx.sockets[1].open();
      ctx.sockets[1].deliver({ setupComplete: {} });
      vi.advanceTimersByTime(11_000);
      ctx.sockets[1].dropFromServer();
      vi.advanceTimersByTime(1_000);

      expect(ctx.failures.filter((f) => f.kind === 'gave_up')).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not reconnect after the caller closes the session', () => {
    vi.useFakeTimers();
    try {
      const { session, socket, states, sockets } = connected();

      session.close();
      expect(states.at(-1)).toBe('closed');

      vi.advanceTimersByTime(60_000);

      // A closed session must not resurrect itself.
      expect(states).not.toContain('reconnecting');
      expect(sockets).toHaveLength(1);
      expect(socket.closed?.code).toBe(1000);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('malformed input', () => {
  it('accepts a frame delivered as binary, not just as a string', () => {
    const { socket, turns } = connected();

    // `binaryType` is 'arraybuffer', so a binary frame is a real possibility.
    // A `typeof data === 'string'` guard would drop it, and a session that
    // receives nothing is indistinguishable from one being ignored.
    const frame = new TextEncoder().encode(
      JSON.stringify({ serverContent: { inputTranscription: { text: 'delivered as bytes' } } }),
    );
    socket.onmessage?.({ data: frame.buffer });
    socket.deliver({ voiceActivity: { endOfSpeech: true } });

    expect(turns).toEqual([{ role: 'user', text: 'delivered as bytes' }]);
  });

  it('ignores unparseable frames instead of ending the session', () => {
    const { socket, turns } = connected();

    socket.onmessage?.({ data: 'not json at all' });
    socket.deliver({ serverContent: { inputTranscription: { text: 'still here' } } });
    socket.deliver({ voiceActivity: { endOfSpeech: true } });

    expect(turns).toEqual([{ role: 'user', text: 'still here' }]);
  });

  it('survives a base64 part that will not decode', () => {
    const { session, receiveAudio } = connected();

    (session as unknown as { receive(raw: string): void }).receive(
      JSON.stringify({
        serverContent: { modelTurn: { parts: [{ inlineData: { data: '!!!not base64!!!' } }] } },
      }),
    );

    // One bad fragment must not cost the reporter the rest of the audio.
    expect(receiveAudio).not.toHaveBeenCalled();
  });
});
