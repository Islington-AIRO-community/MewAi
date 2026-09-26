import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ChatExperience } from './chat-experience';

export const metadata: Metadata = {
  title: 'AI Relief Assistant',
  description:
    'Talk or type to the FLARE assistant. It extracts what you need, shows you exactly what will be sent, and routes it to the right response team.',
};

/**
 * Server shell. The client experience is behind a Suspense boundary because
 * it reads search params (used for category deep links such as /chat?intent=medical).
 */
export default function ChatPage() {
  return (
    <Suspense fallback={<ChatSkeleton />}>
      <ChatExperience />
    </Suspense>
  );
}

function ChatSkeleton() {
  return (
    <div className="flex min-h-[calc(100dvh-4.25rem)] items-center justify-center">
      <div
        role="status"
        aria-live="polite"
        className="flex flex-col items-center gap-3 text-navy-500"
      >
        <span className="size-8 animate-spin rounded-full border-2 border-navy-200 border-t-navy-800" />
        <p className="text-sm font-semibold">Connecting to the relief assistant…</p>
      </div>
    </div>
  );
}
