'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Accessibility,
  AlertTriangle,
  Brain,
  Building2,
  Droplets,
  Eye,
  Keyboard,
  LifeBuoy,
  MapPin,
  Mic,
  PhoneCall,
  ShieldCheck,
  Siren,
  Soup,
  Users,
  Waves,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { TabPanel, Tabs } from '@/components/ui/tabs';
import { useApp } from '@/lib/store';
import { EMERGENCY_GROUPS, telHref } from '@/lib/emergency-contacts';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/ui/patterns';
import { useLocale } from '@/lib/i18n';
/**
 * Open shelters and distribution points, in the valley.
 *
 * Real locality names (Balaju, Kirtipur, Suryabinayak) and plausible venues
 * for them — a school gymnasium and a community hall are what a municipality
 * actually opens, and they are the buildings Nepal's shelter plans already
 * name. Capacities are demo figures, not any centre's real count.
 */
const SHELTERS = [
  {
    name: 'Balaju School Gymnasium',
    ne: 'बलाजु विद्यालय जिम्नेसियम',
    area: 'Balaju, Kathmandu',
    capacity: 320,
    available: 64,
    accessible: true,
    supplies: ['beds', 'showers', 'medical-staff', 'childcare'],
  },
  {
    name: 'Kirtipur Community Hall',
    ne: 'कीर्तिपुर सामुदायिक भवन',
    area: 'Kirtipur, Kathmandu',
    capacity: 210,
    available: 18,
    accessible: true,
    supplies: ['beds', 'charging', 'showers'],
  },
  {
    name: 'Suryabinayak Higher Secondary School',
    ne: 'सूर्यबिनायक उच्च माध्यमिक विद्यालय',
    area: 'Suryabinayak, Bhaktapur',
    capacity: 150,
    available: 0,
    accessible: false,
    supplies: ['blankets', 'water', 'food'],
  },
];

/**
 * Shelter tags, English text as the id.
 *
 * The id *is* the English, so a missing Nepali string falls back to exactly the
 * word it was going to replace and there is nothing to keep in sync. See
 * `label()` in `lib/i18n.tsx` for the same rule applied app-wide.
 */
const SHELTER_SUPPLIES: Record<string, string> = {
  beds: 'Beds',
  showers: 'Showers',
  'medical-staff': 'Medical staff',
  childcare: 'Childcare',
  charging: 'Charging',
  blankets: 'Blankets',
  water: 'Water',
  food: 'Food',
};

const SUPPLY_POINTS = [
  { name: 'Balaju Distribution Hub', area: 'Balaju, Kathmandu', item: 'Clean water', ne: 'सफा पानी', qty: '4,200 L', icon: Droplets },
  { name: 'Kirtipur Central Kitchen', area: 'Kirtipur, Kathmandu', item: 'Meal packs', ne: 'खाना प्याक', qty: '1,800', icon: Soup },
  { name: 'Tudan Relief Warehouse', area: 'Tudan, Lalitpur', item: 'Medical supplies', ne: 'चिकित्सा सामग्री', qty: '112 crates', icon: Building2 },
  { name: 'Suryabinayak Depot', area: 'Suryabinayak, Bhaktapur', item: 'Blankets & kits', ne: 'बल र किट', qty: '960', icon: Waves },
];

const GUIDES = [
  {
    id: 'ai-words',
    icon: Brain,
    title: 'What the AI does with your words',
    body: 'FLARE reads your message and pulls out the facts a responder needs — how many people, what injuries, what hazards, how urgent. It never sends anything on its own. Each extracted fact is shown with a confidence score, and you approve the whole request before it is dispatched.',
  },
  {
    id: 'queue',
    icon: Users,
    title: 'Why the queue exists',
    body: 'Requests are prioritised on three things: risk to life, number of people affected, and how long someone can safely wait. That is why a trapped person with rising water outranks a medication refill. The target response time is shown on every report.',
  },
  {
    id: 'location',
    icon: Eye,
    title: 'Who can see your location',
    body: 'Your coordinates are attached to a request only when you send it. After that, only the department handling that request and their dispatch supervisor can see them. We do not track your device in the background.',
  },
  {
    id: 'verified',
    icon: ShieldCheck,
    title: 'How responders are verified',
    body: 'Every unit carries a current certification record and a dispatch identity. You see the unit call sign, their certifications, and their estimated arrival time on the report from the moment they are assigned.',
  },
  {
    id: 'prepared',
    icon: AlertTriangle,
    title: 'Preparing before a disaster',
    body: 'Keep a go-bag with water, medication, a torch and copies of identity documents. Charge your phone and keep low-power mode off until you need to call for help. Note your nearest shelter and two exit routes from your area.',
  },
  {
    id: 'helping',
    icon: LifeBuoy,
    title: 'If you are helping someone else',
    body: 'Send the request for them if they cannot, and stay with them until a crew arrives. Put your phone on speaker so you can relay what the responder says. Note anything that changes — water level, breathing, consciousness.',
  },
];

