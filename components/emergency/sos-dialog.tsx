'use client';

import * as React from 'react';
import {
  CheckCircle2,
  Crosshair,
  Flame,
  HeartPulse,
  Loader2,
  MapPin,
  PhoneCall,
  ShieldAlert,
  Siren,
  TriangleAlert,
  User,
  X,
} from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useApp } from '@/lib/store';
import { isUsablePhone, tidyPhone } from '@/lib/ticket-intake';
import {
  fileSosTicket,
  formatPosition,
  locate,
  SITUATION_SUPPORT_LABEL_KEY,
  type FixState,
  type SituationId,
} from '@/lib/sos-ticket';
import { Eyebrow } from '@/components/ui/primitives';
import { useLocale } from '@/lib/i18n';

const SITUATIONS = [
  { id: 'medical', labelKey: 'sos.situation.medical', icon: HeartPulse, hintKey: 'sos.situation.medical.hint' },
  { id: 'danger', labelKey: 'sos.situation.danger', icon: ShieldAlert, hintKey: 'sos.situation.danger.hint' },
  { id: 'fire', labelKey: 'sos.situation.fire', icon: Flame, hintKey: 'sos.situation.fire.hint' },
  { id: 'rescue', labelKey: 'sos.situation.rescue', icon: Siren, hintKey: 'sos.situation.rescue.hint' },
] as const satisfies readonly {
  id: SituationId;
  labelKey: string;
  icon: typeof Siren;
  hintKey: string;
}[];

const COUNTDOWN_SECONDS = 3;

type Phase = 'idle' | 'countdown' | 'sending' | 'sent' | 'failed';

/**
 * The emergency dialog.
 *
 * Two things changed here that are worth reading before editing anything else.
 *
 * **It files a real ticket.** The old version slept 1.4 s, called the store's
 * in-memory `triggerSos`, and reported success; nothing reached the network.
 * It now goes through `POST /api/ai/tickets` like every other intake, and
 * `phase` only becomes `sent` once a row exists. The store's `triggerSos` is
 * gone rather than left unused: a fake that still has a caller is one refactor
 * away from being wired back up.
 *
 * **It asks for a name and a phone.** The backend requires both on every
 * ticket, and a durable row nobody can be called back on is a record rather
 * than a rescue. Rather than invent a break-glass path with weaker validation,
 * the dialog collects what the schema already demands. The countdown is gated on
 * both, with no skip, and the name is prefilled from the session so a
 * signed-in reporter types only a phone number.
 *
 * What the reporter's location is worth is stated honestly throughout. The old
 * copy claimed a fix of "+-6 m" and a unit "4 min" away on a fixed 1.4 s timer;
 * there is no dispatch or ETA system behind any of it. `situation` and the
 * coordinates are the only real inputs, and the sent state says the ticket is
 * in the queue rather than that help is on the way.
 */
