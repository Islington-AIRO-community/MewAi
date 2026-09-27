import {
  CheckCircle2,
  FileStack as FileStackIcon,
  ScanSearch,
  Siren,
} from 'lucide-react';
import type {
  ActionCard,
  DashboardStat,
  Report,
  TimelineEvent,
} from './types';
import { DEMO_NOW } from './time';

/**
 * Anchor "now" for the demo. Fixed so server and client render identical
 * relative times (no hydration drift) and so screenshots stay stable.
 * Lives in `./time` so `relativeTime()` can share the exact same clock.
 */
export { DEMO_NOW };

/* ------------------------------------------------------------------ *
 * Reports
 * ------------------------------------------------------------------ */

function ts(minutesAgo: number): string {
  return new Date(DEMO_NOW.getTime() - minutesAgo * 60_000).toISOString();
}

function ev(
  id: string,
  minutesAgo: number,
  stageId: TimelineEvent['stageId'],
  title: string,
  detail: string,
  actor: string,
  actorRole: TimelineEvent['actorRole'],
  tags?: string[],
): TimelineEvent {
  return { id, at: ts(minutesAgo), stageId, title, detail, actor, actorRole, tags };
}

export const REPORTS: Report[] = [
  {
    id: '417',
    title: 'Trapped in basement — Baneshwor apartment block',
    summary:
      'Two adults and a child trapped behind a collapsed stairwell in a partially collapsed residential block. Water rising to knee height. One person cannot bear weight.',
    category: 'search-rescue',
    priority: 'critical',
    departmentId: 'dept-sar',
    reporterName: 'Sita Magar',
    createdAt: ts(14),
    updatedAt: ts(2),
    currentStage: 'dispatched',
    stageTimestamps: {
      submitted: ts(14),
      triage: ts(13),
      dispatched: ts(9),
    },
    location: {
      label: 'Baneshwor apartment block, Building C',
      area: 'Baneshwor, Kathmandu',
      lat: 27.5785,
      lng: 85.356,
      landmark: 'Rear service alley, blue water drums',
    },
    peopleAffected: 3,
    vulnerability: ['Child under 12', 'Injury — possible fracture', 'Rising water'],
    contactPreference: 'call',
    responder: {
      name: 'Crew Sierra-4',
      unit: 'USAR Technical Rescue',
      callSign: 'SIERRA-4',
      etaMinutes: 6,
      certifications: ['Confined Space', 'Swift Water', 'Paediatric First Aid'],
    },
    channel: 'voice',
    etaMinutes: 6,
    extracted: [
      { label: 'People trapped', value: '3 (2 adults, 1 child)', confidence: 0.97 },
      { label: 'Injuries', value: 'Suspected left-leg fracture, cannot bear weight', confidence: 0.91 },
      { label: 'Water level', value: 'Rising — knee height, ~20 min to waist', confidence: 0.84 },
      { label: 'Structural risk', value: 'Block C stairwell partially collapsed', confidence: 0.89 },
      { label: 'Contact', value: 'Voice call preferred — phone signal weak', confidence: 0.93 },
    ],
    timeline: [
      ev('e417-1', 14, 'submitted', 'Report submitted', 'Submitted via Live Voice Mode. Location auto-confirmed by device GPS to ±8 m.', 'Sita Magar', 'reporter', ['Voice', 'GPS ±8 m']),
      ev('e417-2', 13, 'triage', 'AI triage completed', 'Detected trapped persons + rising water + minor casualty. Priority set to CRITICAL, 8-minute SLA engaged.', 'FLARE Triage Engine v4.2', 'system', ['Confidence 97%', 'Escalated']),
      ev('e417-3', 13, 'triage', 'Routed to Urban Search & Rescue', 'USAR accepted the request. Thermal imaging and shoring equipment requested.', 'USAR Dispatch', 'department'),
      ev('e417-4', 9, 'dispatched', 'Crew Sierra-4 dispatched', 'Technical Rescue crew en route from the Budhanilkantha staging point. Two additional units staged.', 'USAR Dispatch', 'department', ['ETA 6 min', '2 units staged']),
      ev('e417-5', 2, 'dispatched', 'Responder status update', 'Crew reports congestion on the Ring Road at Kalanki, rerouted via Baneshwor. ETA unchanged.', 'Crew Sierra-4', 'responder', ['Rerouted']),
    ],
  },
  {
    id: '418',
    title: 'Elderly resident needs oxygen — Chhetrapati',
    summary:
      'Home oxygen concentrator lost in the fire. Resident is 78, COPD, currently short of breath but conscious. Spare concentrator needed urgently.',
    category: 'medical',
    priority: 'critical',
    departmentId: 'dept-medical',
    reporterName: 'Hari Bahadur Shrestha',
    createdAt: ts(9),
    updatedAt: ts(1),
    currentStage: 'on-site',
    stageTimestamps: {
      submitted: ts(9),
      triage: ts(8),
      dispatched: ts(6),
      'on-site': ts(3),
    },
    location: {
      label: 'House 14, Battisputali Road',
      area: 'Chhetrapati, Kathmandu',
      lat: 27.6995,
      lng: 85.3445,
      landmark: 'Blue gate, second floor',
    },
    peopleAffected: 1,
    vulnerability: ['Age 78', 'COPD / respiratory', 'No oxygen supply', 'Mobility limited'],
    contactPreference: 'call',
    responder: {
      name: 'Medic Delta-2',
      unit: 'EMS Advanced Life Support',
      callSign: 'DELTA-2',
      certifications: ['ALS', 'Respiratory Care', 'Oxygen Therapy'],
    },
    channel: 'chat',
    etaMinutes: 0,
    extracted: [
      { label: 'Condition', value: 'COPD, acute dyspnoea', confidence: 0.94 },
      { label: 'Age', value: '78 years', confidence: 0.99 },
      { label: 'Equipment lost', value: 'Home oxygen concentrator', confidence: 0.96 },
      { label: 'Consciousness', value: 'Conscious, oriented, anxious', confidence: 0.88 },
    ],
    timeline: [
      ev('e418-1', 9, 'submitted', 'Report submitted', 'Submitted through AI Relief Assistant chat. Address auto-filled from device location.', 'Hari Bahadur Shrestha', 'reporter', ['Chat']),
      ev('e418-2', 8, 'triage', 'AI triage completed', 'Respiratory distress + equipment loss. Priority CRITICAL. Oxygen cache alerted.', 'FLARE Triage Engine v4.2', 'system', ['Confidence 94%']),
      ev('e418-3', 8, 'triage', 'Routed to Emergency Medical Services', 'EMS accepted. Portable oxygen requested from the Chhetrapati cache.', 'EMS Dispatch', 'department', ['Cache: Chhetrapati']),
      ev('e418-4', 6, 'dispatched', 'Medic Delta-2 dispatched', 'ALS crew en route from the Tudan ambulance post with 2 portable concentrators.', 'EMS Dispatch', 'department', ['ETA 7 min']),
      ev('e418-5', 3, 'on-site', 'Crew on site', 'Responder with patient. Oxygen delivery started, vitals stable.', 'Medic Delta-2', 'responder', ['SpO₂ 92% → 96%']),
      ev('e418-6', 1, 'on-site', 'Resupply requested', 'Crew requested a second concentrator for overnight use. Logistics acknowledged.', 'Medic Delta-2', 'responder'),
    ],
  },
  {
    id: '419',
    title: 'Family of six needs shelter — Bhaktapur',
    summary:
      'Two adults and four children, ages 2–11, without safe housing. Water and blankets needed. Two children have asthma.',
    category: 'shelter',
    priority: 'high',
    departmentId: 'dept-shelter',
    reporterName: 'Anisha Gurung',
    createdAt: ts(37),
    updatedAt: ts(11),
    currentStage: 'dispatched',
    stageTimestamps: {
      submitted: ts(37),
      triage: ts(35),
      dispatched: ts(20),
    },
    location: {
      label: 'Suryabinayak temple courtyard, east plinth',
      area: 'Suryabinayak, Bhaktapur',
      lat: 27.665,
      lng: 85.429,
      landmark: 'Under the covered walkway, near the Red Cross banner',
    },
    peopleAffected: 6,
    vulnerability: ['Children under 12 (×4)', 'Asthma (×2)', 'No safe housing'],
    contactPreference: 'sms',
    responder: {
      name: 'Shelter Team North-1',
      unit: 'Emergency Shelter & Housing',
      callSign: 'SHELTER-N1',
      etaMinutes: 18,
      certifications: ['Child Safeguarding', 'First Aid', 'Asthma Care'],
    },
    channel: 'chat',
    etaMinutes: 18,
    extracted: [
      { label: 'Household', value: '6 (2 adults, 4 children)', confidence: 0.98 },
      { label: 'Children ages', value: '2, 4, 7, 11', confidence: 0.93 },
      { label: 'Medical flags', value: 'Asthma — inhalers required', confidence: 0.9 },
      { label: 'Current shelter', value: 'Temporary — no facilities', confidence: 0.87 },
    ],
    timeline: [
      ev('e419-1', 37, 'submitted', 'Report submitted', 'Submitted via AI Relief Assistant. Household composition captured from conversation.', 'Anisha Gurung', 'reporter', ['Chat', '6 people']),
      ev('e419-2', 35, 'triage', 'AI triage completed', 'Family with minors and no housing. Priority HIGH, 30-minute SLA. Safeguarding check added.', 'FLARE Triage Engine v4.2', 'system', ['Confidence 96%', 'Safeguarding']),
      ev('e419-3', 35, 'triage', 'Routed to Emergency Shelter & Housing', 'Accepted. Two beds held at Kirtipur Community Hall, inhalers requested from clinic cache.', 'Shelter Control', 'department'),
      ev('e419-4', 20, 'dispatched', 'Shelter Team North-1 dispatched', 'Team en route with blankets, water and 2 spare inhalers.', 'Shelter Control', 'department', ['ETA 18 min']),
      ev('e419-5', 11, 'dispatched', 'Destination confirmed', 'Kirtipur Community Hall confirmed 6 spaces and 2 cots.', 'Shelter Control', 'department'),
    ],
  },
  {
    id: '420',
    title: 'Missing 9-year-old — Balaju irrigation canal',
    summary:
      'Boy last seen in a yellow raincoat near the canal footpath about 40 minutes ago. Family has searched the immediate area. Possible water hazard nearby.',
    category: 'missing-person',
    priority: 'critical',
    departmentId: 'dept-sar',
    reporterName: 'Kamala Tamang',
    createdAt: ts(52),
    updatedAt: ts(4),
    currentStage: 'on-site',
    stageTimestamps: {
      submitted: ts(52),
      triage: ts(50),
      dispatched: ts(44),
      'on-site': ts(16),
    },
    location: {
      label: 'Balaju irrigation canal, footpath near Gate 3',
      area: 'Balaju, Kathmandu',
      lat: 27.69,
      lng: 85.338,
      landmark: 'Canal gate 3, white marker post',
    },
    peopleAffected: 1,
    vulnerability: ['Child, 9 years', 'Water hazard', 'Low light (dusk)'],
    contactPreference: 'call',
    responder: {
      name: 'Search Team Kilo-1',
      unit: 'USAR Missing Persons',
      callSign: 'KILO-1',
      certifications: ['Water Search', 'Child Safeguarding', 'Drone Recon'],
    },
    channel: 'voice',
    extracted: [
      { label: 'Missing person', value: 'Male, 9 years', confidence: 0.99 },
      { label: 'Description', value: 'Yellow raincoat, red backpack', confidence: 0.95 },
      { label: 'Last seen', value: '~40 min before report', confidence: 0.88 },
      { label: 'Hazard', value: 'Canal water — high drowning risk', confidence: 0.92 },
    ],
    timeline: [
      ev('e420-1', 52, 'submitted', 'Missing person report submitted', 'Submitted via Live Voice Mode while searching. Last-known location pinned automatically.', 'Kamala Tamang', 'reporter', ['Voice', 'Child']),
      ev('e420-2', 50, 'triage', 'AI triage completed', 'Child missing near open water. Priority CRITICAL. Amber alert protocol started.', 'FLARE Triage Engine v4.2', 'system', ['Confidence 99%', 'Amber alert']),
      ev('e420-3', 49, 'triage', 'Routed to Urban Search & Rescue', 'USAR missing persons unit engaged, drone launched for aerial sweep of the canal corridor.', 'USAR Dispatch', 'department', ['Drone airborne']),
      ev('e420-4', 44, 'dispatched', 'Search Team Kilo-1 dispatched', 'Two-person team with thermal camera and throw rope deployed from the canal gate.', 'USAR Dispatch', 'department', ['ETA 6 min']),
      ev('e420-5', 16, 'on-site', 'Search grid initiated', 'Cordon set along 900 m of the canal path. Foot search in progress, phone ping triangulating.', 'Search Team Kilo-1', 'responder', ['Cordon 900 m']),
      ev('e420-6', 4, 'on-site', 'Phone ping narrowed to 120 m', 'Cellular ping localised to the canal guard\'s hut. Team diverting.', 'Search Team Kilo-1', 'responder', ['120 m radius']),
    ],
  },
  {
    id: '421',
    title: 'No clean drinking water — Kirtipur blocks 1–4',
    summary:
      'Mains supply contaminated for a block of 22 households. Residents need bottled water and water purification tablets.',
    category: 'food-water',
    priority: 'high',
    departmentId: 'dept-logistics',
    reporterName: 'Ramesh Adhikari',
    createdAt: ts(95),
    updatedAt: ts(52),
    currentStage: 'on-site',
    stageTimestamps: {
      submitted: ts(95),
      triage: ts(93),
      dispatched: ts(80),
      'on-site': ts(60),
    },
    location: {
      label: 'Kirtipur, blocks 1–4',
      area: 'Kirtipur, Kathmandu',
      lat: 27.6785,
      lng: 85.283,
      landmark: 'Block 2 entrance, notice board',
    },
    peopleAffected: 54,
    vulnerability: ['22 households', 'Infants (×5)', 'Elderly (×9)'],
    contactPreference: 'sms',
    responder: {
      name: 'Logistics Bravo-5',
      unit: 'Relief Logistics & Supply',
      callSign: 'BRAVO-5',
      certifications: ['Water Safety', 'Distribution', 'Public Health'],
    },
    channel: 'web',
    extracted: [
      { label: 'Affected', value: '22 households (~54 people)', confidence: 0.9 },
      { label: 'Issue', value: 'Mains supply contamination', confidence: 0.94 },
      { label: 'Vulnerable', value: '5 infants, 9 elderly residents', confidence: 0.82 },
    ],
    timeline: [
      ev('e421-1', 95, 'submitted', 'Report submitted', 'Submitted via web form. Block and household count confirmed by resident.', 'Ramesh Adhikari', 'reporter', ['Web form']),
      ev('e421-2', 93, 'triage', 'AI triage completed', 'Waterborne illness risk. Priority HIGH. Public health notified.', 'FLARE Triage Engine v4.2', 'system', ['Confidence 90%']),
      ev('e421-3', 90, 'triage', 'Routed to Relief Logistics & Supply', 'Distribution manifest created: 220 L bottled water, 300 purification tablets.', 'Logistics Control', 'department'),
      ev('e421-4', 80, 'dispatched', 'Logistics Bravo-5 dispatched', 'Two vehicles dispatched from the Balaju depot with pallets.', 'Logistics Control', 'department', ['2 vehicles']),
      ev('e421-5', 60, 'on-site', 'Distribution underway', 'Door-to-door distribution started at block 1. Guards and water scheduled next.', 'Logistics Bravo-5', 'responder', ['22 households']),
      ev('e421-6', 52, 'on-site', 'Resupply requested', 'Additional 400 tablets requested to cover blocks 5–9.', 'Logistics Bravo-5', 'responder'),
    ],
  },
  {
    id: '422',
    title: 'Downed power line across the Baneshwor main road',
    summary:
      'Live power line down across the road, sparking intermittently. Traffic cannot pass. Roughly 300 m of road affected.',
    category: 'infrastructure',
    priority: 'high',
    departmentId: 'dept-fire',
    reporterName: 'Bishal Thapa',
    createdAt: ts(140),
    updatedAt: ts(120),
    currentStage: 'resolved',
    stageTimestamps: {
      submitted: ts(140),
      triage: ts(139),
      dispatched: ts(134),
      'on-site': ts(128),
      resolved: ts(120),
    },
    location: {
      label: 'Baneshwor main road, near Koteshwor Chowk',
      area: 'Koteshwor, Kathmandu',
      lat: 27.686,
      lng: 85.341,
      landmark: 'Between the pharmacy and the teashop',
    },
    peopleAffected: 0,
    vulnerability: ['Electrical hazard', 'Traffic disruption'],
    contactPreference: 'none',
    responder: {
      name: 'Fire Crew Echo-3',
      unit: 'Fire & Hazard Mitigation',
      callSign: 'ECHO-3',
      certifications: ['Electrical Isolation', 'Road Closure', 'Hazmat'],
    },
    channel: 'sos',
    extracted: [
      { label: 'Hazard', value: 'Live downed power line, arcing', confidence: 0.97 },
      { label: 'Extent', value: '~300 m of roadway', confidence: 0.79 },
      { label: 'Injuries', value: 'None reported', confidence: 0.86 },
    ],
    timeline: [
      ev('e422-1', 140, 'submitted', 'SOS report submitted', 'One-tap SOS triggered. Location sent instantly to the nearest unit.', 'Bishal Thapa', 'reporter', ['SOS', '1 tap']),
      ev('e422-2', 139, 'triage', 'AI triage completed', 'Confirmed arcing conductor. Priority HIGH. Public warned within 400 m.', 'FLARE Triage Engine v4.2', 'system', ['Confidence 97%']),
      ev('e422-3', 139, 'triage', 'Routed to Fire & Hazard Mitigation', 'Utility company co-notified, isolation crew requested.', 'Fire Dispatch', 'department'),
      ev('e422-4', 134, 'dispatched', 'Fire Crew Echo-3 dispatched', 'Crew en route with isolation equipment and road-closure kit.', 'Fire Dispatch', 'department', ['ETA 6 min']),
      ev('e422-5', 128, 'on-site', 'Hazard secured', 'Road closed both directions, line de-energised, perimeter set.', 'Fire Crew Echo-3', 'responder', ['De-energised']),
      ev('e422-6', 120, 'resolved', 'Hazard cleared', 'Line cut and removed. Road reopened. Reporter notified of resolution.', 'Fire Crew Echo-3', 'responder', ['Reopened']),
    ],
  },
  {
    id: '423',
    title: 'Wheelchair user stranded — stairwell, no lift',
    summary:
      'Wheelchair user on the 4th floor with no working lift. Needs a stair-carry team to bring her down to the ground-floor medical tent.',
    category: 'evacuation',
    priority: 'high',
    departmentId: 'dept-medical',
    reporterName: 'Nabin Lama',
    createdAt: ts(180),
    updatedAt: ts(150),
    currentStage: 'resolved',
    stageTimestamps: {
      submitted: ts(180),
      triage: ts(178),
      dispatched: ts(172),
      'on-site': ts(160),
      resolved: ts(150),
    },
    location: {
      label: 'Jhamsikhel Heights, Block A',
      area: 'Jhamsikhel, Lalitpur',
      lat: 27.678,
      lng: 85.316,
      landmark: 'Staff entrance, ask for the concierge',
    },
    peopleAffected: 1,
    vulnerability: ['Wheelchair user', '4th floor', 'No working lift'],
    contactPreference: 'sms',
    responder: {
      name: 'Medic Alpha-9',
      unit: 'EMS Patient Handling',
      callSign: 'ALPHA-9',
      certifications: ['Stair Chair', 'Bariatric Transfer', 'ALS'],
    },
    channel: 'chat',
    extracted: [
      { label: 'Mobility', value: 'Manual wheelchair, non-ambulatory', confidence: 0.97 },
      { label: 'Floor', value: '4th, lift out of service', confidence: 0.99 },
      { label: 'Destination', value: 'Ground-floor medical tent', confidence: 0.9 },
    ],
    timeline: [
      ev('e423-1', 180, 'submitted', 'Report submitted', 'Submitted via AI Relief Assistant chat.', 'Nabin Lama', 'reporter', ['Chat']),
      ev('e423-2', 178, 'triage', 'AI triage completed', 'Non-ambulatory resident requiring assisted descent. Priority HIGH.', 'FLARE Triage Engine v4.2', 'system', ['Confidence 95%']),
      ev('e423-3', 178, 'triage', 'Routed to Emergency Medical Services', 'Stair-chair team assigned from the Patan ambulance post.', 'EMS Dispatch', 'department'),
      ev('e423-4', 172, 'dispatched', 'Medic Alpha-9 dispatched', 'Crew en route with stair chair and two-person transfer team.', 'EMS Dispatch', 'department', ['ETA 8 min']),
      ev('e423-5', 160, 'on-site', 'Assisted descent completed', 'Resident secured in stair chair and moved to ground floor safely.', 'Medic Alpha-9', 'responder'),
      ev('e423-6', 150, 'resolved', 'Assistance completed', 'Resident handed over to the medical tent team. Request closed by reporter.', 'Medic Alpha-9', 'responder', ['Closed']),
    ],
  },
  {
    id: '424',
    title: 'Inhalation injury — Bag Bazaar bakery',
    summary:
      'Baker inhaled smoke after a kitchen fire, complaining of a sore throat and nausea. Wants to be checked but is anxious about hospitals.',
    category: 'medical',
    priority: 'medium',
    departmentId: 'dept-medical',
    reporterName: 'Sunita Rai',
    createdAt: ts(210),
    updatedAt: ts(196),
    currentStage: 'triage',
    stageTimestamps: {
      submitted: ts(210),
      triage: ts(208),
    },
    location: {
      label: 'Gorkha Bakery, 88 Bag Bazaar',
      area: 'Bag Bazaar, Kathmandu',
      lat: 27.704,
      lng: 85.329,
      landmark: 'Blue awning, next to the hardware store',
    },
    peopleAffected: 1,
    vulnerability: ['Smoke inhalation', 'Anxiety about hospitals', 'Lives alone'],
    contactPreference: 'sms',
    channel: 'web',
    extracted: [
      { label: 'Symptoms', value: 'Sore throat, nausea, mild cough', confidence: 0.88 },
      { label: 'Exposure', value: 'Kitchen fire, ~15 min smoke', confidence: 0.86 },
      { label: 'Barriers', value: 'Anxious about hospital visits', confidence: 0.94 },
    ],
    timeline: [
      ev('e424-1', 210, 'submitted', 'Report submitted', 'Submitted via web form with voice note attached.', 'Sunita Rai', 'reporter', ['Web form', 'Voice note']),
      ev('e424-2', 208, 'triage', 'AI triage completed', 'Smoke inhalation, symptoms stable. Priority MEDIUM. Out-of-hospital assessment offered.', 'FLARE Triage Engine v4.2', 'system', ['Confidence 88%', 'Home visit offered']),
      ev('e424-3', 208, 'triage', 'Routed to Emergency Medical Services', 'Nearest unit identified. Patient preference for home visit recorded.', 'EMS Dispatch', 'department'),
      ev('e424-4', 196, 'triage', 'Awaiting crew assignment', 'Non-urgent. Next available unit assigned within the 2-hour SLA.', 'EMS Dispatch', 'department', ['SLA 2h']),
    ],
  },
  {
    id: '425',
    title: 'Requesting medication refills — Tudan',
    summary:
      'Pharmacy closed with no access to regular medication. Three residents out of refills: insulin, epilepsy tablets, and blood thinners.',
    category: 'medical',
    priority: 'medium',
    departmentId: 'dept-logistics',
    reporterName: 'Prakash Karki',
    createdAt: ts(240),
    updatedAt: ts(228),
    currentStage: 'submitted',
    stageTimestamps: {
      submitted: ts(240),
    },
    location: {
      label: 'Tudan Health Post',
      area: 'Tudan, Lalitpur',
      lat: 27.68,
      lng: 85.312,
      landmark: 'Clinic reception',
    },
    peopleAffected: 3,
    vulnerability: ['Insulin dependent', 'Epilepsy', 'Anticoagulants'],
    contactPreference: 'sms',
    channel: 'chat',
    extracted: [
      { label: 'Medications', value: 'Insulin, antiepileptics, anticoagulants', confidence: 0.96 },
      { label: 'Patients', value: '3', confidence: 0.98 },
      { label: 'Urgency', value: 'Within 48 hours', confidence: 0.8 },
    ],
    timeline: [
      ev('e425-1', 240, 'submitted', 'Report submitted', 'Submitted via AI Relief Assistant chat. Medication list extracted from conversation.', 'Prakash Karki', 'reporter', ['Chat', '3 patients']),
      ev('e425-2', 228, 'submitted', 'Awaiting AI triage', 'Request queued. Medication matching against regional stock in progress.', 'FLARE Triage Engine v4.2', 'system', ['Queued']),
    ],
  },
];

