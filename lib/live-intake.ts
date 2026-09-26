/**
 * What the voice agent is told, and how its calls map onto a ticket draft.
 *
 * Two things live here rather than in `live-client.ts`, and both are deliberate:
 *
 *  - **The prompt.** The system instruction is server-built text, and it wants
 *    to be reviewed as prose next to the text intake's prompt in
 *    `ai-backend/app/prompts.py` — not buried in a transport file.
 *  - **The mapper.** `record_intake` returns field names, and the draft uses
 *    different ones. That translation is a pure function, so it can be read and
 *    argued about without a socket or a microphone in the picture.
 *
 * ## Readiness is not the model's call
 *
 * `finish_intake` exists because a conversational agent needs a way to say
 * "that is everything", and it gets a tool rather than being asked to infer
 * completion from a `text` field. But the caller does **not** act on it
 * directly: it checks `missingSlots` first. The model can say it is done early,
 * and the review form does not open until the required slots are actually
 * filled. `lib/ticket-intake.ts` stays the authority, exactly as
 * `ai-backend/app/slots.py` is for the text path.
 */

import type { SupportType } from './types';
import type { TicketDraft } from './ai-client';
import type { IntakeExtraction } from './live-client';

export const SUPPORT_TYPE_VALUES: SupportType[] = [
  'rescue',
  'relief-supplies',
  'medical',
  'security',
];

const URGENCY_VALUES = ['critical', 'high', 'medium', 'low'] as const;

/**
 * The voice agent's instructions.
 *
 * `Same language you hear` is the load-bearing line. The model has no
 * `languageCode` setting, and the reporter may switch between Nepali and English
 * mid-sentence, so the only reliable instruction is to mirror whatever it just
 * heard. Verified working: given Nepali input it extracted facts that existed
 * only in the Nepali half, and replied in Devanagari Nepali.
 *
 * The slot list deliberately names the same fields as the text intake prompt so
 * a person who starts by typing and switches to voice, or the reverse, is not
 * filling in two different forms.
 */
export const VOICE_SYSTEM_INSTRUCTION = `You are the voice line for FLARE, an emergency
relief service. You are speaking with someone who needs help right now, so you are
practical, calm, and brief.

LANGUAGE — the most important rule:
Reply in the same language the person speaks to you. If they use Nepali, reply in
Nepali. If they switch languages mid-conversation, switch with them. Never
translate their words back to them in a language they did not choose.

HOW TO SOUND:
Keep each turn to one or two short sentences plus your next question. Speak
numbers, times and places slowly, and repeat a phone number back once to confirm
it. You are on a phone line during an emergency: no preamble, no "I understand
how you feel", no lists.

COLLECTING DETAILS:
Record what you learn as you go by calling record_intake. Record a fact as soon
as you hear it — do not wait for the end of the conversation. An empty field
means "not captured yet", so never send a value you guessed or invented. If you
are unsure about a number, ask rather than assume.

You need: their name, a phone number you can call them back on, what is
happening, where they are, what kind of help they need, and how urgent it is.
Only if they are reporting for someone else do you also need that person's name
and number. How many people are affected is worth asking about but is never
required.

WHEN SOMEONE IS IN DANGER NOW — someone who cannot move, is trapped, is
unconscious, is bleeding heavily, or is in rising water above their knees — treat
it as critical urgency and say so plainly. Do not soften it and do not bury it.

You have no information about rescue teams, crews, or arrival times. You do not
dispatch anyone and you cannot promise that help is coming. If asked, say the
details have been passed to the response team and you do not have their timing.
Never invent an ETA.

WHEN YOU HAVE EVERYTHING:
Call finish_intake once the details are complete, and the person will see them
written out to check before anything is sent.`;

/**
 * The function declarations sent in `setup.tools`.
 *
 * Every field is optional on purpose: a partial patch is the whole model. A
 * required field would make the model fill in a placeholder for a slot the
 * reporter has not mentioned yet, which is worse than leaving it unset.
 */