/** Claims the app makes about itself. Promises, so they live with the other copy. */
const ACCESSIBILITY_NOTES = [
  {
    id: 'keyboard',
    icon: Keyboard,
    t: 'Full keyboard support',
    d: 'Every control is tabbable in a sensible order, with a visible focus ring and Escape to close overlays.',
  },
  {
    id: 'voice',
    icon: Mic,
    t: 'Voice as a first-class input',
    d: 'Live voice mode, hands-free wake, and mute controls that do not require precise tapping.',
  },
  {
    id: 'colour',
    icon: Eye,
    t: 'Never colour alone',
    d: 'Status, priority and progress always carry a text label and an icon alongside the colour.',
  },
  {
    id: 'motion',
    icon: Waves,
    t: 'Calm motion',
    d: 'Honours your reduced-motion preference and keeps animation slow enough not to distract.',
  },
];

export default function ResourcesPage() {
  const { openSos } = useApp();
  const { t } = useLocale();
  const [tab, setTab] = React.useState('shelters');

  return (
    <div className="pb-[var(--content-bottom)] sm:pb-16">
      <PageHeader
        icon={LifeBuoy}
        title={t('resources.title')}
        description={t('resources.subtitle')}
      />

      <div className="container py-6 sm:py-8">
        <Tabs
          value={tab}
          onValueChange={setTab}
          label={t('resources.tabs')}
          className="max-w-2xl"
          panelClassName="mt-6"
          items={[
            { id: 'shelters', label: t('resources.tab.shelters'), icon: Building2 },
            { id: 'supplies', label: t('resources.tab.supplies'), icon: Soup },
            { id: 'contacts', label: t('resources.tab.contacts'), icon: PhoneCall },
            { id: 'guides', label: t('resources.tab.guides'), icon: Brain },
          ]}
        >
          <TabPanel value="shelters">
            <Shelters />
          </TabPanel>

          <TabPanel value="supplies">
            <SupplyPoints />
          </TabPanel>

          <TabPanel value="contacts">
            <EmergencyNumbers onSos={openSos} />
          </TabPanel>

          <TabPanel value="guides">
            <Guides />
          </TabPanel>
        </Tabs>
      </div>
    </div>
  );
}

/**
 * Shelter capacity.
 *
 * `full` is a first-class state rather than a percentage, because the two
 * affordances differ: a full shelter has nothing to request, so its button is a
 * ghost "Waitlist" and its progress bar reads empty. A shelter at 3% free is
 * still open, and the bar has to show that — hence `100 - pct` rather than
 * `pct`.
 */