export function getReport(id: string): Report | undefined {
  return REPORTS.find((r) => r.id === id);
}

export function reportsNeedingAttention(reports: Report[] = REPORTS): Report[] {
  return reports.filter((r) => r.currentStage !== 'resolved');
}

export function activeReports(reports: Report[] = REPORTS): Report[] {
  return reports.filter((r) => r.currentStage !== 'resolved');
}

/* ------------------------------------------------------------------ *
 * Dashboard statistics
 * ------------------------------------------------------------------ */

export const DASHBOARD_STATS: DashboardStat[] = [
  {
    id: 'total',
    label: 'Total Reports',
    value: 1284,
    delta: 12.4,
    deltaLabel: 'vs. last 24h',
    icon: FileStackIcon,
    tone: 'navy',
    spark: [18, 24, 21, 30, 28, 36, 33, 44, 41, 52, 48, 61],
    href: '/reports',
  },
  {
    id: 'review',
    label: 'Under Review',
    value: 37,
    delta: -8.1,
    deltaLabel: 'triage queue',
    icon: ScanSearch,
    tone: 'alert',
    spark: [62, 58, 60, 52, 55, 48, 44, 46, 40, 38, 39, 37],
    href: '/dashboard?filter=review',
  },
  {
    id: 'dispatched',
    label: 'Dispatched',
    value: 118,
    delta: 26.0,
    deltaLabel: 'crews en route',
    icon: Siren,
    tone: 'dispatch',
    spark: [12, 18, 16, 24, 30, 28, 36, 44, 48, 52, 60, 68],
    href: '/dashboard?filter=dispatched',
  },
  {
    id: 'resolved',
    label: 'Resolved',
    value: 1129,
    delta: 9.7,
    deltaLabel: 'last 24h',
    icon: CheckCircle2,
    tone: 'relief',
    spark: [30, 38, 44, 42, 52, 58, 62, 68, 72, 78, 84, 92],
    href: '/dashboard?filter=resolved',
  },
];