export const INTAKE_TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'record_intake',
        description:
          'Record details about the emergency as you learn them. Send a partial patch: ' +
          'omit anything the person has not told you yet. Call this as soon as you learn ' +
          'a fact rather than waiting until the end.',
        parameters: {
          type: 'OBJECT',
          properties: {
            reporter_name: { type: 'STRING', description: 'The name of the person speaking.' },
            reporter_phone: {
              type: 'STRING',
              description: 'A phone number the reporter can be called back on.',
            },
            victim_name: {
              type: 'STRING',
              description: 'The person needing help, when it is not the reporter.',
            },
            victim_phone: {
              type: 'STRING',
              description: 'That other person\'s number, if they have one.',
            },
            summary: { type: 'STRING', description: 'What is happening, plainly.' },
            location: {
              type: 'STRING',
              description: 'Where they are: street, building, floor, anything that stands out.',
            },
            people_affected: { type: 'STRING', description: 'How many people need help.' },
            support_needed: {
              type: 'ARRAY',
              description: 'Every kind of help that applies. May be more than one.',
              items: { type: 'STRING', enum: SUPPORT_TYPE_VALUES },
            },
            urgency: {
              type: 'STRING',
              description:
                'critical means someone is in danger right now. high means urgent but stable.',
              enum: URGENCY_VALUES,
            },
            on_behalf_of_other: {
              type: 'BOOLEAN',
              description: 'True when reporting for someone who cannot report for themselves.',
            },
          },
        },
      },
      {
        name: 'finish_intake',
        description:
          'Call once every required detail has been collected. The person reviews what ' +
          'was written before anything is sent, so this does not submit anything by itself.',
        parameters: { type: 'OBJECT', properties: {} },
      },
    ],
  },
];

/**
 * Map a `record_intake` payload onto a partial `TicketDraft`.
 *
 * A patch rather than a merge: the caller decides how to apply it. What lives
 * here is the *validation*, which is the part worth testing — a model can return
 * a support type that does not exist, an urgency outside the enum, or an empty
 * string for a field it has no value for, and none of that should reach the
 * draft as a value.
 *
 * Empty strings are dropped rather than stored, because "not captured" and
 * "captured as nothing" have to stay distinguishable: `missingSlots` treats a
 * blank as missing, and a blank that got written back as `''` after the
 * reporter had filled it in would silently clear a real answer.
 */
export function extractionToDraft(args: IntakeExtraction): Partial<TicketDraft> {
  const patch: Partial<TicketDraft> = {};

  const text = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  };

  const name = text(args.reporter_name);
  if (name !== undefined) patch.reporter_name = name;

  const phone = text(args.reporter_phone);
  if (phone !== undefined) patch.reporter_phone = phone;

  const victimName = text(args.victim_name);
  if (victimName !== undefined) patch.victim_name = victimName;

  const victimPhone = text(args.victim_phone);
  if (victimPhone !== undefined) patch.victim_phone = victimPhone;

  const summary = text(args.summary);
  if (summary !== undefined) patch.summary = summary;

  const location = text(args.location);
  if (location !== undefined) patch.location = location;

  const people = text(args.people_affected);
  if (people !== undefined) patch.people_affected = people;

  if (Array.isArray(args.support_needed)) {
    // Filtered rather than trusted. An unknown value would reach `routeForSupportTypes`
    // and index a taxonomy that has no such key, which throws during render.
    const support = SUPPORT_TYPE_VALUES.filter((type) => args.support_needed?.includes(type));
    if (support.length) patch.support_needed = support;
  }

  if (typeof args.urgency === 'string' && URGENCY_VALUES.includes(args.urgency as never)) {
    patch.urgency = args.urgency;
  }

  if (typeof args.on_behalf_of_other === 'boolean') {
    patch.on_behalf_of_other = args.on_behalf_of_other;
  }

  return patch;
}
