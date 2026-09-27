/**
 * Microphone capture -> raw PCM16 LE mono @ 16 kHz, as Gemini's Live API
 * requires. One 128-frame quantum in, one 3200-sample (200 ms) chunk out.
 *
 * ## Why a worklet and not `MediaRecorder`
 *
 * The Live API wants PCM, not a compressed container: there is no decoder for
 * `audio/webm` on the other end. `MediaRecorder` only produces containers, and
 * the only way to get bytes out of it is a `Blob` + a full decode, which is
 * both slower and further from the microphone in time. An `AudioWorklet` gets
 * the samples as they are captured.
 *
 * It also runs off the main thread, so a long session cannot stutter the UI.
 *
 * ## Why resampling happens here
 *
 * The browser resamples the microphone to whatever rate the `AudioContext` was
 * built with, and it will silently ignore the request if it does not like the
 * number. So rather than trusting `sampleRate`, this processor resamples from
 * the actual context rate down to 16 kHz itself. Linear interpolation is
 * adequate: it is running on speech that has already been through the
 * browser's own resampler, and this stage is not what determines fidelity.
 *
 * ## The microphone never stops
 *
 * This processor does not decide when a turn ends — the server's voice
 * activity detection does, and it is signalled by `ACTIVITY_END` on the
 * socket. Capturing silence continuously is not waste, it is required: if the
 * stream goes quiet before the server closes the turn, the turn stays open and
 * the next thing the reporter says is treated as a continuation rather than a
 * new turn. `mute` exists for a user who explicitly stops talking, not for
 * turn boundaries.
 */

const TARGET_RATE = 16000;
const FRAME_SAMPLES = 3200; // 200 ms at 16 kHz

class Growable {
  constructor(capacity) {
    this.data = new Float32Array(capacity);
    this.length = 0;
  }

  push(chunk) {
    if (this.length + chunk.length > this.data.length) {
      let capacity = this.data.length * 2;
      while (capacity < this.length + chunk.length) capacity *= 2;
      const next = new Float32Array(capacity);
      next.set(this.data.subarray(0, this.length));
      this.data = next;
    }
    this.data.set(chunk, this.length);
    this.length += chunk.length;
  }

  /** Drop everything before `from`, so the buffer cannot creep upward. */
  discardBefore(from) {
    if (from <= 0) return;
    this.data.copyWithin(0, from, this.length);
    this.length -= from;
  }
}

class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = options?.processorOptions ?? {};

    // The caller owns the frame size, so the capture side and the socket side
    // cannot disagree about it. This line used to be missing: `opts` was parsed
    // and then never read, so `this.frameSamples` stayed `undefined` and the
    // `outPos >= this.frameSamples` test below compared against `undefined` —
    // always false. `flush()` therefore never ran, no audio was ever posted, and
    // the microphone sent Gemini nothing at all. The symptom was a session that
    // looked perfect: connected, `setupComplete`, a live waveform, and total
    // silence, because voice activity detection had nothing to detect.
    this.frameSamples = opts.frameSamples > 0 ? opts.frameSamples : FRAME_SAMPLES;

    this.ratio = sampleRate / TARGET_RATE;
    this.pending = new Growable(8192);
    this.readPos = 0;
    this.out = new Int16Array(this.frameSamples);
    this.outPos = 0;
    this.muted = false;
    this.closed = false;

    this.port.onmessage = (event) => {
      const message = event.data;
      if (!message) return;
      if (message.type === 'mute') {
        this.muted = !!message.value;
        // Discard the buffered audio too, or stopping for a moment would
        // replay it a moment later.
        //
        // Both buffers have to go. Clearing only `pending` left the partly
        // filled output frame intact, so up to 200 ms of speech from before the
        // mute sat in `out` until the reporter spoke again and was then posted
        // as the first frame of the resumed stream — the exact replay the line
        // above exists to prevent, and inaudible only because it is short.
        if (this.muted) {
          this.pending.length = 0;
          this.readPos = 0;
          this.outPos = 0;
        }
      } else if (message.type === 'stop') {
        this.closed = true;
      }
    };

    this.port.postMessage({ type: 'ready', contextRate: sampleRate, targetRate: TARGET_RATE });
  }

  process(inputs) {
    if (this.closed) return false;

    const input = inputs[0];
    const channel = input && input[0];
    if (channel && channel.length && !this.muted) {
      this.pending.push(channel);
    }

    // Resample while a full input pair remains. The `- 1` is deliberate: linear
    // interpolation needs the sample after the cursor, and emitting a value
    // built from a zeroed tail would put a click at the end of every buffer.
    while (Math.floor(this.readPos) + 1 < this.pending.length) {
      const index = this.readPos | 0;
      const fraction = this.readPos - index;
      const a = this.pending.data[index];
      const b = this.pending.data[index + 1];
      const value = a + (b - a) * fraction;
      this.readPos += this.ratio;

      const scaled = value < 0 ? value * 0x5b6 : value * 0x7bff;
      const clamped = scaled < -32768 ? -32768 : scaled > 32767 ? 32767 : scaled;
      this.out[this.outPos++] = clamped | 0;

      if (this.outPos >= this.frameSamples) this.flush();
    }

    // Keep the consumed head from growing without bound.
    const consumed = this.readPos | 0;
    if (consumed > 4096) {
      this.pending.discardBefore(consumed);
      this.readPos -= consumed;
    }

    return true;
  }

  flush() {
    if (this.outPos === 0) return;
    const frame = this.out.slice(0, this.outPos);
    this.outPos = 0;
    this.port.postMessage({ type: 'audio', buffer: frame.buffer }, [frame.buffer]);
  }
}

registerProcessor('pcm-capture', PcmCaptureProcessor);