/* ------------------------------------------------------------------ *
 * Triage feed (live routing activity)
 * ------------------------------------------------------------------ */

export interface TriageEvent {
  id: string;
  at: string;
  reportId: string;
  message: string;
  departmentId: string;
  confidence: number;
}

export const TRIAGE_FEED: TriageEvent[] = [
  {
    id: 'tf-1',
    at: ts(2),
    reportId: '418',
    message: 'Oxygen therapy need detected in live call',
    departmentId: 'dept-medical',
    confidence: 0.94,
  },
  {
    id: 'tf-2',
    at: ts(4),
    reportId: '420',
    message: 'Child near open water — amber alert raised',
    departmentId: 'dept-sar',
    confidence: 0.99,
  },
  {
    id: 'tf-3',
    at: ts(9),
    reportId: '417',
    message: 'Rising-water deadline detected, escalation issued',
    departmentId: 'dept-sar',
    confidence: 0.97,
  },
  {
    id: 'tf-4',
    at: ts(20),
    reportId: '419',
    message: 'Minors in household — safeguarding check added',
    departmentId: 'dept-shelter',
    confidence: 0.96,
  },
];

/* ------------------------------------------------------------------ *
 * Assistant conversation
 * ------------------------------------------------------------------ */

/**
 * The transcript and the action cards both start **empty**.
 *
 * There used to be a seeded conversation here: a family trapped at Fairmount
 * Apartments and an oxygen concentrator destroyed for a neighbour called Mr.
 * Whitfield, each closing with an "Information Captured" card already reading
 * "Dispatched to USAR" or "Dispatched to EMS". A visitor opened `/chat`, saw a
 * finished emergency that never happened, and no way to tell it from their own.
 *
 * It was not only misleading, it was structurally wrong in three ways:
 *
 * 1. Every card rendered `status: 'confirmed'`, so the app asserted a dispatch
 *    nobody made. The only writer of a real dispatch is a human pressing
 *    "Confirm & dispatch" (`confirmActionCard`), and nothing had.
 * 2. Each card named a real department with its real crew count and ETA, so a
 *    fictional incident borrowed the credibility of live capacity numbers.
 * 3. Nothing in the app knows when a crew will arrive, so a seeded turn may
 *    never state that one is. The removed seed ended with exactly that claim —
 *    "the rescue crew is about 6 minutes away" — and it had to be cut.
 *
 * The scripted replies below still exist for the offline fallback path, and
 * they may create a card. What they may not do is present one as already
 * dispatched: `sendMessage` builds those as `status: 'pending'`, which is the
 * only state that asks the reporter to confirm.
 */

