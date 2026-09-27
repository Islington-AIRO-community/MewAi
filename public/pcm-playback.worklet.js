/**
 * Playback: raw PCM16 LE mono @ 24 kHz (Gemini's Live output rate) -> speakers.
 *
 * ## Why a worklet and not `AudioBufferSourceNode`
 *
 * Live audio arrives in fragments with no known total length, so there is
 * nothing to schedule and nothing to `start()` at a known offset. A worklet
 * with a ring buffer takes bytes as they land.
 *
 * ## Interruption is the whole design constraint
 *
 * The reporter can start speaking over the assistant. When that happens the
 * server sends `interrupted: true` and the browser is expected to stop talking
 * *immediately* — a delayed cut-off is worse than silence, because the
 * reporter already started their sentence and is now being talked over by the
 * stale audio that was queued before they did.
 *
 * So `flush` has to discard every queued sample, not fade them. A ring buffer
 * makes that a two-line operation; a chain of scheduled buffers would make it
 * error-prone, because there is no "cancel all scheduled nodes" primitive.
 */

const RING_CAPACITY = 32768; // ~1.36 s at 24 kHz

class Ring {
  constructor(capacity) {
    this.data = new Float32Array(capacity);
    this.head = 0;
    this.tail = 0;
  }

  get size() {
    return this.tail >= this.head
      ? this.tail - this.head
      : this.data.length - this.head + this.tail;
  }

  push(source) {
    if (this.size + source.length > this.data.length) {
      // Full and not draining means the socket outran the speaker. Keeping the
      // newest audio is the better failure: stale speech is worth less than the
      // sentence being spoken right now.
      this.dropOldest(source.length);
    }
    for (let i = 0; i < source.length; i += 1) {
      this.data[this.tail] = source[i];
      this.tail = (this.tail + 1) % this.data.length;
    }
  }

  dropOldest(count) {
    const keep = Math.max(0, this.size - count);
    this.head = (this.head + keep) % this.data.length;
  }

  pull(out, count) {
    for (let i = 0; i < count; i += 1) {
      if (this.size === 0) {
        out[i] = 0;
        continue;
      }
      out[i] = this.data[this.head];
      this.head = (this.head + 1) % this.data.length;
    }
  }

  clear() {
    this.head = 0;
    this.tail = 0;
  }
}

class PcmPlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ring = new Ring(RING_CAPACITY);
    this.peak = 0;
    this.reportedDrained = true;

    this.port.onmessage = (event) => {
      const message = event.data;
      if (!message) return;

      if (message.type === 'audio') {
        const pcm = new Int16Array(message.buffer);
        const floats = new Float32Array(pcm.length);
        for (let i = 0; i < pcm.length; i += 1) {
          const value = pcm[i] / 32768;
          floats[i] = value;
          const magnitude = value < 0 ? -value : value;
          if (magnitude > this.peak) this.peak = magnitude;
        }
        this.ring.push(floats);
        this.reportedDrained = false;
        return;
      }

      if (message.type === 'flush') {
        this.ring.clear();
        this.peak = 0;
        this.reportedDrained = true;
        this.port.postMessage({ type: 'flushed' });
        return;
      }

      if (message.type === 'level') {
        this.port.postMessage({ type: 'level', peak: this.peak });
        this.peak = 0;
      }
    };
  }

  process(_inputs, outputs) {
    const out = outputs[0][0];
    if (!out) return true;

    this.ring.pull(out, out.length);

    // The UI needs to know when the assistant has stopped talking, which is a
    // different question from "did a turn end" — the socket says the turn ended
    // as soon as the text is complete, but audio is still buffered here.
    if (this.ring.size === 0 && !this.reportedDrained) {
      this.reportedDrained = true;
      this.port.postMessage({ type: 'drained' });
    }

    return true;
  }
}

registerProcessor('pcm-playback', PcmPlaybackProcessor);
