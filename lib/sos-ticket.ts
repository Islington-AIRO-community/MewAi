'use client';

import { createTicket, type CreateTicketInput, type StoredTicket } from '@/lib/ai-client';
import type { SupportType } from '@/lib/types';

/**
 * Filing an emergency as a real ticket.
 *
 * This replaces a fake: the dialog used to wait 1.4 s, call the store's
 * in-memory `triggerSos`, and announce that two units were already moving to
 * the reporter's location. Nothing was transmitted, nothing was stored, and the
 * dispatch timeline it drew was invented. On a screen reached by someone who
 * thinks they are being rescued, that is the single worst output this app could
 * produce — the same reason `AGENTS.md` forbids faking a model reply silently.
 *
 * So SOS files the same ticket the assistant does, through the same proxy, and
 * the dialog only says "sent" once Postgres has a row. Three consequences worth
 * keeping:
 *
 *  - There is no new endpoint and no schema change. SOS is a *source*, and
 *    `source` is already a column. A break-glass endpoint would be a second
 *    intake path with weaker validation than `TicketCreate`, which is precisely
 *    the thing that must not be relaxed for emergencies.
 *  - `urgency` is forced to `critical` rather than asked for. An emergency
 *    button that lets you pick "low" is a triage tool with a misleading label.
 *  - The ticket needs both a name and a phone, so the dialog collects both. That
 *    is friction, and it is the point: a durable row with nobody to call is not
 *    a rescue, it is a record. Everything else in this flow is one tap.
 */

export type SituationId = 'medical' | 'danger' | 'fire' | 'rescue';

/**
 * Which intake vocabulary each situation lands in.
 *
 * `SupportType` is the AI's 4-value classification, not the dashboard's
 * 8-value `CategoryId`. "Immediate danger" becomes `security` rather than a new
 * class, so an SOS joins the same queue and the same routing as everything else.
 * `fire` and `rescue` both route to `rescue`; that is a judgement about which
 * crew must arrive first, and `routeForSupportTypes` ranks it above relief.
 */
export const SITUATION_SUPPORT: Record<SituationId, SupportType> = {
  medical: 'medical',
  danger: 'security',
  fire: 'rescue',
  rescue: 'rescue',
};

export const SITUATION_LABEL: Record<SituationId, string> = {
  medical: 'Medical emergency',
  danger: 'Immediate danger',
  fire: 'Fire or hazard',
  rescue: 'Need rescue',
};

/** Shown in the dialog while filing, so the reporter can see what is being sent. */
export const SITUATION_SUPPORT_LABEL: Record<SituationId, string> = {
  medical: 'medical help',
  danger: 'security help',
  fire: 'rescue',
  rescue: 'rescue',
};

export interface SosPosition {
  lat: number;
  lng: number;
  /** Metres, from the browser. Used only to tell a responder how much to trust it. */
  accuracy: number | null;
}

export type FixState =
  | { kind: 'locating' }
  | { kind: 'ready'; position: SosPosition }
  | { kind: 'denied'; message: string }
  | { kind: 'unsupported'; message: string };

/**
 * A location that will still be filed when the device cannot produce one.
 *
 * `location` is `min_length=1` and the ticket must be filed, so the fallback is
 * text rather than a refusal — but it is text that says the truth. A responder
 * reading "Location unavailable" knows to phone the reporter; one reading
 * "40.7581, -74.0013" would drive a crew to the middle of Manhattan, which is
 * what the old hardcoded value did on every device on earth.
 */
export const NO_FIX = 'Location unavailable — this device did not share a position';

const GEOLOCATION_TIMEOUT_MS = 10_000;

/**
 * One attempt at a real fix.
 *
 * Resolves to a `FixState` rather than rejecting: a denied permission and a
 * timeout are both ordinary outcomes on a phone during a disaster, and the
 * caller has to render them differently from an exception it should never see.
 * `enableHighAccuracy` because the difference between a crew at the right
 * building and the right street matters, and `maximumAge: 0` because a fix
 * cached from before the flood is worse than no fix at all.
 */
export function locate(): Promise<FixState> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve({
        kind: 'unsupported',
        message: 'This browser cannot share a location. Your phone number is what we will use.',
      });
      return;
    }

    let settled = false;
    const finish = (state: FixState) => {
      if (settled) return;
      settled = true;
      resolve(state);
    };

    const timer = window.setTimeout(() => {
      finish({
        kind: 'denied',
        message: 'The location request timed out. Your phone number is what we will use.',
      });
    }, GEOLOCATION_TIMEOUT_MS);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        window.clearTimeout(timer);
        finish({
          kind: 'ready',
          position: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            // Phones report accuracy as null rather than 0 in some browsers.
            accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
          },
        });
      },
      (err) => {
        window.clearTimeout(timer);
        finish({
          kind: 'denied',
          message:
            err.code === err.PERMISSION_DENIED
              ? 'Location access is off. Your phone number is what we will use.'
              : 'Could not get a location fix. Your phone number is what we will use.',
        });
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: GEOLOCATION_TIMEOUT_MS },
    );
  });
}

/**
 * Coordinates as a responder can act on.
 *
 * Five decimal places is roughly a metre, which is as precise as a phone fix
 * deserves; six invites someone to read significance into the last digit.
 */
export function formatPosition(position: SosPosition): string {
  return `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`;
}

export function fileSosTicket(input: {
  situation: SituationId;
  reporterName: string;
  reporterPhone: string;
  fix: FixState;
}): Promise<StoredTicket> {
  const { situation, reporterName, reporterPhone, fix } = input;
  const position = fix.kind === 'ready' ? fix.position : null;
  const support = SITUATION_SUPPORT[situation];
  const label = SITUATION_LABEL[situation];

  const body: CreateTicketInput = {
    reporter_name: reporterName.trim(),
    reporter_phone: reporterPhone.trim(),
    // SOS is always self-reported. A "reporting for someone else" path here
    // would mean asking who the victim is in the first two minutes of an
    // emergency, and the claim flow already handles the cases that matter.
    victim_name: '',
    victim_phone: '',
    on_behalf_of_other: false,
    summary:
      `Emergency SOS raised on the app: ${label}. ` +
      'The reporter is the person affected and asked for help with the above.',
    location: position ? formatPosition(position) : NO_FIX,
    people_affected: null,
    support_needed: [support],
    urgency: 'critical',
    notes: position
      ? position.accuracy === null
        ? 'Raised from the SOS button. Location shared by the device.'
        : `Raised from the SOS button. Location accuracy about ${Math.round(
            position.accuracy,
          )} m.`
      : `Raised from the SOS button. ${NO_FIX}. Call the reporter for the address.`,
    // `source` marks this for the response team, and is what tells an operator
    // this row did not come through the intake conversation. The field is
    // `max_length=32` and 'sos' is well inside it.
    session_id: '',
  };

  body.source = 'sos';

  // `createTicket` throws `AiRequestError` on a non-2xx, which is what the
  // dialog's failure state reads. Deliberately not caught here: a filing that
  // failed must not be reported as filed, and the only place that knows which
  // it is allowed to say so is the code that made the call.
  return createTicket(body);
}
