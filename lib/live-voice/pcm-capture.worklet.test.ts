/**
 * The capture worklet, driven with synthetic samples.
 *
 * The microphone is the only part of this file that cannot be tested, and it is
 * not the part that breaks. Framing, resampling and flushing are pure
 * arithmetic, so the worklet is loaded into a `node:vm` with a stubbed
 * `AudioWorkletProcessor` and driven directly. No `AudioContext`, no jsdom, no
 * hardware.
 *
 * This exists because of a bug that looked like a working product. The frame
 * size was never assigned, so the `outPos >= frameSamples` check compared
 * against `undefined`, always compared false, and `flush()` never ran. Not one
 * audio sample was ever posted. The session connected, `setupComplete`
 * arrived, the waveform animated and the status said "Listening" — and Gemini
 * received pure silence, so it never spoke. Every signal the UI had was
 * healthy and the thing that was broken was the only one the UI could not see.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import vm from 'node:vm';

const SOURCE = readFileSync(
  resolve(process.cwd(), 'public/pcm-capture.worklet.js'),
  'utf8',
);

interface Harness {
  /** Every `port.postMessage` the processor made, in order. */
  posted: Array<Record<string, unknown>>;
  create: (processorOptions?: Record<string, unknown>) => any;
}

function loadWorklet(contextRate = 16_000): Harness {
  const posted: Array<Record<string, unknown>> = [];
  let Ctor: new (options?: unknown) => any = class {};

  class AudioWorkletProcessorStub {
    port = {
      postMessage: (message: Record<string, unknown>) => {
        posted.push(message);
      },
      onmessage: null as ((event: { data: unknown }) => void) | null,
    };
  }

  vm.runInContext(
    SOURCE,
    vm.createContext({
      AudioWorkletProcessor: AudioWorkletProcessorStub,
      sampleRate: contextRate,
      registerProcessor: (name: string, ctor: typeof Ctor) => {
        if (name === 'pcm-capture') Ctor = ctor;
      },
      console,
    }),
  );

  return {
    posted,
    create: (processorOptions) => new Ctor({ processorOptions }),
  };
}

/** Feed `count` render quanta of a constant signal, as the audio thread would. */
function feed(node: any, count: number, value = 0.1): void {
  for (let i = 0; i < count; i += 1) {
    node.process([[new Float32Array(128).fill(value)]]);
  }
}

/** Audio frames the processor actually emitted, as Int16. */
function audioFrames(posted: Array<Record<string, unknown>>): Int16Array[] {
  return posted
    .filter((message) => message.type === 'audio')
    .map((message) => new Int16Array(message.buffer as ArrayBuffer));
}

describe('the capture worklet emits microphone audio', () => {
  it('posts frames at all', () => {
    const worklet = loadWorklet();
    const node = worklet.create({ frameSamples: 3200 });

    feed(node, 40);

    // The whole bug in one assertion. `audioFrames` was empty, so nothing was
    // ever sent and the session was silent while looking perfectly healthy.
    expect(audioFrames(worklet.posted).length).toBeGreaterThan(0);
  });

  it('emits frames of exactly the requested size, never a short one', () => {
    const worklet = loadWorklet();
    const node = worklet.create({ frameSamples: 3200 });

    feed(node, 60);

    const frames = audioFrames(worklet.posted);
    expect(frames.length).toBeGreaterThan(1);
    for (const frame of frames) {
      // A partial frame is a click at the end of every 200 ms. The resampler's
      // `- 1` guard exists for exactly this, so assert it holds.
      expect(frame.length).toBe(3200);
    }
  });

  it('converts the signal rather than posting silence', () => {
    const worklet = loadWorklet();
    const node = worklet.create({ frameSamples: 3200 });

    feed(node, 60, 0.5);

    const samples = audioFrames(worklet.posted).flatMap((frame) => Array.from(frame));
    expect(samples.length).toBeGreaterThan(0);
    expect(Math.max(...samples.map(Math.abs))).toBeGreaterThan(1000);
  });

  it('falls back to 200 ms when the caller does not say', () => {
    const worklet = loadWorklet();
    const node = worklet.create();

    feed(node, 40);

    expect(audioFrames(worklet.posted).every((frame) => frame.length === 3200)).toBe(true);
  });

  it('resamples from a 48 kHz context down to 16 kHz', () => {
    const worklet = loadWorklet(48_000);
    const node = worklet.create({ frameSamples: 3200 });

    // 3x the samples for the same wall time, so 3x the quanta to fill a frame.
    feed(node, 120);

    const frames = audioFrames(worklet.posted);
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.every((frame) => frame.length === 3200)).toBe(true);
  });

  it('stops emitting once the processor is closed', () => {
    const worklet = loadWorklet();
    const node = worklet.create({ frameSamples: 3200 });

    feed(node, 40);
    const before = audioFrames(worklet.posted).length;
    node.port.onmessage({ data: { type: 'stop' } });
    feed(node, 40);

    expect(audioFrames(worklet.posted).length).toBe(before);
  });

  it('emits silence-only frames while muted, then resumes cleanly', () => {
    const worklet = loadWorklet();
    const node = worklet.create({ frameSamples: 3200 });

    feed(node, 40);
    const before = audioFrames(worklet.posted).length;
    node.port.onmessage({ data: { type: 'mute', value: true } });
    feed(node, 40);

    // Still posting, still correctly framed — the reporter stopped talking, but
    // the server needs the stream to stay open to close the turn.
    expect(audioFrames(worklet.posted).length).toBe(before);
    expect(node.outPos).toBe(0);

    node.port.onmessage({ data: { type: 'mute', value: false } });
    feed(node, 40);
    expect(audioFrames(worklet.posted).length).toBeGreaterThan(before);
  });

  it('reports the rates it is actually running at', () => {
    const worklet = loadWorklet(44_100);
    const node = worklet.create({ frameSamples: 3200 });

    const ready = worklet.posted.find((message) => message.type === 'ready');
    expect(ready).toMatchObject({ contextRate: 44_100, targetRate: 16_000 });
  });
});
