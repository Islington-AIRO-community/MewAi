import type { LucideIcon } from 'lucide-react';
import {
  Ambulance,
  Brain,
  Building2,
  CheckCircle2,
  Droplets,
  FileCheck,
  Flame,
  HeartPulse,
  Home,
  LifeBuoy,
  Search,
  Siren,
  Soup,
  Users,
  Wind,
} from 'lucide-react';

/* ------------------------------------------------------------------ *
 * Report categories
 * ------------------------------------------------------------------ */

export type CategoryId =
  | 'medical'
  | 'shelter'
  | 'food-water'
  | 'search-rescue'
  | 'infrastructure'
  | 'missing-person'
  | 'evacuation';

export interface CategoryMeta {
  id: CategoryId;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  /** Tailwind classes for icon chip */
  chip: string;
  description: string;
  /** Default owning department */
  defaultDepartmentId: string;
}

export const CATEGORIES: Record<CategoryId, CategoryMeta> = {
  medical: {
    id: 'medical',
    label: 'Medical Emergency',
    shortLabel: 'Medical',
    icon: HeartPulse,
    chip: 'bg-emergency-50 text-emergency-700 ring-emergency-200',
    description: 'Injuries, acute illness, medication or oxygen needs',
    defaultDepartmentId: 'dept-medical',
  },
  shelter: {
    id: 'shelter',
    label: 'Shelter Request',
    shortLabel: 'Shelter',
    icon: Home,
    chip: 'bg-dispatch-50 text-dispatch-700 ring-dispatch-200',
    description: 'Safe accommodation, blankets, temporary housing',
    defaultDepartmentId: 'dept-shelter',
  },
  'food-water': {
    id: 'food-water',
    label: 'Food & Water',
    shortLabel: 'Food/Water',
    icon: Droplets,
    chip: 'bg-alert-50 text-alert-700 ring-alert-200',
    description: 'Clean drinking water, food rations, infant supplies',
    defaultDepartmentId: 'dept-logistics',
  },
  'search-rescue': {
    id: 'search-rescue',
    label: 'Search & Rescue',
    shortLabel: 'SAR',
    icon: Search,
    chip: 'bg-navy-100 text-navy-700 ring-navy-200',
    description: 'Trapped persons, structural collapse, swift-water rescue',
    defaultDepartmentId: 'dept-sar',
  },
  infrastructure: {
    id: 'infrastructure',
    label: 'Infrastructure Hazard',
    shortLabel: 'Hazard',
    icon: Wind,
    chip: 'bg-alert-50 text-alert-700 ring-alert-200',
    description: 'Gas leaks, downed lines, fire risk, unstable structures',
    defaultDepartmentId: 'dept-fire',
  },
  'missing-person': {
    id: 'missing-person',
    label: 'Missing Person',
    shortLabel: 'Missing',
    icon: Users,
    chip: 'bg-navy-100 text-navy-700 ring-navy-200',
    description: 'Unaccounted residents, vulnerable people, children',
    defaultDepartmentId: 'dept-sar',
  },
  evacuation: {
    id: 'evacuation',
    label: 'Evacuation Assistance',
    shortLabel: 'Evacuation',
    icon: LifeBuoy,
    chip: 'bg-dispatch-50 text-dispatch-700 ring-dispatch-200',
    description: 'Route guidance and transport out of an unsafe zone',
    defaultDepartmentId: 'dept-sar',
  },
};

export const CATEGORY_LIST = Object.values(CATEGORIES);

/* ------------------------------------------------------------------ *
 * Priority
 * ------------------------------------------------------------------ */

export type Priority = 'critical' | 'high' | 'medium' | 'low';

export interface PriorityMeta {
  id: Priority;
  label: string;
  chip: string;
  dot: string;
  bar: string;
  /** Response SLA in minutes — shown in the UI as an accountability promise. */
  slaMinutes: number;
  description: string;
}