/**
 * Scripted assistant replies. Each entry can emit an action card, so the
 * demo can be driven end-to-end without a backend.
 */
export interface ScriptedReply {
  match: RegExp;
  text: string;
  confidence: number;
  actionCard?: Omit<ActionCard, 'id' | 'createdAt' | 'status'>;
}

export const SCRIPTED_REPLIES: ScriptedReply[] = [
  {
    match: /\b(trapped|stuck|buried|collapsed|pinned)\b/i,
    text: 'I am on it. Please move away from any unstable structure and keep your phone to hand. I am routing this to Urban Search & Rescue as a critical rescue — I just need the exact address and how many people need help.',
    confidence: 0.95,
    actionCard: {
      kind: 'capture',
      title: 'Information Captured',
      headline: 'Trapped persons detected — routing to Urban Search & Rescue',
      departmentId: 'dept-sar',
      confidence: 0.95,
      fields: [
        { label: 'Location', value: 'Confirming precise address…' },
        { label: 'People affected', value: 'Being confirmed' },
        { label: 'Access notes', value: 'Captured from conversation' },
      ],
    },
  },
  {
    match: /\b(blood|bleeding|unconscious|not breathing|chest pain|heart|seizure)\b/i,
    text: 'This needs an ambulance right now. Call 102 for an ambulance if you are able while I dispatch. Stay with the person, keep them still and warm, and do not give food or drink.',
    confidence: 0.99,
    actionCard: {
      kind: 'dispatch',
      title: 'Information Captured',
      headline: 'Life-threatening symptoms — routing to Emergency Medical Services',
      departmentId: 'dept-medical',
      confidence: 0.99,
      fields: [
        { label: 'Condition', value: 'Critical symptoms reported' },
        { label: 'Priority', value: 'CRITICAL — 8 minute response target' },
        { label: 'People affected', value: '1+ reported' },
      ],
    },
  },
  {
    match: /\b(shelter|sleep|temporary housing|no place|homeless|evacuate|evacuation)\b/i,
    text: 'I can arrange a safe place for you tonight. I am checking the nearest shelter with space. Do you have children, elderly relatives, or anyone who needs medical support?',
    confidence: 0.93,
    actionCard: {
      kind: 'capture',
      title: 'Information Captured',
      headline: 'Shelter need detected — checking available accommodation',
      departmentId: 'dept-shelter',
      confidence: 0.93,
      fields: [
        { label: 'Need', value: 'Emergency accommodation' },
        { label: 'Household', value: 'Being confirmed' },
        { label: 'Beds requested', value: '1+' },
      ],
    },
  },
  {
    match: /\b(water|food|hungry|thirst|eat|supplies|ration)\b/i,
    text: 'I am arranging food and safe drinking water. Is this for your household only, or for your whole block? Roughly how many people?',
    confidence: 0.94,
    actionCard: {
      kind: 'capture',
      title: 'Information Captured',
      headline: 'Food & water request — routing to Relief Logistics',
      departmentId: 'dept-logistics',
      confidence: 0.94,
      fields: [
        { label: 'Request', value: 'Food and/or clean drinking water' },
        { label: 'Household size', value: 'Being confirmed' },
        { label: 'Vulnerable members', value: 'Being confirmed' },
      ],
    },
  },
  {
    match: /\b(missing|child|disappeared|can't find|vanished)\b/i,
    text: 'I am treating this as a missing person report. What is their name, age, what were they wearing, and where did you last see them? I have already alerted the search team.',
    confidence: 0.98,
    actionCard: {
      kind: 'dispatch',
      title: 'Information Captured',
      headline: 'Missing person — amber alert protocol started',
      departmentId: 'dept-sar',
      confidence: 0.98,
      fields: [
        { label: 'Person', value: 'Details being confirmed' },
        { label: 'Last known location', value: 'Pinned from your device' },
        { label: 'Protocol', value: 'Amber alert — valley-wide search grid' },
      ],
    },
  },
  {
    match: /\b(gas|smoke|fire|spark|wire|electric|flood|leak)\b/i,
    text: 'Please move away from that hazard and keep other people back. I am alerting the fire and hazard team now, and warning everyone within 400 metres.',
    confidence: 0.96,
    actionCard: {
      kind: 'dispatch',
      title: 'Information Captured',
      headline: 'Infrastructure hazard — Fire & Hazard team alerted',
      departmentId: 'dept-fire',
      confidence: 0.96,
      fields: [
        { label: 'Hazard', value: 'Reported hazard' },
        { label: 'Perimeter', value: '400 m warning issued' },
        { label: 'Injuries', value: 'None reported' },
      ],
    },
  },
];

export const DEFAULT_REPLY = {
  text: "Thank you — I have that. I am recording the details and passing them to the response team now. Can you confirm the exact location, how many people are affected, and whether anyone needs medical care? If this is an immediate threat to life, press the red SOS button at the bottom of the screen and we will alert the nearest crew instantly.",
  confidence: 0.88,
};

/**
 * Idle-state prompts for the voice tab.
 *
 * The hands-free entry that used to sit at index 1 is gone, and the two "I am
 * listening" copies collapsed into one. It told people to "say help at any time
 * to wake the assistant", which was never true of anything but the old
 * simulation — the Live session runs server-side voice activity detection with
 * no wake word, so the microphone simply always hears them. Copy that promises
 * a phrase the service does not listen for is worse than no copy.
 */
export const VOICE_PROMPTS = [
  'Say or tap what you need — "we are trapped", "someone cannot breathe", "we need shelter".',
  'I am listening. Speak naturally — I will confirm the address before dispatching.',
] as const;
