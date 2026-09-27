/**
 * Microphone and speaker plumbing for the Live voice session.
 *
 * Three things live here and nothing else: getting the mic, turning the worklet's
 * bytes into `ArrayBuffer`s for the socket, and turning the socket's bytes back
 * into sound. The session state machine is in `session.ts` and deliberately
 * knows nothing about Web Audio.
 *
 * ## Sample rates are not symmetric
 *
 * Gemini Live wants 16 kHz in and returns 24 kHz out. They are two different
 * numbers, so this is two `AudioContext`s rather than one. Browsers allow a
 * context to be created at a rate other than the hardware rate and resample on
 * the way in or out; asking for exactly 16 kHz means the browser's resampler
 * does the heavy lifting and the capture worklet's own resampling is a no-op
 * correction rather than the only one.
 */

/** 200 ms of 16 kHz mono. Short enough to feel live, long enough to be cheap. */
const CAPTURE_FRAME_SAMPLES = 3200;
const PLAYBACK_RATE = 24_000;

export class AudioError extends Error {
  readonly kind: 'no_microphone' | 'unsupported';

  constructor(kind: 'no_microphone' | 'unsupported', message: string) {
    super(message);
    this.name = 'AudioError';
    this.kind = kind;
  }
}

async function loadWorklet(ctx: AudioContext, url: string): Promise<void> {
  try {
    await ctx.audioWorklet.addModule(url);
  } catch (cause) {
    throw new AudioError(
      'unsupported',
      `Could not load the audio processor (${url}). This browser does not support AudioWorklet.`,
    );
  }
}

function describeMicFailure(cause: unknown): AudioError {
  const name = cause instanceof DOMException ? cause.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return new AudioError(
      'no_microphone',
      'Microphone access was declined. Allow it in your browser settings, or continue in text.',
    );
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return new AudioError('no_microphone', 'No microphone was found on this device.');
  }
  if (name === 'NotReadableError') {
    return new AudioError(
      'no_microphone',
      'The microphone is in use by another application.',
    );
  }
  return new AudioError('no_microphone', 'The microphone could not be started.');
}

export interface MicrophoneHandlers {
  /** One 200 ms frame of 16 kHz mono PCM16 LE. */
  onFrame: (frame: ArrayBuffer) => void;
  /** RMS of the frame just sent, 0..1, for the waveform. */
  onLevel: (level: number) => void;
}

export interface Microphone {
  /**
   * Drop buffered audio because the user deliberately stopped talking.
   *
   * Not for turn boundaries. A turn ends when the server says so.
   */
  mute(value: boolean): void;
  close(): void;
}

/**
 * Open the microphone and start producing frames.
 *
 * Frames keep flowing for the whole session, silence included. The server's
 * voice activity detection decides where turns end, and it can only do that if
 * it is still listening when the reporter stops.
 */
export async function openMicrophone(
  handlers: MicrophoneHandlers,
): Promise<Microphone> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new AudioError(
      'unsupported',
      'This browser cannot capture audio. You can continue in text.',
    );
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  } catch (cause) {
    throw describeMicFailure(cause);
  }

  let context: AudioContext;
  let node: AudioWorkletNode;
  let source: MediaStreamAudioSourceNode;
  try {
    context = new AudioContext({ sampleRate: 16_000 });
    if (context.state === 'suspended') await context.resume();
    await loadWorklet(context, '/pcm-capture.worklet.js');

    source = context.createMediaStreamSource(stream);
    node = new AudioWorkletNode(context, 'pcm-capture', {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCount: 1,
      channelCountMode: 'explicit',
      processorOptions: { frameSamples: CAPTURE_FRAME_SAMPLES },
    });
  } catch (cause) {
    for (const track of stream.getTracks()) track.stop();
    throw cause instanceof AudioError
      ? cause
      : new AudioError('unsupported', 'The microphone could not be started.');
  }

  node.port.onmessage = (event: MessageEvent) => {
    if (event.data?.type !== 'audio') return;
    const frame: ArrayBuffer = event.data.buffer;
    handlers.onFrame(frame);
    handlers.onLevel(frameRms(frame));
  };
  source.connect(node);

  let closed = false;

  return {
    mute(value) {
      if (closed) return;
      node.port.postMessage({ type: 'mute', value });
    },
    close() {
      if (closed) return;
      closed = true;
      node.port.postMessage({ type: 'stop' });
      source.disconnect();
      node.disconnect();
      for (const track of stream.getTracks()) track.stop();
      void context.close();
    },
  };
}

/** RMS of one Int16 frame, 0..1. Loudness reads better than peak for a waveform. */
function frameRms(frame: ArrayBuffer): number {
  const pcm = new Int16Array(frame);
  if (!pcm.length) return 0;
  let sum = 0;
  for (let i = 0; i < pcm.length; i += 1) {
    const value = pcm[i] / 32768;
    sum += value * value;
  }
  return Math.sqrt(sum / pcm.length);
}

export interface Speaker {
  /** Queue 24 kHz mono PCM16 LE for playback. */
  enqueue(pcm: ArrayBuffer): void;
  /** Discard everything queued — the reporter started speaking over us. */
  flush(): void;
  /**
   * Called when the queue empties.
   *
   * Not the same event as "the assistant's turn ended" — the socket says the
   * turn is over as soon as the text is complete, but the audio for it is still
   * buffered in the worklet. The UI wants the second one to stop the waveform.
   */
  onDrained(handler: (drained: boolean) => void): void;
  close(): void;
}

export async function openSpeaker(): Promise<Speaker> {
  const context = new AudioContext({ sampleRate: PLAYBACK_RATE });
  if (context.state === 'suspended') await context.resume();
  await loadWorklet(context, '/pcm-playback.worklet.js');

  const node = new AudioWorkletNode(context, 'pcm-playback', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    channelCount: 1,
    channelCountMode: 'explicit',
  });

  // A gain of 1 leaves the samples untouched, but routing through a node means
  // the worklet has a real destination and is not optimised out.
  const gain = context.createGain();
  gain.gain.value = 1;
  node.connect(gain);
  gain.connect(context.destination);

  let drained: (value: boolean) => void = () => undefined;

  node.port.onmessage = (event: MessageEvent) => {
    if (event.data?.type === 'drained' || event.data?.type === 'flushed') {
      drained(true);
    }
  };

  let closed = false;

  return {
    enqueue(pcm) {
      if (closed) return;
      node.port.postMessage({ type: 'audio', buffer: pcm }, [pcm]);
    },
    flush() {
      if (closed) return;
      node.port.postMessage({ type: 'flush' });
    },
    onDrained(handler) {
      drained = handler;
    },
    close() {
      if (closed) return;
      closed = true;
      node.disconnect();
      gain.disconnect();
      void context.close();
    },
  };
}