export const PRIORITIES: Record<Priority, PriorityMeta> = {
  critical: {
    id: 'critical',
    label: 'Critical',
    chip: 'bg-emergency-500 text-white ring-emergency-600',
    dot: 'bg-emergency-500',
    bar: 'bg-emergency-500',
    slaMinutes: 8,
    description: 'Life in immediate danger. Immediate dispatch.',
  },
  high: {
    id: 'high',
    label: 'High',
    chip: 'bg-alert-100 text-alert-800 ring-alert-300',
    dot: 'bg-alert-500',
    bar: 'bg-alert-500',
    slaMinutes: 30,
    description: 'Urgent. Dispatched within the hour.',
  },
  medium: {
    id: 'medium',
    label: 'Medium',
    chip: 'bg-dispatch-100 text-dispatch-800 ring-dispatch-300',
    dot: 'bg-dispatch-500',
    bar: 'bg-dispatch-500',
    slaMinutes: 120,
    description: 'Stabilised situation. Scheduled response.',
  },
  low: {
    id: 'low',
    label: 'Low',
    chip: 'bg-navy-100 text-navy-700 ring-navy-200',
    dot: 'bg-navy-400',
    bar: 'bg-navy-400',
    slaMinutes: 1440,
    description: 'Logged for the next available crew.',
  },
};

export const PRIORITY_LIST: PriorityMeta[] = [
  PRIORITIES.critical,
  PRIORITIES.high,
  PRIORITIES.medium,
  PRIORITIES.low,
];

/* ------------------------------------------------------------------ *
 * Report lifecycle (progress stepper)
 * ------------------------------------------------------------------ */

export type StageId =
  | 'submitted'
  | 'triage'
  | 'dispatched'
  | 'on-site'
  | 'resolved';

export interface StageMeta {
  id: StageId;
  label: string;
  short: string;
  description: string;
  icon: LucideIcon;
}

export const STAGES: StageMeta[] = [
  {
    id: 'submitted',
    label: 'Report Submitted',
    short: 'Submitted',
    description: 'Request received and geotagged by FLARE.',
    icon: FileCheck,
  },
  {
    id: 'triage',
    label: 'AI Triage & Department Assigned',
    short: 'Triage',
    description: 'Routed to the correct response team with a priority set.',
    icon: Brain,
  },
  {
    id: 'dispatched',
    label: 'First Responders Dispatched',
    short: 'Dispatched',
    description: 'Nearest available crew en route with ETA.',
    icon: Siren,
  },
  {
    id: 'on-site',
    label: 'On-Site Assistance',
    short: 'On site',
    description: 'Crew has arrived and is providing aid.',
    icon: Ambulance,
  },
  {
    id: 'resolved',
    label: 'Resolved',
    short: 'Resolved',
    description: 'Assistance completed and confirmed by the reporter.',
    icon: CheckCircle2,
  },
];

export const STAGE_IDS: StageId[] = STAGES.map((s) => s.id);

/* ------------------------------------------------------------------ *
 * Departments (routing targets surfaced by the AI assistant)
 * ------------------------------------------------------------------ */

export type DepartmentStatus = 'available' | 'strained' | 'overloaded' | 'offline';

export interface Department {
  id: string;
  name: string;
  shortName: string;
  icon: LucideIcon;
  status: DepartmentStatus;
  statusLabel: string;
  crewsAvailable: number;
  crewsTotal: number;
  avgResponseMinutes: number;
  phone: string;
  coverage: string;
  color: string;
}

