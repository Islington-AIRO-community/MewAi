/**
 * Ambient types for the W3C Translation API (`window.Translator`).
 *
 * Not in TypeScript 5.6's DOM lib — the API shipped in Chrome 138 — so the
 * surface is declared once here rather than cast at every read site. Three
 * properties of it are load-bearing, and are why these types are narrow instead
 * of `any`:
 *
 * - **`availability()` is a promise, and `'unavailable'` is a normal answer**
 *   rather than an error. A browser can have the whole API and still not ship
 *   an English→Nepali model, which is a state the UI has to render honestly
 *   instead of discovering when the first sentence comes back wrong.
 * - **Progress arrives on a `monitor` handed to `create()`**, and `loaded` /
 *   `total` are `bigint` in the spec. They are `bigint | number` here so the
 *   reader is forced to coerce deliberately rather than shipping `NaN%` into
 *   a progress bar.
 * - **`translate()` resolves to the translated string.** An earlier draft of
 *   the spec returned `{ output }`. `lib/browser-translate.ts` accepts both
 *   rather than pinning one, because the alternative is a crash on a browser
 *   update — during an outage, with nobody to roll back to.
 *
 * The augmentation is on the global `Window` interface because this file has no
 * import or export, so it is a script rather than a module. The engine reads it
 * through a plain `window.Translator` optional access and treats `undefined` as
 * "this browser has no on-device translator", which is the honest reading on
 * Firefox, Safari and every Chrome build before 138.
 */

type TranslatorAvailability = 'unavailable' | 'downloadable' | 'downloading' | 'available';

interface TranslatorCreateProgressEvent extends Event {
  /** Model bytes fetched so far. `bigint` in the spec, `number` in Chrome. */
  readonly loaded: bigint | number;
  /** Total model bytes, or `0` when the browser cannot say yet. */
  readonly total: bigint | number;
}

interface TranslatorCreateMonitor {
  addEventListener(
    type: 'downloadprogress',
    listener: (event: TranslatorCreateProgressEvent) => void,
  ): void;
}

interface TranslatorCreateOptions {
  sourceLanguage: string;
  targetLanguage: string;
  monitor?: (monitor: TranslatorCreateMonitor) => void;
  signal?: AbortSignal;
}

interface TranslatorTranslateOptions {
  signal?: AbortSignal;
}

interface Translator {
  /** Resolves once the model is ready. `create()` may resolve before this. */
  readonly ready: Promise<void>;
  translate(input: string, options?: TranslatorTranslateOptions): Promise<string>;
  /** Frees the model. Without it the session leaks for the page's lifetime. */
  destroy(): void;
}

interface TranslatorConstructor {
  availability(options: {
    sourceLanguage: string;
    targetLanguage: string;
  }): Promise<TranslatorAvailability>;
  create(options: TranslatorCreateOptions): Promise<Translator>;
}

interface Window {
  Translator?: TranslatorConstructor;
}