function Shelters() {
  const { t, locale, label } = useLocale();
  return (
    <section aria-labelledby="shelters-heading">
      <h2 id="shelters-heading" className="sr-only">
        {t('resources.shelters.heading')}
      </h2>
      <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {SHELTERS.map((s) => {
          const full = s.available === 0;
          const pct = Math.round((s.available / s.capacity) * 100);
          return (
            <li key={s.name}>
              <Card className={cn('flex h-full flex-col p-5', full && 'opacity-75')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold leading-snug text-navy-900">
                      {locale === 'ne' && s.ne ? s.ne : s.name}
                    </h3>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-navy-500">
                      <MapPin className="size-3" aria-hidden="true" />
                      {s.area}
                    </p>
                  </div>
                  {full ? (
                    <Badge tone="quiet" size="sm">
                      {t('resources.shelters.full')}
                    </Badge>
                  ) : (
                    <Badge tone={s.available <= 20 ? 'alert' : 'relief'} size="sm">
                      {t('resources.shelters.spaces', { n: s.available })}
                    </Badge>
                  )}
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between text-2xs font-semibold text-navy-500">
                    <span>{t('resources.shelters.capacity')}</span>
                    <span className="nums">
                      {t('resources.shelters.free', {
                        free: s.available,
                        total: s.capacity,
                      })}
                    </span>
                  </div>
                  <div
                    className="mt-1.5 h-2 overflow-hidden rounded-full bg-navy-100"
                    role="img"
                    aria-label={t('resources.shelters.fullAria', {
                      free: s.available,
                      total: s.capacity,
                    })}
                  >
                    <div
                      className={cn(
                        'h-full rounded-full',
                        full ? 'bg-navy-300' : pct < 20 ? 'bg-alert-500' : 'bg-relief-500',
                      )}
                      style={{ width: `${full ? 100 : 100 - pct}%` }}
                    />
                  </div>
                </div>

                <ul className="mt-4 flex flex-wrap gap-1.5">
                  {s.supplies.map((sup) => (
                    <li key={sup}>
                      <Badge
                        tone="outline"
                        size="xs"
                        className="bg-navy-50 font-medium text-navy-600 ring-navy-200"
                      >
                        {label('shelterTag', sup, SHELTER_SUPPLIES[sup])}
                      </Badge>
                    </li>
                  ))}
                  {s.accessible && (
                    <li>
                      <Badge
                        tone="outline"
                        size="xs"
                        className="bg-dispatch-50 font-semibold text-dispatch-700 ring-dispatch-200"
                      >
                        <Accessibility className="size-3" aria-hidden="true" />
                        {t('resources.shelters.accessible')}
                      </Badge>
                    </li>
                  )}
                </ul>

                <div className="mt-auto flex gap-2 pt-4">
                  <Button variant="outline" size="sm" className="flex-1">
                    <MapPin aria-hidden="true" />
                    {t('btn.directions')}
                  </Button>
                  <Button
                    variant={full ? 'ghost' : 'primary'}
                    size="sm"
                    className="flex-1"
                    disabled={full}
                  >
                    {t(full ? 'btn.waitlist' : 'btn.requestBed')}
                  </Button>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SupplyPoints() {
  const { t, locale } = useLocale();
  return (
    <section aria-labelledby="supply-heading">
      <h2 id="supply-heading" className="sr-only">
        {t('resources.supplies.heading')}
      </h2>
      <ul className="grid gap-3.5 sm:grid-cols-2">
        {SUPPLY_POINTS.map((p) => (
          <li key={`${p.name}-${p.item}`}>
            <Card className="flex items-center gap-3.5 p-4">
              <span
                className="grid size-11 shrink-0 place-items-center rounded-xl bg-alert-50 text-alert-700 ring-1 ring-inset ring-alert-200"
                aria-hidden="true"
              >
                <p.icon className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-navy-900">
                  {locale === 'ne' ? p.ne : p.item}
                </p>
                <p className="truncate text-xs text-navy-500">
                  {p.name} · {p.area}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="nums text-sm font-extrabold text-navy-900">{p.qty}</p>
                <p className="text-2xs text-navy-400">{t('resources.supplies.available')}</p>
              </div>
            </Card>
          </li>
        ))}
      </ul>

      <Card className="mt-5 border-dispatch-200 bg-dispatch-50/50 p-5">
        <h3 className="flex items-center gap-2 text-sm font-bold text-navy-900">
          <Droplets className="size-4 text-dispatch-600" aria-hidden="true" />
          {t('resources.supplies.cannotReach')}
        </h3>
        <p className="mt-1.5 text-sm leading-relaxed text-navy-600">
          {t('resources.supplies.cannotReachBody')}
        </p>
        <Button asChild variant="primary" size="md" className="mt-3.5">
          <Link href="/chat?intent=food-water">
            <Droplets aria-hidden="true" />
            {t('resources.supplies.cta')}
          </Link>
        </Button>
      </Card>
    </section>
  );
}

/**
 * National emergency numbers, grouped by the kind of help.
 *
 * This replaced the mock dispatch-desk cards, which showed `+1 (555)`
 * numbers next to crew counts and SLAs — plausible on a demo and actively
 * harmful here, because the whole point of this tab is the one case FLARE
 * cannot serve: no signal, no data, no account. A dead number on an
 * emergency card is the failure this tab exists to prevent, so every
 * number is a real one and every one of them dials.
 *
 * Numbers repeat across groups (the Red Cross and the NEOC answer for more
 * than one kind of help) and that is deliberate: read in an emergency, a
 * group has to be complete on its own rather than sending someone
 * scrolling for the line they already saw.
 */
function EmergencyNumbers({ onSos }: { onSos: () => void }) {
  const { t, locale } = useLocale();
  const ne = locale === 'ne';
  return (
    <section aria-labelledby="contacts-heading">
      <h2 id="contacts-heading" className="text-base font-bold text-navy-900">
        {t('resources.contacts.heading')}
      </h2>
      <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-navy-500">
        {t('resources.contacts.lead')}
      </p>

      <ul className="mt-5 grid gap-4 md:grid-cols-2">
        {EMERGENCY_GROUPS.map((g) => (
          <li key={g.id}>
            <Card className="flex h-full flex-col p-5">
              <div className="flex items-start gap-3">
                <span
                  className="grid size-10 shrink-0 place-items-center rounded-xl bg-navy-900 text-white"
                  aria-hidden="true"
                >
                  <g.icon className="size-5" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold leading-snug text-navy-900">
                    {ne && g.neLabel ? g.neLabel : g.label}
                  </h3>
                  <p className="mt-0.5 text-xs leading-snug text-navy-500">
                    {ne && g.neHint ? g.neHint : g.hint}
                  </p>
                </div>
              </div>

              <dl className="mt-4 flex-1 divide-y divide-navy-100 border-t border-navy-100">
                {g.lines.map((line) => (
                  <div key={line.name} className="py-3 last:pb-0">
                    <dt className="text-xs font-semibold leading-snug text-navy-600">
                      {ne && line.ne ? line.ne : line.name}
                    </dt>
                    <dd className="mt-2 flex flex-wrap gap-2">
                      {line.numbers.map((n) => (
                        <Button
                          key={n}
                          asChild
                          variant="outline"
                          size="md"
                          className="nums shadow-none"
                        >
                          {/* The number itself is never translated: it is
                              dialled, read aloud, or copied. */}
                          <a href={telHref(n)} aria-label={t('resources.contacts.dial', { number: n })}>
                            <PhoneCall aria-hidden="true" />
                            {n}
                          </a>
                        </Button>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </Card>
          </li>
        ))}
      </ul>

      {/*
        SOS rather than a number, because it is the one action on this page
        that does not depend on the handset having a dialer. It opens the
        dialog in place; a link to a route would be a dead end.
      */}
      <Card className="mt-5 border-emergency-200 bg-emergency-50/60 p-5">
        <h3 className="flex items-center gap-2 text-sm font-bold text-navy-900">
          <Siren className="size-4 text-emergency-600" aria-hidden="true" />
          {t('resources.contacts.sosHeading')}
        </h3>
        <p className="mt-1.5 text-sm leading-relaxed text-navy-600">
          {t('resources.contacts.sosBody')}
        </p>
        <Button
          type="button"
          variant="sos"
          size="lg"
          className="mt-3.5 stripe-critical"
          onClick={onSos}
        >
          <PhoneCall aria-hidden="true" />
          {t('sos.button')}
        </Button>
      </Card>
    </section>
  );
}

/** What FLARE does, and what it promises about how it treats the person asking. */
function Guides() {
  const { t } = useLocale();
  return (
    <section aria-labelledby="guides-heading">
      <h2 id="guides-heading" className="sr-only">
        {t('resources.guides.heading')}
      </h2>
      <ul className="grid gap-4 md:grid-cols-2">
        {GUIDES.map((g) => (
          <li key={g.id}>
            <Card className="h-full p-5 sm:p-6">
              <span className="grid size-10 place-items-center rounded-xl bg-navy-50 text-navy-700 ring-1 ring-inset ring-navy-200">
                <g.icon className="size-5" aria-hidden="true" />
              </span>
              <h3 className="mt-3.5 text-base font-bold text-navy-900">
                {t(`resources.guide.${g.id}`)}
              </h3>
              {/* Body stays English in Nepali mode: see the note in
                  `i18n-strings.ts` on what is deliberately left untranslated. */}
              <p className="mt-2 text-sm leading-relaxed text-navy-600">{g.body}</p>
            </Card>
          </li>
        ))}
      </ul>

      <Card className="mt-6 overflow-hidden">
        <CardHeader
          className="bg-navy-50/60"
          icon={<Keyboard className="size-4 shrink-0 text-navy-500" aria-hidden="true" />}
        >
          <CardTitle>{t('resources.guides.a11y')}</CardTitle>
        </CardHeader>
        <ul className="divide-y divide-navy-100">
          {ACCESSIBILITY_NOTES.map((a) => (
            <li key={a.id} className="flex gap-3.5 px-5 py-4 sm:px-6">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-navy-50 text-navy-600 ring-1 ring-inset ring-navy-200">
                <a.icon className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-navy-900">
                  {t(`resources.a11y.${a.id}`)}
                </p>
                <p className="mt-0.5 text-sm leading-relaxed text-navy-500">{a.d}</p>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
