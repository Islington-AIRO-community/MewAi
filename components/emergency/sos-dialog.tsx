'use client';

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Ambulance,
  CheckCircle2,
  Crosshair,
  Flame,
  HeartPulse,
  Loader2,
  MapPin,
  PhoneCall,
  Radio,
  ShieldAlert,
  Siren,
  X,
} from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useApp } from '@/lib/store';
import { getDepartment } from '@/lib/types';

const SITUATIONS = [
  { id: 'medical', label: 'Medical emergency', icon: HeartPulse, hint: 'Injury or illness' },
  { id: 'danger', label: 'Immediate danger', icon: ShieldAlert, hint: 'Threat to life' },
  { id: 'fire', label: 'Fire or hazard', icon: Flame, hint: 'Smoke, gas, collapse' },
  { id: 'rescue', label: 'Need rescue', icon: Siren, hint: 'Trapped or stranded' },
] as const;

type SituationId = (typeof SITUATIONS)[number]['id'];

const COUNTDOWN_SECONDS = 3;

export function SosDialog({
  open,
  onClose,
  onDispatched,
}: {
  open: boolean;
  onClose: () => void;
  onDispatched?: (reportId: string) => void;
}) {
  const { triggerSos, user } = useApp();
  const [situation, setSituation] = React.useState<SituationId>('medical');
  const [phase, setPhase] = React.useState<'idle' | 'countdown' | 'sending' | 'sent'>('idle');
  const [remaining, setRemaining] = React.useState(COUNTDOWN_SECONDS);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = React.useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  React.useEffect(() => {
    if (!open) {
      clearTimer();
      setPhase('idle');
      setRemaining(COUNTDOWN_SECONDS);
    }
  }, [open, clearTimer]);

  React.useEffect(() => () => clearTimer(), [clearTimer]);

  const activate = React.useCallback(() => {
    setPhase('countdown');
    setRemaining(COUNTDOWN_SECONDS);
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
      await new Promise((r) => setTimeout(r, 1400));
      if (cancelled) return;
      const label = SITUATIONS.find((s) => s.id === situation)?.label ?? 'Emergency';
      const report = triggerSos({
        label,
        lat: 40.7581,
        lng: -74.0013,
      });
      setPhase('sent');
      onDispatched?.(report.id);
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [phase, situation, triggerSos, onDispatched]);

  const department = getDepartment('dept-medical');
  const urgent = phase !== 'idle';

  return (
    <Modal
      open={open}
      onClose={urgent ? () => undefined : onClose}
      hideClose={phase === 'countdown'}
      tone="critical"
      size="md"
      title={
        phase === 'sent'
          ? 'Help is on the way'
          : phase === 'sending'
            ? 'Sending your alert…'
            : phase === 'countdown'
              ? 'Cancel to stop the alert'
              : 'Emergency SOS'
      }
      description={
        phase === 'sent'
          ? 'Nearest units have your live location. Stay on the line if you can.'
          : phase === 'sending'
            ? 'Sharing your location and the emergency type with the nearest crew.'
            : phase === 'countdown'
              ? 'Your location will be shared with the nearest response crew.'
              : 'One tap alerts the nearest crew with your live location. No typing needed.'
      }
      footer={
        phase === 'idle' ? (
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button
              variant="sos"
              size="xl"
              block
              onClick={activate}
              className="text-base"
            >
              <PhoneCall aria-hidden="true" />
              Send emergency alert
            </Button>
            <Button variant="ghost" size="xl" block onClick={onClose}>
              Cancel
            </Button>
          </div>
        ) : phase === 'countdown' ? (
          <Button variant="outline" size="xl" block onClick={onClose}>
            <X aria-hidden="true" />
            Cancel — stop the alert
          </Button>
        ) : null
      }
    >
      {phase === 'sent' ? (
        <SentState />
      ) : phase === 'sending' ? (
        <SendingState />
      ) : (
        <div className="space-y-5">
          <div
            className={cn(
              'flex items-start gap-3 rounded-xl p-3.5 ring-1 ring-inset',
              phase === 'countdown'
                ? 'bg-emergency-50 ring-emergency-300'
                : 'bg-navy-50 ring-navy-200',
            )}
          >
            <MapPin
              className={cn(
                'mt-0.5 size-5 shrink-0',
                phase === 'countdown' ? 'text-emergency-600' : 'text-navy-500',
              )}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-navy-900">Live location ready</p>
              <p className="mt-0.5 text-sm leading-relaxed text-navy-600">
                Northbank Region · Lock 4 canal path, Ward 6
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-relief-700">
                <Crosshair className="size-3.5" aria-hidden="true" />
                GPS accuracy ±6 m
              </p>
            </div>
          </div>

          <fieldset>
            <legend className="text-2xs font-bold uppercase tracking-[0.08em] text-navy-400">
              What is happening?
            </legend>
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
                      <span className="block text-sm font-bold text-navy-900">{s.label}</span>
                      <span className="block text-xs text-navy-500">{s.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="rounded-xl border border-navy-200 bg-white p-3.5">
            <p className="text-2xs font-bold uppercase tracking-[0.08em] text-navy-400">
              Nearest responding unit
            </p>
            <div className="mt-2 flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-emergency-50 text-emergency-700 ring-1 ring-inset ring-emergency-200">
                <Ambulance className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-navy-900">
                  {department.name}
                </p>
                <p className="truncate text-xs text-navy-500">
                  Medic Alpha-2 · avg response {department.avgResponseMinutes} min
                </p>
              </div>
              <Badge tone="alert" size="sm">
                4 min
              </Badge>
            </div>
          </div>

          {phase === 'countdown' && (
            <div className="flex flex-col items-center gap-3 rounded-xl bg-emergency-600 p-5 text-white">
              <span className="text-2xs font-bold uppercase tracking-[0.14em] text-white/80">
                Sending in
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
                Press cancel to stop
              </span>
            </div>
          )}

          <p className="text-xs leading-relaxed text-navy-500">
            Signed in as <span className="font-semibold text-navy-700">{user?.name ?? 'guest'}</span>.
            Your alert is logged with your account, location and device for the incident record.
          </p>
        </div>
      )}
    </Modal>
  );
}

function SendingState() {
  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      <div className="relative grid size-20 place-items-center">
        <span className="absolute inset-0 animate-pulse-ring rounded-full bg-emergency-400/40" />
        <span className="grid size-20 place-items-center rounded-full bg-emergency-50 ring-1 ring-inset ring-emergency-200">
          <Loader2 className="size-9 animate-spin text-emergency-600" aria-hidden="true" />
        </span>
      </div>
      <div>
        <p className="text-base font-bold text-navy-900">Locating nearest crew</p>
        <p className="mt-1 text-sm text-navy-500">Keep this screen open.</p>
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        Sending your emergency alert. Locating the nearest response crew.
      </p>
    </div>
  );
}

function SentState() {
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
          <p className="text-lg font-bold text-navy-900">Alert sent</p>
          <p className="mt-1 text-sm leading-relaxed text-navy-600">
            Two units are already moving to your location.
          </p>
        </div>
      </div>

      <ol className="space-y-3">
        {[
          { icon: Radio, label: 'Your alert was received', detail: 'Just now', done: true },
          { icon: Ambulance, label: 'Medic Alpha-2 dispatched', detail: 'ETA 4 minutes', done: true },
          { icon: HeartPulse, label: 'Responder with you', detail: 'Arriving shortly', done: false },
        ].map((step) => (
          <li key={step.label} className="flex items-center gap-3">
            <span
              className={cn(
                'grid size-8 shrink-0 place-items-center rounded-full ring-1 ring-inset',
                step.done
                  ? 'bg-relief-50 text-relief-700 ring-relief-200'
                  : 'bg-navy-100 text-navy-400 ring-navy-200',
              )}
            >
              <step.icon className="size-4" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-navy-900">{step.label}</span>
              <span className="block text-xs text-navy-500">{step.detail}</span>
            </span>
          </li>
        ))}
      </ol>

      <div className="rounded-xl bg-navy-50 p-3.5 text-sm leading-relaxed text-navy-700 ring-1 ring-inset ring-navy-200">
        <strong className="font-bold text-navy-900">While you wait:</strong> unlock the door if it is
        safe, move away from glass and unstable walls, and keep your phone volume up.
      </div>
    </div>
  );
}
