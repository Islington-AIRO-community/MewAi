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
  Soup,
  Users,
  Waves,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { TabPanel, Tabs } from '@/components/ui/tabs';
import { useApp } from '@/lib/store';
import { DEPARTMENTS, getDepartment } from '@/lib/types';
import { cn } from '@/lib/utils';

const SHELTERS = [
  {
    name: 'Hillcrest Community Centre',
    area: 'Hillcrest',
    capacity: 320,
    available: 64,
    accessible: true,
    supplies: ['Beds', 'Showers', 'Medical staff', 'Childcare'],
  },
  {
    name: 'Northbank Relief Hall',
    area: 'Northbank',
    capacity: 210,
    available: 18,
    accessible: true,
    supplies: ['Beds', 'Charging', 'Showers'],
  },
  {
    name: 'Old Mill School Gym',
    area: 'Old Mill',
    capacity: 150,
    available: 0,
    accessible: false,
    supplies: ['Blankets', 'Water', 'Food'],
  },
];

const SUPPLY_POINTS = [
  { name: 'Ridgeway Depot', area: 'Ridgeway', item: 'Clean water', qty: '4,200 L', icon: Droplets },
  { name: 'Central Kitchen', area: 'City centre', item: 'Meal packs', qty: '1,800', icon: Soup },
  { name: 'Northbank Cache', area: 'Northbank', item: 'Medical supplies', qty: '112 crates', icon: Building2 },
  { name: 'Ridgeway Depot', area: 'Ridgeway', item: 'Blankets & kits', qty: '960', icon: Waves },
];

const GUIDES = [
  {
    icon: Brain,
    title: 'What the AI does with your words',
    body: 'FLARE reads your message and pulls out the facts a responder needs — how many people, what injuries, what hazards, how urgent. It never sends anything on its own. Each extracted fact is shown with a confidence score, and you approve the whole request before it is dispatched.',
  },
  {
    icon: Users,
    title: 'Why the queue exists',
    body: 'Requests are prioritised on three things: risk to life, number of people affected, and how long someone can safely wait. That is why a trapped person with rising water outranks a medication refill. The target response time is shown on every report.',
  },
  {
    icon: Eye,
    title: 'Who can see your location',
    body: 'Your coordinates are attached to a request only when you send it. After that, only the department handling that request and their dispatch supervisor can see them. We do not track your device in the background.',
  },
  {
    icon: ShieldCheck,
    title: 'How responders are verified',
    body: 'Every unit carries a current certification record and a dispatch identity. You see the unit call sign, their certifications, and their estimated arrival time on the report from the moment they are assigned.',
  },
  {
    icon: AlertTriangle,
    title: 'Preparing before a disaster',
    body: 'Keep a go-bag with water, medication, a torch and copies of identity documents. Charge your phone and keep low-power mode off until you need to call for help. Note your nearest shelter and two exit routes from your area.',
  },
  {
    icon: LifeBuoy,
    title: 'If you are helping someone else',
    body: 'Send the request for them if they cannot, and stay with them until a crew arrives. Put your phone on speaker so you can relay what the responder says. Note anything that changes — water level, breathing, consciousness.',
  },
];