export const DEPARTMENTS: Department[] = [
  {
    id: 'dept-medical',
    name: 'Emergency Medical Services',
    shortName: 'EMS',
    icon: Ambulance,
    status: 'strained',
    statusLabel: 'Strained',
    crewsAvailable: 3,
    crewsTotal: 9,
    avgResponseMinutes: 11,
    phone: '+1 (555) 011-4410',
    coverage: 'Northbank, Eastvale, Ridgeway',
    color: 'emergency',
  },
  {
    id: 'dept-sar',
    name: 'Urban Search & Rescue',
    shortName: 'USAR',
    icon: Search,
    status: 'available',
    statusLabel: 'Available',
    crewsAvailable: 6,
    crewsTotal: 8,
    avgResponseMinutes: 8,
    phone: '+1 (555) 011-7732',
    coverage: 'City-wide',
    color: 'dispatch',
  },
  {
    id: 'dept-shelter',
    name: 'Emergency Shelter & Housing',
    shortName: 'Shelter',
    icon: Building2,
    status: 'available',
    statusLabel: 'Available',
    crewsAvailable: 11,
    crewsTotal: 14,
    avgResponseMinutes: 22,
    phone: '+1 (555) 011-2290',
    coverage: 'Northbank, Hillcrest, Old Mill',
    color: 'relief',
  },
  {
    id: 'dept-logistics',
    name: 'Relief Logistics & Supply',
    shortName: 'Logistics',
    icon: Soup,
    status: 'available',
    statusLabel: 'Available',
    crewsAvailable: 8,
    crewsTotal: 10,
    avgResponseMinutes: 34,
    phone: '+1 (555) 011-8865',
    coverage: 'All districts',
    color: 'alert',
  },
  {
    id: 'dept-fire',
    name: 'Fire & Hazard Mitigation',
    shortName: 'Fire',
    icon: Flame,
    status: 'overloaded',
    statusLabel: 'Overloaded',
    crewsAvailable: 1,
    crewsTotal: 7,
    avgResponseMinutes: 26,
    phone: '+1 (555) 011-0919',
    coverage: 'Eastvale industrial belt',
    color: 'emergency',
  },
];

export function getDepartment(id: string): Department {
  return DEPARTMENTS.find((d) => d.id === id) ?? DEPARTMENTS[0];
}

export const DEPARTMENT_STATUS_STYLES: Record<
  DepartmentStatus,
  { chip: string; dot: string }
> = {
  available: { chip: 'bg-relief-50 text-relief-700 ring-relief-200', dot: 'bg-relief-500' },
  strained: { chip: 'bg-alert-50 text-alert-800 ring-alert-200', dot: 'bg-alert-500' },
  overloaded: {
    chip: 'bg-emergency-50 text-emergency-700 ring-emergency-200',
    dot: 'bg-emergency-500',
  },
  offline: { chip: 'bg-navy-100 text-navy-600 ring-navy-200', dot: 'bg-navy-400' },
};

/* ------------------------------------------------------------------ *
 * Reports
 * ------------------------------------------------------------------ */

export interface TimelineEvent {
  id: string;
  at: string;
  stageId: StageId;
  title: string;
  detail: string;
  actor: string;
  actorRole: 'system' | 'reporter' | 'department' | 'responder';
  /** Optional notable flags rendered as pills */
  tags?: string[];
}

export interface Responder {
  name: string;
  unit: string;
  callSign: string;
  etaMinutes?: number;
  certifications: string[];
}

export interface Report {
  id: string;
  title: string;
  summary: string;
  category: CategoryId;
  priority: Priority;
  departmentId: string;
  reporterName: string;
  createdAt: string;
  updatedAt: string;
  currentStage: StageId;
  /** Stage completion timestamps; index aligns with STAGE_IDS. */
  stageTimestamps: Partial<Record<StageId, string>>;
  location: {
    label: string;
    area: string;
    lat: number;
    lng: number;
    landmark: string;
  };
  peopleAffected: number;
  vulnerability: string[];
  contactPreference: 'sms' | 'call' | 'none';
  responder?: Responder;
  timeline: TimelineEvent[];
  /** Extra structured extraction from the AI assistant. */
  extracted: { label: string; value: string; confidence: number }[];
  channel: 'voice' | 'chat' | 'sos' | 'web';
  etaMinutes?: number;
}

