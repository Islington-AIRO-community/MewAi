import type { LucideIcon } from 'lucide-react';
import { Ambulance, Building2, Flame, Search, Shield, Soup } from 'lucide-react';

/* ------------------------------------------------------------------ *
 * National emergency numbers (Nepal)
 *
 * Short codes and landlines for the desks a person can reach without
 * FLARE. They are the fallback for the one case the app cannot serve:
 * no signal, no data, or no account. Nothing here is a mock — a wrong
 * number in this list is a call that does not get answered, so the
 * entries are the published ones and are kept verbatim, spacing and
 * punctuation included.
 *
 * The six groups mirror `DEPARTMENTS` in `types.ts` on purpose: the same
 * six kinds of help, split the same way, so "which desk do I need" is
 * the same question everywhere in the app.
 * ------------------------------------------------------------------ */

export interface EmergencyLine {
  /** The desk, as its own switchboard would answer. */
  name: string;
  /**
   * Nepali name, for the Nepali locale. Optional, not required: an entry
   * without one falls back to the English name above, which is the stated
   * policy for every untranslated string in the app. It sits next to the
   * English rather than in a parallel table so a reviewer can check the two
   * against each other — the failure mode for a phone list is a Nepali line
   * that points at the wrong desk, and that is caught by reading, not by a type.
   */
  ne?: string;
  /**
   * Dials for one desk. Several entries have a short code *and* a landline,
   * or a landline per district; each is rendered as its own tap target
   * because they are genuinely different routes to the same place.
   */
  numbers: string[];
}

export interface EmergencyGroup {
  id: string;
  label: string;
  neLabel?: string;
  icon: LucideIcon;
  /** One line on when this group is the right one to call. */
  hint: string;
  neHint?: string;
  lines: EmergencyLine[];
}

/**
 * A number as a `tel:` href.
 *
 * The display string is what the caller reads, so it keeps the spacing and
 * the `+977-1-` prefix a person recognises from a printed card. Dial strings
 * cannot: `tel:+977-1-5370650` dials nothing on most handsets, so
 * punctuation is stripped and the `+` is kept, since it is what tells the
 * dialler this is an international number.
 */
export function telHref(number: string): string {
  return `tel:${number.replace(/[^\d+]/g, '')}`;
}

