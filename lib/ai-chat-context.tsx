'use client';

import * as React from 'react';
import { useAiChat, type AiChatApi } from '@/lib/use-ai-chat';

/**
 * The one intake per conversation.
 *
 * `useAiChat` used to be called from both `components/layout/app-shell.tsx` (for
 * the floating launcher) and `app/chat/chat-experience.tsx` (for the quick
 * phrases and the `?intent=` deep link). That was two independent intakes alive at
 * once, which is wrong in a way that is easy to miss by reading either file
 * alone:
 *
 *  - each had its own `sessionId`, so two tickets filed from one browser landed
 *    in unrelated conversations server-side;
 *  - each had its own ticket draft, so a phrase tapped in the `/chat` side rail
 *    built a *different* draft from the one the composer was filling in, and the
 *    review form showed whichever of the two happened to be mounted;
 *  - each replayed its own transcript to Gemini, so the model saw the same
 *    conversation twice from two angles.
 *
 * So the hook stays a plain hook — it is still testable and still the single
 * implementation — and this module owns the one instance for the tree.
 *
 * Throws rather than degrading when there is no provider, for the same reason
 * `useSession` and `useApp` do: a missing provider is a wiring bug, and quietly
 * handing back a second, divergent intake would hide it behind plausible-looking
 * behaviour. It is exactly the failure this module exists to prevent.
 */
const AiChatContext = React.createContext<AiChatApi | null>(null);

export function AiChatProvider({ children }: { children: React.ReactNode }) {
  const ai = useAiChat();
  return <AiChatContext.Provider value={ai}>{children}</AiChatContext.Provider>;
}

/** The conversation's single intake. Throws if mounted outside `AiChatProvider`. */
export function useAiChatInstance(): AiChatApi {
  const ctx = React.useContext(AiChatContext);
  if (!ctx) {
    throw new Error('useAiChatInstance must be used inside <AiChatProvider>');
  }
  return ctx;
}