export function SosDialog({
  open,
  onClose,
  onDispatched,
}: {
  open: boolean;
  onClose: () => void;
  onDispatched?: (reportId: string) => void;
}) {
  const { user, createReportFromTicket } = useApp();
  const { t } = useLocale();
  const [situation, setSituation] = React.useState<SituationId>('medical');
  const [phase, setPhase] = React.useState<Phase>('idle');
  const [remaining, setRemaining] = React.useState(COUNTDOWN_SECONDS);
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [fix, setFix] = React.useState<FixState>({ kind: 'locating' });
  const [reference, setReference] = React.useState<string | null>(null);
  const [failure, setFailure] = React.useState<string>('');
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  // The sending effect below must not re-run — and therefore must not re-send —
  // because the reader changed language mid-filing. So the translator is read
  // through a ref at the moment a message is produced, not captured in deps.
  const tRef = React.useRef(t);
  tRef.current = t;

  const clearTimer = React.useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Reset on close, and ask for a location while the reporter is still reading.
  // Requesting it on open rather than at send time means the fix has ~10 s to
  // arrive while they choose a situation, so a cold GPS does not stall the
  // countdown.
  React.useEffect(() => {
    if (!open) {
      clearTimer();
      setPhase('idle');
      setRemaining(COUNTDOWN_SECONDS);
      setReference(null);
      setFailure('');
      return;
    }
    let cancelled = false;
    void locate().then((state) => {
      if (!cancelled) setFix(state);
    });
    return () => {
      cancelled = true;
    };
  }, [open, clearTimer]);

  React.useEffect(() => () => clearTimer(), [clearTimer]);

  // Prefill from the session, but only if the reporter has not typed something.
  // An empty controlled field that fills itself in can clobber real typing on a
  // re-render, and the account name is not always the name to give a crew.
  React.useEffect(() => {
    if (open && !name && user?.name) setName(user.name);
  }, [open, name, user?.name]);

  // Typed but invalid, and only then — an empty field is not yet an error, it is
  // just the next thing to fill in.
  const nameInvalid = name.trim().length > 0 && name.trim().length < 2;
  const phoneInvalid = phone.length > 0 && !isUsablePhone(phone);
  const phoneUsable = isUsablePhone(phone);
  const canSend = name.trim().length >= 2 && phoneUsable;

  const activate = React.useCallback(() => {
    setFailure('');
    setPhase('countdown');
    setRemaining(COUNTDOWN_SECONDS);
  }, []);

  const retry = React.useCallback(() => {
    setFailure('');
    setPhase('idle');
  }, []);

  // Countdown runs only after the user explicitly arms the alert.
  React.useEffect(() => {
    if (phase !== 'countdown') return;
    timerRef.current = setInterval(() => {
      setRemaining((n) => {
        if (n <= 1) {
          clearTimer();
          setPhase('sending');
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return clearTimer;
  }, [phase, clearTimer]);

  React.useEffect(() => {
    if (phase !== 'sending') return;
    let cancelled = false;
    const run = async () => {
      try {
        const ticket = await fileSosTicket({
          situation,
          reporterName: name,
          reporterPhone: phone,
          fix,
        });
        if (cancelled) return;
        // Mirror into the in-memory report list, exactly as the assistant does,
        // so the ticket is visible on the dashboard for the rest of the session.
        // The Postgres row is the durable part; this is only the local view.
        const report = createReportFromTicket(ticket);
        setReference(ticket.id);
        setPhase('sent');
        onDispatched?.(report.id);
      } catch (error) {
        if (cancelled) return;
        // No "sent", no dispatch message, no reference. A failed emergency that
        // reports success is worse than a visible failure, so this re-arms the
        // form with everything still typed in.
        setFailure(sosErrorMessage(error, tRef.current));
        setPhase('failed');
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [phase, situation, name, phone, fix, createReportFromTicket, onDispatched]);

  const urgent = phase !== 'idle' && phase !== 'failed';
  const locked = phase !== 'idle' && phase !== 'failed';

  return (
    <Modal
      open={open}
      onClose={urgent ? () => undefined : onClose}
      hideClose={phase === 'countdown' || phase === 'sending'}
      tone="critical"
      size="md"
      title={t(`sos.title.${phase}`)}
      description={t(`sos.desc.${phase}`)}
      footer={
        phase === 'idle' ? (
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button
              variant="sos"
              size="xl"
              block
              onClick={activate}
              disabled={!canSend}
              className="text-base"
            >
              <PhoneCall aria-hidden="true" />
              {t('sos.send')}
            </Button>
            <Button variant="ghost" size="xl" block onClick={onClose}>
              {t('btn.cancel')}
            </Button>
          </div>
        ) : phase === 'countdown' ? (
          <Button variant="outline" size="xl" block onClick={onClose}>
            <X aria-hidden="true" />
            {t('sos.cancelStop')}
          </Button>
        ) : phase === 'failed' ? (
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button variant="sos" size="xl" block onClick={retry}>
              <PhoneCall aria-hidden="true" />
              {t('btn.retry')}
            </Button>
            <Button variant="ghost" size="xl" block onClick={onClose}>
              {t('btn.close')}
            </Button>
          </div>
        ) : null
      }
    >
      {phase === 'sent' ? (
        <SentState
          reference={reference}
          signedIn={Boolean(user)}
          onClose={onClose}
        />
      ) : phase === 'failed' ? (
        <FailedState message={failure} />
      ) : phase === 'sending' ? (
        <SendingState />
      ) : (
        <div className="space-y-5">
          <FixPanel fix={fix} highlight={phase === 'countdown'} />

          {/*
            Name and phone are not optional garnish. `TicketCreate` requires
            both, and a crew cannot help someone they cannot reach, so the dialog
            asks for exactly what the row needs and nothing more.
          */}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <Eyebrow as="span" className="flex items-center gap-1.5 text-navy-400">
                <User className="size-3.5" aria-hidden="true" />
                {t('sos.name')}
              </Eyebrow>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={locked}
                autoComplete="name"
                maxLength={120}
                aria-invalid={nameInvalid}
                aria-describedby={nameInvalid ? 'sos-name-error' : undefined}
                className={cn(
                  'mt-1.5 w-full rounded-xl border bg-white px-3.5 py-3 text-base text-navy-900',
                  'placeholder:text-navy-300 disabled:bg-navy-50 disabled:text-navy-400',
                  nameInvalid ? 'border-emergency-400' : 'border-navy-200',
                )}
                placeholder={t('sos.namePlaceholder')}
              />
              {nameInvalid && (
                <span id="sos-name-error" className="mt-1 block text-xs text-emergency-700">
                  {t('sos.nameError')}
                </span>
              )}
            </label>

            <label className="block">
              <Eyebrow as="span" className="flex items-center gap-1.5 text-navy-400">
                <PhoneCall className="size-3.5" aria-hidden="true" />
                {t('sos.phone')}
              </Eyebrow>
              <input
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onBlur={() => setPhone((p) => tidyPhone(p))}
                disabled={locked}
                autoComplete="tel"
                maxLength={40}
                aria-invalid={phoneInvalid}
                aria-describedby={phoneInvalid ? 'sos-phone-error' : undefined}
                className={cn(
                  'mt-1.5 w-full rounded-xl border bg-white px-3.5 py-3 text-base text-navy-900',
                  'placeholder:text-navy-300 disabled:bg-navy-50 disabled:text-navy-400',
                  phoneInvalid ? 'border-emergency-400' : 'border-navy-200',
                )}
                placeholder={t('sos.phonePlaceholder')}
              />
              {phoneInvalid && (
                <span id="sos-phone-error" className="mt-1 block text-xs text-emergency-700">
                  {t('sos.phoneError')}
                </span>
              )}
            </label>
          </div>

          <fieldset>
            <Eyebrow as="legend">{t('sos.whatHappening')}</Eyebrow>
            <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {SITUATIONS.map((s) => {
                const active = situation === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSituation(s.id)}
                    aria-pressed={active}
                    className={cn(
                      'flex min-h-[64px] items-center gap-3 rounded-xl border p-3 text-left no-tap-highlight',
                      'transition-colors duration-200',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dispatch-600 focus-visible:ring-offset-2',
                      active
                        ? 'border-emergency-400 bg-emergency-50 ring-1 ring-emergency-300'
                        : 'border-navy-200 bg-white hover:border-navy-300 hover:bg-navy-50',
                    )}
                  >
                    <span
                      className={cn(
                        'grid size-9 shrink-0 place-items-center rounded-lg ring-1 ring-inset',
                        active
                          ? 'bg-emergency-500 text-white ring-emergency-600'
                          : 'bg-navy-100 text-navy-600 ring-navy-200',
                      )}
                    >
                      <s.icon className="size-4.5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-navy-900">
                        {t(s.labelKey)}
                      </span>
                      <span className="block text-xs text-navy-500">{t(s.hintKey)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/*
            This replaced a card naming a specific unit ("Medic Alpha-2", "4 min")
            from a static lookup. There is no dispatch system and no ETA source in
            this app, so the number was a constant wearing a badge — and it was
            the most reassuring-looking lie on the screen. What is real is which
            kind of help the situation routes to.
          */}
          <p className="flex items-center gap-2 rounded-xl bg-navy-50 px-3.5 py-2.5 text-xs font-semibold text-navy-600 ring-1 ring-inset ring-navy-200">
            <Crosshair className="size-3.5 shrink-0 text-navy-400" aria-hidden="true" />
            {t('sos.routing', { support: t(SITUATION_SUPPORT_LABEL_KEY[situation]) })}
          </p>

          {phase === 'countdown' && (
            <div className="flex flex-col items-center gap-3 rounded-xl bg-emergency-600 p-5 text-white">
              <span className="text-2xs font-bold uppercase tracking-[0.14em] text-white/80">
                {t('sos.countdown.sendingIn')}
              </span>
              <span
                className="nums text-6xl font-black leading-none"
                role="timer"
                aria-live="assertive"
                aria-atomic="true"
              >
                {remaining}
              </span>
              <span className="text-sm font-semibold text-white/90">
                {t('sos.countdown.pressCancel')}
              </span>
            </div>
          )}

          <p className="text-xs leading-relaxed text-navy-500">
            {user
              ? t('sos.signedInAs', { name: user.name })
              : t('sos.notSignedIn')}
          </p>
        </div>
      )}
    </Modal>
  );
}

function FixPanel({ fix, highlight }: { fix: FixState; highlight: boolean }) {
  const { t } = useLocale();
  const ready = fix.kind === 'ready';
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-xl p-3.5 ring-1 ring-inset',
        highlight ? 'bg-emergency-50 ring-emergency-300' : 'bg-navy-50 ring-navy-200',
      )}
    >
      {fix.kind === 'locating' ? (
        <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-navy-500" aria-hidden="true" />
      ) : (
        <MapPin
          className={cn(
            'mt-0.5 size-5 shrink-0',
            ready ? (highlight ? 'text-emergency-600' : 'text-navy-500') : 'text-alert-600',
          )}
          aria-hidden="true"
        />
      )}
      <div className="min-w-0 flex-1">
        {fix.kind === 'locating' && (
          <>
            <p className="text-sm font-bold text-navy-900">{t('sos.fix.locating')}</p>
            <p className="mt-0.5 text-sm leading-relaxed text-navy-600">
              {t('sos.fix.locatingBody')}
            </p>
          </>
        )}

        {ready && (
          <>
            <p className="text-sm font-bold text-navy-900">{t('sos.fix.ready')}</p>
            <p className="nums mt-0.5 font-mono text-sm leading-relaxed text-navy-700">
              {formatPosition(fix.position)}
            </p>
            {fix.position.accuracy !== null && (
              <p className="mt-1 text-xs font-semibold text-relief-700">
                {t('sos.fix.accuracy', { m: Math.round(fix.position.accuracy) })}
              </p>
            )}
          </>
        )}

        {fix.kind === 'denied' && (
          <>
            <p className="text-sm font-bold text-navy-900">{t('sos.fix.none')}</p>
            <p className="mt-0.5 text-sm leading-relaxed text-navy-600">
              {t(fix.messageKey)} {t('sos.fix.sentWithout')}
            </p>
          </>
        )}

        {fix.kind === 'unsupported' && (
          <>
            <p className="text-sm font-bold text-navy-900">{t('sos.fix.none')}</p>
            <p className="mt-0.5 text-sm leading-relaxed text-navy-600">
              {t(fix.messageKey)}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function SendingState() {
  const { t } = useLocale();
  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      <div className="relative grid size-20 place-items-center">
        <span className="absolute inset-0 animate-pulse-ring rounded-full bg-emergency-400/40" />
        <span className="grid size-20 place-items-center rounded-full bg-emergency-50 ring-1 ring-inset ring-emergency-200">
          <Loader2 className="size-9 animate-spin text-emergency-600" aria-hidden="true" />
        </span>
      </div>
      <div>
        <p className="text-base font-bold text-navy-900">{t('sos.sending.title')}</p>
        <p className="mt-1 text-sm text-navy-500">{t('sos.sending.keepOpen')}</p>
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {t('sos.sending.sr')}
      </p>
    </div>
  );
}

function SentState({
  reference,
  signedIn,
  onClose,
}: {
  reference: string | null;
  signedIn: boolean;
  onClose: () => void;
}) {
  const { t } = useLocale();
  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-4 py-2 text-center">
        <div className="relative grid size-20 place-items-center">
          <span className="absolute inset-0 animate-pulse-ring rounded-full bg-relief-400/40" />
          <span className="grid size-20 place-items-center rounded-full bg-relief-50 ring-1 ring-inset ring-relief-200">
            <CheckCircle2 className="size-10 text-relief-600" aria-hidden="true" />
          </span>
        </div>
        <div>
          <p className="text-lg font-bold text-navy-900">{t('sos.sent.title')}</p>
          <p className="mt-1 text-sm leading-relaxed text-navy-600">{t('sos.sent.body')}</p>
        </div>
      </div>

      {reference && (
        <div className="rounded-xl bg-navy-50 p-3.5 ring-1 ring-inset ring-navy-200">
          <Eyebrow>{t('sos.sent.reference')}</Eyebrow>
          {/* The ticket id, not the report id: the ticket is the row that
              survives a refresh, and the claim flow asks for this number. */}
          <p className="nums mt-1 font-mono text-lg font-bold text-navy-900">{reference}</p>
          <p className="mt-1.5 text-xs leading-relaxed text-navy-600">
            {signedIn ? t('sos.sent.signedInNote') : t('sos.sent.anonNote')}
          </p>
        </div>
      )}

      <div className="rounded-xl bg-navy-50 p-3.5 text-sm leading-relaxed text-navy-700 ring-1 ring-inset ring-navy-200">
        <strong className="font-bold text-navy-900">{t('sos.sent.whileWaitLead')}</strong>{' '}
        {t('sos.sent.whileWait')}
      </div>

      <Button variant="outline" size="xl" block onClick={onClose}>
        {t('btn.close')}
      </Button>
    </div>
  );
}

/**
 * A filing that failed.
 *
 * Says so, keeps the details, and offers a retry. It does not show a reference,
 * because there is no row, and it does not suggest the help is already coming.
 */
function FailedState({ message }: { message: string }) {
  const { t } = useLocale();
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-emergency-300 bg-emergency-50 p-4 ring-1 ring-inset">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-emergency-700" aria-hidden="true" />
        <div>
          <p className="text-sm font-bold text-navy-900">{t('sos.failed.title')}</p>
          <p className="mt-1 text-sm leading-relaxed text-navy-700">{message}</p>
        </div>
      </div>
      <p className="text-sm leading-relaxed text-navy-600">{t('sos.failed.danger')}</p>
    </div>
  );
}

/**
 * Why the filing failed, in the reporter's terms.
 *
 * The two codes that matter are the ones that are not the reporter's fault and
 * are worth retrying: 502 means we could not reach the service at all, 503 means
 * it is up but nothing could be saved. Both keep the message's promise that what
 * they typed is still here, because it is — the form is not cleared on failure.
 */
function sosErrorMessage(error: unknown, t: (key: string) => string): string {
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? Number((error as { status: unknown }).status)
      : NaN;
  const body =
    typeof error === 'object' && error !== null && 'body' in error
      ? String((error as { body: unknown }).body)
      : '';

  if (status === 502 || body.includes('backend_unreachable')) {
    return t('sos.err.unreachable');
  }
  if (status === 503) {
    return t('sos.err.noDatabase');
  }
  if (status === 400 || status === 422) {
    return t('sos.err.rejected');
  }
  return t('sos.err.generic');
}