export const EMERGENCY_GROUPS: EmergencyGroup[] = [
  {
    id: 'ems',
    label: 'Emergency Medical Services',
    neLabel: 'आपतकालीन चिकित्सा सेवा',
    icon: Ambulance,
    hint: 'Injury, sudden illness, ambulance transport',
    neHint: 'चोट, अचानक बिरामी, एम्बुलेन्स ओसारपोसार',
    lines: [
      {
        name: 'National Ambulance Hotline',
        ne: 'राष्ट्रिय एम्बुलेन्स हटलाइन',
        numbers: ['102'],
      },
      {
        name: 'Ministry of Health Emergency Operation Center (HEOC)',
        ne: 'स्वास्थ्य मन्त्रालय आपतकालीन सञ्चालन केन्द्र (HEOC)',
        numbers: ['1115'],
      },
      {
        name: 'Nepal Red Cross Society Ambulance',
        ne: 'नेपाल रेडक्रस समाज एम्बुलेन्स',
        numbers: ['1130'],
      },
      {
        name: 'Nepal Red Cross Society Central Office, Kathmandu',
        ne: 'नेपाल रेडक्रस समाज केन्द्रीय कार्यालय, काठमाडौं',
        numbers: ['+977-1-5370650', '+977-1-5372761'],
      },
      {
        name: 'Poison Control Center, TUIOM Teaching Hospital',
        ne: 'विष नियन्त्रण केन्द्र, तृषभुवन शिक्षण अस्पताल',
        numbers: ['+977-1-4502011'],
      },
    ],
  },
  {
    id: 'usar',
    label: 'Urban Search & Rescue',
    neLabel: 'शहरी खोज तथा उद्धार',
    icon: Search,
    hint: 'Trapped, collapsed, stranded or cut off',
    neHint: 'जालिएको, भरिसकिएको, अलग वा छुट्टिएको',
    lines: [
      {
        name: 'Disaster Emergency Hotline (MoHA / NDRRMA)',
        ne: 'विपद आपतकालीन हटलाइन (गृह मन्त्रालय / NDRRMA)',
        numbers: ['1234'],
      },
      {
        name: 'Nepal Army Search & Rescue / Relief Hotline',
        ne: 'नेपाली सेना खोज तथा उद्धार / राहत हटलाइन',
        numbers: ['1191'],
      },
      {
        name: 'Armed Police Force (APF) Disaster Management',
        ne: 'सशस्त्र प्रहरी (APF) विपद व्यवस्थापन',
        numbers: ['1114'],
      },
      {
        name: 'National Disaster Risk Reduction & Management Authority (NDRRMA)',
        ne: 'राष्ट्रिय विपद जोखिम न्यूनीकरण तथा व्यवस्थापन प्राधिकरण (NDRRMA)',
        numbers: ['+977-1-4200105', '+977-1-4200257'],
      },
    ],
  },
  {
    id: 'shelter',
    label: 'Emergency Shelter & Housing',
    neLabel: 'आपतकालीन आश्रय तथा आवास',
    icon: Building2,
    hint: 'Nowhere safe to stay, blankets, temporary housing',
    neHint: 'सुरक्षित ठाउँ छैन, बल र लुगा, अस्थायी आवास',
    lines: [
      {
        name: 'National Emergency Operation Center (NEOC, MoHA)',
        ne: 'राष्ट्रिय आपतकालीन सञ्चालन केन्द्र (NEOC, गृह मन्त्रालय)',
        numbers: ['1234', '+977-1-4200105'],
      },
      {
        name: 'Nepal Red Cross Society (shelter & relief)',
        ne: 'नेपाल रेडक्रस समाज (आश्रय तथा राहत)',
        numbers: ['1130', '+977-1-5370650'],
      },
      {
        name: "Hello Sarkar, Prime Minister's Office hotline for escalation",
        ne: 'हेलो सरकार, प्रधानमन्त्री कार्यालयको हटलाइन (विवेदन माथि पुर्‍याउन)',
        numbers: ['1111'],
      },
    ],
  },
  {
    id: 'logistics',
    label: 'Relief Logistics & Supply',
    neLabel: 'राहत सामग्री तथा आपूर्ति',
    icon: Soup,
    hint: 'Food, water, blankets and other relief supplies',
    neHint: 'खाना, पानी, बल र अन्य राहत सामग्री',
    lines: [
      {
        name: 'Ministry of Home Affairs Disaster Response Unit (MoHA)',
        ne: 'गृह मन्त्रालय विपद प्रतिक्रिया इकाई (MoHA)',
        numbers: ['1112'],
      },
      {
        name: 'National Emergency Operation Center (NEOC)',
        ne: 'राष्ट्रिय आपतकालीन सञ्चालन केन्द्र (NEOC)',
        numbers: ['+977-1-4200105'],
      },
      {
        name: 'Department of Hydrology & Meteorology (flood & weather alerts)',
        ne: 'जलविज्ञान तथा मौसम विज्ञान विभाग (बाढी तथा मौसम चेतावनी)',
        numbers: ['1155'],
      },
    ],
  },
  {
    id: 'fire',
    label: 'Fire & Hazard Mitigation',
    neLabel: 'आगो तथा जोखिम न्यूनीकरण',
    icon: Flame,
    hint: 'Fire, gas leaks, downed power lines',
    neHint: 'आगो, ग्यास चुक्ने, झुलेका विद्युत केबल',
    lines: [
      {
        name: 'Fire Brigade Dispatch (national)',
        ne: 'राष्ट्रिय दमचल ब्रिगेड डिस्प्याच',
        numbers: ['101'],
      },
      {
        name: 'Kathmandu Fire Station (Juddha Barun Yantra)',
        ne: 'काठमाडौं दमचल स्टेशन (जुद्धबारुण यन्त्र)',
        numbers: ['+977-1-4221177'],
      },
      {
        name: 'Lalitpur Fire Station',
        ne: 'ललितपुर दमचल स्टेशन',
        numbers: ['+977-1-5522222'],
      },
      {
        name: 'Bhaktapur Fire Station',
        ne: 'भक्तपुर दमचल स्टेशन',
        numbers: ['+977-1-6610010'],
      },
      {
        name: 'Electricity Line Emergency (NEA)',
        ne: 'विद्युत लाइन आपतकाल (NEA)',
        numbers: ['1150', '1151'],
      },
    ],
  },
  {
    id: 'safety',
    label: 'Civil Safety & Security',
    neLabel: 'नागरिक सुरक्षा',
    icon: Shield,
    hint: 'Crime, violence, traffic, missing children or women',
    neHint: 'अपराध, हिंसा, ट्राफिक, बालबालिका वा महिला हराएको',
    lines: [
      {
        name: 'Nepal Police Emergency Dispatch',
        ne: 'नेपाल प्रहरी आपतकालीन डिस्प्याच',
        numbers: ['100'],
      },
      {
        name: 'Nepal Police Headquarters Control Room',
        ne: 'नेपाल प्रहरी केन्द्रीय कार्यालय नियन्त्रण कक्ष',
        numbers: ['1113'],
      },
      {
        name: 'Armed Police Force (APF) Security Hotline',
        ne: 'सशस्त्र प्रहरी (APF) सुरक्षा हटलाइन',
        numbers: ['1114'],
      },
      {
        name: 'Traffic Police Hotline',
        ne: 'ट्राफिक प्रहरी हटलाइन',
        numbers: ['103'],
      },
      {
        name: 'Tourist Police',
        ne: 'पर्यटक प्रहरी',
        numbers: ['1144'],
      },
      {
        name: "Women's Hotline, National Women Commission",
        ne: 'महिला हटलाइन, राष्ट्रिय महिला आयोग',
        numbers: ['1145'],
      },
      {
        name: 'Child Helpline (CWIN)',
        ne: 'बाल हटलाइन (CWIN)',
        numbers: ['1098'],
      },
    ],
  },
];