export const PRIORITY_ORDER: Priority[] = ['critical', 'high', 'medium', 'low'];

/* ------------------------------------------------------------------ *
 * Chat / assistant
 * ------------------------------------------------------------------ */

export type ChatRole = 'user' | 'assistant' | 'system';

export type ExtractedIntent =
  | 'medical'
  | 'shelter'
  | 'food-water'
  | 'search-rescue'
  | 'missing-person'
  | 'evacuation'
  | 'infrastructure';

export interface ActionCard {
  id: string;
  kind: 'capture' | 'dispatch' | 'resolved' | 'escalate';
  title: string;
  headline: string;
  departmentId: string;
  confidence: number;
  fields: { label: string; value: string }[];
  createdAt: string;
  status: 'pending' | 'confirmed' | 'dismissed';
  /** When confirmed, the report created by this card. */
  reportId?: string;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  at: string;
  /** Present on assistant messages that produced an action card. */
  actionCardId?: string;
  /** Voice-origin messages are marked for the transcript view. */
  viaVoice?: boolean;
  /** Streaming placeholder */
  pending?: boolean;
  /** Confidence of the intent extraction, 0–1 */
  confidence?: number;
}

export type VoiceState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'muted' | 'error';

/* ------------------------------------------------------------------ *
 * Stats
 * ------------------------------------------------------------------ */

export interface DashboardStat {
  id: string;
  label: string;
  value: number;
  delta: number;
  deltaLabel: string;
  icon: LucideIcon;
  tone: 'navy' | 'emergency' | 'alert' | 'dispatch' | 'relief';
  spark: number[];
  href?: string;
}

export const STAT_TONES: Record<
  DashboardStat['tone'],
  { chip: string; text: string; bar: string; spark: string }
> = {
  navy: { chip: 'bg-navy-100 text-navy-700', text: 'text-navy-700', bar: 'bg-navy-700', spark: 'fill-navy-700/10 stroke-navy-700' },
  emergency: {
    chip: 'bg-emergency-50 text-emergency-700',
    text: 'text-emergency-600',
    bar: 'bg-emergency-500',
    spark: 'fill-emergency-500/10 stroke-emergency-600',
  },
  alert: {
    chip: 'bg-alert-50 text-alert-700',
    text: 'text-alert-600',
    bar: 'bg-alert-500',
    spark: 'fill-alert-500/10 stroke-alert-600',
  },
  dispatch: {
    chip: 'bg-dispatch-50 text-dispatch-700',
    text: 'text-dispatch-600',
    bar: 'bg-dispatch-500',
    spark: 'fill-dispatch-500/10 stroke-dispatch-600',
  },
  relief: {
    chip: 'bg-relief-50 text-relief-700',
    text: 'text-relief-600',
    bar: 'bg-relief-500',
    spark: 'fill-relief-500/10 stroke-relief-600',
  },
};

/* ------------------------------------------------------------------ *
 * System status
 * ------------------------------------------------------------------ */

export type SystemMode = 'operational' | 'relief' | 'degraded' | 'offline';

export interface SystemStatus {
  mode: SystemMode;
  label: string;
  detail: string;
  updatedAt: string;
  region: string;
  activeResponders: number;
  openIncidents: number;
}

export const SYSTEM_STATUS: SystemStatus = {
  mode: 'relief',
  label: 'Live Relief Mode',
  detail: 'All relief systems operational. Emergency routing active.',
  updatedAt: '2026-09-26T05:41:00.000Z',
  region: 'Northbank Region · Sector 4',
  activeResponders: 148,
  openIncidents: 3,
};

/* ------------------------------------------------------------------ *
 * Re-exports for icon convenience in mock data
 * ------------------------------------------------------------------ */

export const CATEGORY_ICON_EXPORT = {
  Ambulance,
  Building2,
  Droplets,
  Flame,
  HeartPulse,
  Home,
  LifeBuoy,
  Search,
  Siren,
  Soup,
  Users,
  Wind,
};
