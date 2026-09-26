import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { DEMO_NOW } from './time';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 1206 -> "1,206" (stable, locale independent — avoids hydration drift) */
export function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

/**
 * "18 min ago".
 *
 * Defaults to the fixed demo clock rather than `new Date()`: static routes are
 * prerendered at build time, so a real clock would make the server and client
 * text disagree and trip a hydration error.
 */
export function relativeTime(iso: string, now: Date = DEMO_NOW): string {
  const then = new Date(iso).getTime();
  const diffSec = Math.round((then - now.getTime()) / 1000);
  const abs = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' });
  if (abs < 60) return rtf.format(Math.round(diffSec), 'second');
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  if (abs < 604800) return rtf.format(Math.round(diffSec / 86400), 'day');
  return rtf.format(Math.round(diffSec / 604800), 'week');
}

/** "14:32:08" 24h clock — unambiguous for responders across locales. */
export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/** "12 Oct · 14:32" */
export function shortStamp(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
  const time = d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${day} · ${time}`;
}

export function fullStamp(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/** "RPT-2026-0417" style */
export function reportCodeFromId(id: string): string {
  return `RPT-2026-${id.replace(/\D/g, '').padStart(4, '0')}`;
}

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

/** Clamp for stable SSR/CSR output of simulated telemetry. */
export function seeded(seed: number, min: number, max: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  const r = x - Math.floor(x);
  return Math.round(min + r * (max - min));
}

export function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

/** Truncate for previews without breaking words. */
export function truncate(str: string, n: number): string {
  if (str.length <= n) return str;
  return `${str.slice(0, n).replace(/\s+\S*$/, '')}…`;
}

export function isMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
}