export default function ResourcesPage() {
  const { reports } = useApp();
  const [tab, setTab] = React.useState('shelters');

  const myDepartments = React.useMemo(
    () => [...new Set(reports.map((r) => r.departmentId))].map(getDepartment),
    [reports],
  );

  return (
    <div className="pb-32 sm:pb-16">
      <div className="border-b border-navy-200 bg-white">
        <div className="container py-7 sm:py-9">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-navy-100 text-navy-700">
              <LifeBuoy className="size-4.5" aria-hidden="true" />
            </span>
            <h1 className="text-2xl font-extrabold tracking-tight text-navy-900 sm:text-3xl">
              Relief resources
            </h1>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-navy-500">
            Open shelters, supply points and the contacts for your own reports — plus plain-language
            guidance on how FLARE works.
          </p>
        </div>
      </div>

      <div className="container py-6 sm:py-8">
        <Tabs
          value={tab}
          onValueChange={setTab}
          label="Resource categories"
          className="max-w-lg"
          panelClassName="mt-6"
          items={[
            { id: 'shelters', label: 'Shelters', icon: Building2 },
            { id: 'supplies', label: 'Supply points', icon: Soup },
            { id: 'contacts', label: 'My contacts', icon: PhoneCall },
            { id: 'guides', label: 'How it works', icon: Brain },
          ]}
        >
          {/* ---------- Shelters ---------- */}
          <TabPanel value="shelters">
            <section aria-labelledby="shelters-heading">
              <h2 id="shelters-heading" className="sr-only">
                Open shelters
              </h2>
              <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {SHELTERS.map((s) => {
                  const full = s.available === 0;
                  const pct = Math.round((s.available / s.capacity) * 100);
                  return (
                    <li key={s.name}>
                      <Card
                        className={cn(
                          'flex h-full flex-col p-5',
                          full && 'opacity-75',
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="text-sm font-bold leading-snug text-navy-900">
                              {s.name}
                            </h3>
                            <p className="mt-0.5 flex items-center gap-1 text-xs text-navy-500">
                              <MapPin className="size-3" aria-hidden="true" />
                              {s.area}
                            </p>
                          </div>
                          {full ? (
                            <Badge tone="quiet" size="sm">
                              Full
                            </Badge>
                          ) : (
                            <Badge tone={s.available <= 20 ? 'alert' : 'relief'} size="sm">
                              {s.available} spaces
                            </Badge>
                          )}
                        </div>

                        <div className="mt-4">
                          <div className="flex items-center justify-between text-2xs font-semibold text-navy-500">
                            <span>Capacity</span>
                            <span className="nums">
                              {s.available} / {s.capacity} free
                            </span>
                          </div>
                          <div
                            className="mt-1.5 h-2 overflow-hidden rounded-full bg-navy-100"
                            role="img"
                            aria-label={`${s.available} of ${s.capacity} spaces available`}
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
                                {sup}
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
                                Step-free access
                              </Badge>
                            </li>
                          )}
                        </ul>

                        <div className="mt-auto flex gap-2 pt-4">
                          <Button variant="outline" size="sm" className="flex-1">
                            <MapPin aria-hidden="true" />
                            Directions
                          </Button>
                          <Button
                            variant={full ? 'ghost' : 'primary'}
                            size="sm"
                            className="flex-1"
                            disabled={full}
                          >
                            {full ? 'Waitlist' : 'Request a bed'}
                          </Button>
                        </div>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            </section>
          </TabPanel>

          {/* ---------- Supply points ---------- */}
          <TabPanel value="supplies">
            <section aria-labelledby="supply-heading">
              <h2 id="supply-heading" className="sr-only">
                Supply distribution points
              </h2>
              <ul className="grid gap-3.5 sm:grid-cols-2">
                {SUPPLY_POINTS.map((p, i) => (
                  <li key={`${p.name}-${p.item}`}>
                    <Card className="flex items-center gap-3.5 p-4">
                      <span
                        className="grid size-11 shrink-0 place-items-center rounded-xl bg-alert-50 text-alert-700 ring-1 ring-inset ring-alert-200"
                        aria-hidden="true"
                      >
                        <p.icon className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-navy-900">{p.item}</p>
                        <p className="truncate text-xs text-navy-500">
                          {p.name} · {p.area}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="nums text-sm font-extrabold text-navy-900">{p.qty}</p>
                        <p className="text-2xs text-navy-400">available</p>
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>

              <Card className="mt-5 border-dispatch-200 bg-dispatch-50/50 p-5">
                <h3 className="flex items-center gap-2 text-sm font-bold text-navy-900">
                  <Droplets className="size-4 text-dispatch-600" aria-hidden="true" />
                  Cannot reach a distribution point?
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-navy-600">
                  Tell the assistant what you need. Logistics will route the nearest supply run to
                  you — you do not have to travel.
                </p>
                <Button asChild variant="primary" size="md" className="mt-3.5">
                  <Link href="/chat?intent=food-water">
                    <Droplets aria-hidden="true" />
                    Request food and water
                  </Link>
                </Button>
              </Card>
            </section>
          </TabPanel>

          {/* ---------- Contacts ---------- */}
          <TabPanel value="contacts">
            <section aria-labelledby="contacts-heading">
              <h2 id="contacts-heading" className="sr-only">
                Response team contacts
              </h2>
              <p className="mb-4 text-sm leading-relaxed text-navy-500">
                These are the dispatch desks handling your reports. If someone&rsquo;s life is in
                immediate danger, use SOS rather than calling a desk.
              </p>

              <ul className="grid gap-3.5 sm:grid-cols-2">
                {DEPARTMENTS.map((d) => {
                  const involved = myDepartments.some((m) => m.id === d.id);
                  return (
                    <li key={d.id}>
                      <Card
                        className={cn(
                          'flex h-full flex-col p-5',
                          involved && 'border-dispatch-300 ring-1 ring-dispatch-200',
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className="grid size-10 shrink-0 place-items-center rounded-xl bg-navy-900 text-white"
                            aria-hidden="true"
                          >
                            <d.icon className="size-5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <h3 className="text-sm font-bold leading-snug text-navy-900">
                              {d.name}
                            </h3>
                            <p className="mt-0.5 text-xs text-navy-500">{d.coverage}</p>
                          </div>
                          {involved && (
                            <Badge tone="dispatch" size="xs">
                              Your report
                            </Badge>
                          )}
                        </div>

                        <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-navy-100 pt-3.5 text-center">
                          <div>
                            <dt className="text-2xs text-navy-400">Crews</dt>
                            <dd className="nums mt-0.5 text-sm font-bold text-navy-900">
                              {d.crewsAvailable}/{d.crewsTotal}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-2xs text-navy-400">Avg</dt>
                            <dd className="nums mt-0.5 text-sm font-bold text-navy-900">
                              {d.avgResponseMinutes}m
                            </dd>
                          </div>
                          <div>
                            <dt className="text-2xs text-navy-400">Status</dt>
                            <dd className="mt-0.5 text-sm font-bold text-navy-900">
                              {d.statusLabel}
                            </dd>
                          </div>
                        </dl>

                        <div className="mt-auto pt-4">
                          <Button variant="outline" size="sm" block>
                            <PhoneCall aria-hidden="true" />
                            <span className="nums">{d.phone}</span>
                          </Button>
                        </div>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            </section>
          </TabPanel>

          {/* ---------- Guides ---------- */}
          <TabPanel value="guides">
            <section aria-labelledby="guides-heading">
              <h2 id="guides-heading" className="sr-only">
                Guides
              </h2>
              <ul className="grid gap-4 md:grid-cols-2">
                {GUIDES.map((g) => (
                  <li key={g.title}>
                    <Card className="h-full p-5 sm:p-6">
                      <span className="grid size-10 place-items-center rounded-xl bg-navy-50 text-navy-700 ring-1 ring-inset ring-navy-200">
                        <g.icon className="size-5" aria-hidden="true" />
                      </span>
                      <h3 className="mt-3.5 text-base font-bold text-navy-900">{g.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-navy-600">{g.body}</p>
                    </Card>
                  </li>
                ))}
              </ul>

              <Card className="mt-6 overflow-hidden">
                <div className="border-b border-navy-100 bg-navy-50/60 px-5 py-4 sm:px-6">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-navy-900">
                    <Keyboard className="size-4 text-navy-500" aria-hidden="true" />
                    Accessibility
                  </h3>
                </div>
                <ul className="divide-y divide-navy-100">
                  {[
                    {
                      icon: Keyboard,
                      t: 'Full keyboard support',
                      d: 'Every control is tabbable in a sensible order, with a visible focus ring and Escape to close overlays.',
                    },
                    {
                      icon: Mic,
                      t: 'Voice as a first-class input',
                      d: 'Live voice mode, hands-free wake, and mute controls that do not require precise tapping.',
                    },
                    {
                      icon: Eye,
                      t: 'Never colour alone',
                      d: 'Status, priority and progress always carry a text label and an icon alongside the colour.',
                    },
                    {
                      icon: Waves,
                      t: 'Calm motion',
                      d: 'Honours your reduced-motion preference and keeps animation slow enough not to distract.',
                    },
                  ].map((a) => (
                    <li key={a.t} className="flex gap-3.5 px-5 py-4 sm:px-6">
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-navy-50 text-navy-600 ring-1 ring-inset ring-navy-200">
                        <a.icon className="size-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-navy-900">{a.t}</p>
                        <p className="mt-0.5 text-sm leading-relaxed text-navy-500">{a.d}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          </TabPanel>
        </Tabs>
      </div>
    </div>
  );
}
