import type {
  CategoryId,
  Department,
  Priority,
  SupportType,
  SupportTypeMeta,
} from '@/lib/types';
import {
  CATEGORIES,
  SUPPORT_ROUTING,
  SUPPORT_TYPES,
  departmentsForSupportTypes,
  routeForSupportTypes,
} from '@/lib/types';
import type { SlotName, TicketDraft } from '@/lib/ai-client';

/**
 * The ticket intake contract, mirrored on the client.
 *
 * Every function here has a counterpart in `ai-backend/app/slots.py`, and they
 * are deliberately kept identical. The backend is authoritative — it refuses to
 * write a row that does not satisfy these rules — but the client has to know
 * what is still missing *while the user is typing*, and duplicating a dozen
 * lines of predicate is far cheaper than a round trip per keystroke.
 *
 * If you change one, change both.
 */

/** Mirrors `ALWAYS_REQUIRED` in `ai-backend/app/slots.py`. */
export const ALWAYS_REQUIRED: SlotName[] = [
  'reporterName',
  'reporterPhone',
  'summary',
  'location',
  'supportNeeded',
  'urgency',
];

/** Mirrors `ON_BEHALF_REQUIRED` — only when a relative files for someone else. */
export const ON_BEHALF_REQUIRED: SlotName[] = ['victimName', 'victimPhone'];

/** Never blocks submission, but is worth asking for. */
export const OPTIONAL_SLOTS: SlotName[] = ['peopleAffected'];

export const SLOT_ORDER: SlotName[] = [
  ...ALWAYS_REQUIRED,
  ...ON_BEHALF_REQUIRED,
  ...OPTIONAL_SLOTS,
];

const MIN_PHONE_DIGITS = 6;

export const SLOT_LABELS: Record<SlotName, string> = {
  reporterName: 'Your name',
  reporterPhone: 'Your contact number',
  victimName: 'Person who needs help — name',
  victimPhone: 'Person who needs help — number',
  summary: 'What is happening',
  location: 'Where they are',
  supportNeeded: 'Support needed',
  urgency: 'How urgent',
  peopleAffected: 'How many people',
};

const SLOT_HINTS: Record<SlotName, string> = {
  reporterName: 'So a responder knows who to come back to.',
  reporterPhone: 'A number a responder can actually dial.',
  victimName: 'Only needed when you are reporting for someone else.',
  victimPhone: 'Their number, if they have one. Different from yours.',
  summary: 'A couple of sentences is plenty.',
  location: 'Street, building, floor, and anything that stands out.',
  supportNeeded: 'Pick every kind of help that applies.',
  urgency: 'Critical means someone is in danger right now.',
  peopleAffected: 'Optional, but it helps us send the right amount.',
};

export function slotHint(slot: SlotName): string {
  return SLOT_HINTS[slot];
}

/** Mirrors `is_usable_phone`. */
export function isUsablePhone(value: string): boolean {
  let digits = 0;
  for (const ch of value) if (ch >= '0' && ch <= '9') digits += 1;
  return digits >= MIN_PHONE_DIGITS;
}

/** Mirrors `normalisePhone`. */
export function tidyPhone(value: string): string {
  return value.replace(/[^\d+-]/g, '').replace(/-{2,}/g, '-');
}

function valueFor(draft: TicketDraft, slot: SlotName): string {
  switch (slot) {
    case 'reporterName':
      return draft.reporter_name;
    case 'reporterPhone':
      return draft.reporter_phone;
    case 'victimName':
      return draft.victim_name;
    case 'victimPhone':
      return draft.victim_phone;
    case 'summary':
      return draft.summary;
    case 'location':
      return draft.location;
    case 'peopleAffected':
      return draft.people_affected;
    case 'supportNeeded':
      return draft.support_needed.join(',');
    case 'urgency':
      return draft.urgency ?? '';
    default:
      return '';
  }
}

/** Mirrors `required_slots`. */
export function requiredSlots(draft: TicketDraft): SlotName[] {
  return draft.on_behalf_of_other
    ? [...ALWAYS_REQUIRED, ...ON_BEHALF_REQUIRED]
    : [...ALWAYS_REQUIRED];
}

/** Mirrors `missing_slots`. */
export function missingSlots(draft: TicketDraft): SlotName[] {
  return requiredSlots(draft).filter((slot) => {
    const value = valueFor(draft, slot).trim();
    if (!value) return true;
    if (slot === 'reporterPhone' || slot === 'victimPhone') {
      return !isUsablePhone(value);
    }
    return false;
  });
}

export function isDraftComplete(draft: TicketDraft): boolean {
  return missingSlots(draft).length === 0;
}

/**
 * Parse `peopleAffected` from free text.
 *
 * The AI writes this as a string because people say "the two of us" or "about
 * twelve", so the model is allowed to hand back prose and the form is allowed
 * to show prose. A strict integer is only extracted when one is actually there.
 */
export function parsePeopleAffected(value: string): number | null {
  const digits = value.replace(/[^\d]/g, '');
  if (!digits) return null;
  const parsed = Number.parseInt(digits, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/** `['rescue','medical']` -> the report category that leads the response. */
export function draftCategory(draft: TicketDraft) {
  return routeForSupportTypes(draft.support_needed);
}

export function draftUrgency(draft: TicketDraft): Priority {
  return draft.urgency ?? 'medium';
}

/**
 * Every support type on a ticket, as `{ type, category, department }`.
 *
 * A ticket can span several — someone who is injured and has nowhere to sleep
 * goes to EMS and to shelter at the same time — so the review form shows the
 * full routing, not just the primary.
 */
export function draftRouting(
  draft: TicketDraft,
): { type: SupportType; category: CategoryId; department: Department }[] {
  return departmentsForSupportTypes(draft.support_needed).map((department) => {
    const type = draft.support_needed.find(
      (candidate) => SUPPORT_ROUTING[candidate].departmentId === department.id,
    ) as SupportType;
    return { type, category: SUPPORT_ROUTING[type].category, department };
  });
}

export function supportMeta(type: SupportType): SupportTypeMeta {
  return SUPPORT_TYPES[type];
}

/** Short label for the report this ticket becomes, e.g. "Medical Emergency". */
export function categoryLabel(draft: TicketDraft): string {
  return CATEGORIES[draftCategory(draft).category].label;
}
