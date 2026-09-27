/**
 * Translation tables.
 *
 * Two shapes, on purpose:
 *
 * - **Sentences** live here in both languages (`EN` / `NE`) and components call
 *   `t('resources.tab.shelters')`. English is defined once, here, so there is
 *   exactly one place to change a word.
 * - **Taxonomy labels** do not. `CATEGORIES`, `DEPARTMENTS`, `PRIORITIES`,
 *   `STAGES` and the support types already carry their English label as data
 *   (`meta.label`), and those same objects are compared, filtered and rendered
 *   from. Duplicating English into this file would give the app two sources for
 *   one label. So English stays on the object, `NE_TABLES` holds only the Nepali
 *   override, and `label()` falls back to the object's own English.
 *
 * `NE` is a **partial** table by design: it is not a promise that the whole app
 * is translated. Anything missing falls back to English, one key at a time. The
 * switcher states the real coverage number rather than implying completeness —
 * a half-Nepali screen shown as fully Nepali is the failure mode here, not an
 * English word in a corner.
 *
 * Long-form prose (the How-it-works guides, landing-page paragraphs, seed report
 * bodies) is intentionally left in English. Those are multi-sentence blocks that
 * need a native speaker's review before shipping, and a mistranslated paragraph
 * in an emergency tool is worse than a readable English one. Numbers,
 * place names and every button are translated.
 *
 * **Digits stay Latin in both locales, on purpose.** Devanagari numerals
 * (०१२३) are what a Nepali reader expects, and this is a real gap rather than
 * an oversight. They are not used here because a phone number someone has to
 * read aloud and dial must not depend on their handset's font, `tel:` hrefs are
 * built from the same strings, and almost every number in this app arrives as
 * data rather than as copy — a locale-specific rule would only reach the
 * handful that happen to live in this file and leave the rest Latin, which
 * reads as sloppier than being consistently Latin. Doing it properly means
 * formatting at the value layer (`formatNumber`, the capacities, the
 * timestamps) rather than in the translation tables.
 */

/**
 * The two locales, declared here rather than in the provider so this module
 * stays free of React — the coverage maths at the bottom needs `Locale` and
 * importing it back from `i18n.tsx` would make a cycle.
 */
export type Locale = 'en' | 'ne';

/** Sentence tables. Keys are namespaced by surface. */
export const EN: Record<string, string> = {
  // ---- shell ---------------------------------------------------------
  'a11y.skipToMain': 'Skip to main content',
  'a11y.primaryNav': 'Primary',
  'a11y.primaryNavMobile': 'Primary mobile',
  'a11y.home': 'FLARE Relief Network — home',
  'a11y.sosOpen': 'Open SOS emergency distress reporting',
  'a11y.accountMenu': 'Account menu',
  // Rendered by `components/ui/modal.tsx` and `components/ui/toast.tsx` themselves
  // rather than by a call site, so these two primitives read `t` directly. They
  // can: both are only ever mounted under `LocaleProvider` in the app shell.
  'a11y.closeDialog': 'Close dialog',
  'a11y.dismissNotification': 'Dismiss notification',
  // `Button`'s loading state. A prop with **no** English default, for the same
  // reason `LiveDot` lost its `label = 'Live'`: a default here is a gap no call
  // site can see. `aria-busy` is set regardless, so the state is never silent.
  'a11y.loading': 'Please wait',

  // ---- navigation ---------------------------------------------------
  'nav.dashboard': 'Dashboard',
  'nav.reports': 'My Reports',
  'nav.assistant': 'AI Assistant',
  'nav.tickets': 'My Tickets',
  'nav.resources': 'Resources',
  'nav.mobile.home': 'Home',
  'nav.mobile.reports': 'Reports',
  'nav.mobile.assistant': 'Assistant',
  'nav.mobile.help': 'Help',
  'nav.lang': 'Language',
  'nav.lang.switch': 'Change language',
  'nav.lang.partial': 'translated',

  // ---- browser translation -------------------------------------------
  // The second localisation layer, in `lib/browser-translate.ts`. Every one of
  // these strings is about what the *device* did or could not do, and none of
  // them is allowed to imply a translation happened when one did not. The
  // "kept in English" counts are the point: the tables are partial on purpose,
  // and a control that quietly translated 40% of a page would read as a
  // complete one.
  'translate.heading': 'Automatic translation',
  'translate.action': 'Translate this page',
  'translate.actionBody':
    'Translate the rest of the page in Nepali. It runs on this device, so nothing is sent to a server.',
  'translate.downloading': 'Downloading the language model…',
  'translate.downloadPercent': '{pct}% of the language model',
  'translate.translating': 'Translating the page…',
  'translate.progress': '{done} of {total} passages',
  'translate.on.title': 'Translated on this device',
  'translate.on.counts':
    '{translated} translated, {kept} left in English for want of an exact translation',
  'translate.on.notSent': '{n} too long to send',
  'translate.on.device': 'Nothing was sent to a server.',
  'translate.stop': 'Stop translating',
  // Two different failures, and they are kept apart because the fix is
  // different: one is a browser that cannot, the other is a browser that has not
  // downloaded this language pair yet.
  'translate.unsupported.title': 'Not available in this browser',
  'translate.unsupported.body':
    'This browser has no on-device translation. The menus and buttons above are still translated.',
  'translate.unavailable.title': 'No Nepali model installed',
  'translate.unavailable.body':
    'This browser can translate, but has not downloaded an English to Nepali model. The menus and buttons above are still translated.',
  'translate.error.title': 'Translation could not start',
  'translate.error.availability':
    'The browser would not say whether it can translate. The menus and buttons above are still translated.',
  'translate.error.unavailable':
    'The browser would not create a translator. The menus and buttons above are still translated.',

  // ---- account ------------------------------------------------------
  'account.signIn': 'Sign in',
  'account.signInShort': 'In',
  'account.signOut': 'Sign out',
  'account.settings': 'Settings',
  'account.verified': 'Identity verified',
  'account.menu.tickets': 'My tickets',
  'account.menu.reports': 'My reports',
  'account.menu.voice': 'Voice assistant',
  'account.menu.resources': 'Relief resources',
  'account.menu.location': 'Location & safety',

  // ---- status -------------------------------------------------------
  'status.beta': 'BETA',
  'status.respondersActive': '{n} responders active',
  'status.emergencyContact': 'Emergency Contact',
  'status.sos': 'SOS',
  'status.announce': 'System status: {label}. {detail}',
  'mode.operational': 'System Operational',
  'mode.relief': 'Live Relief Mode',
  'mode.degraded': 'Partial Outage',
  'mode.offline': 'Offline',

  // ---- SOS ----------------------------------------------------------
  'sos.button': 'Emergency SOS',
  'sos.sr.floating': 'Emergency SOS — alert the nearest crew with your live location',
  'sos.updates': '{n} update',
  'sos.updatesPlural': '{n} updates',
  'sos.askAssistant': 'Open AI Relief Assistant',
  'sos.askAssistantShort': 'Ask AI',
  'sos.floating.title': 'Need help right now?',
  'sos.floating.subtitle': 'Alert the nearest response team in one tap.',
  'sos.footer.warn': "If someone's life is in immediate danger, call your local emergency number first.",

  // ---- SOS dialog ---------------------------------------------------
  // `sos.title.*` / `sos.desc.*` are indexed by the dialog's own `phase`, so
  // adding a phase without a pair of keys fails loudly in dev.
  'sos.title.idle': 'Emergency SOS',
  'sos.title.countdown': 'Cancel to stop the alert',
  'sos.title.sending': 'Filing your alert…',
  'sos.title.sent': 'Your alert is filed',
  'sos.title.failed': 'Your alert was not sent',
  'sos.desc.idle':
    'Tell us who you are and how to reach you, then send. This files a real request for help.',
  'sos.desc.countdown': 'Your location will be sent to the response queue.',
  'sos.desc.sending': 'Sending your situation and location to the response queue.',
  'sos.desc.sent': 'It is in the response queue now. Keep your phone nearby in case a crew calls.',
  'sos.desc.failed': 'Nothing was saved. Your details are still here — try again.',
  'sos.send': 'Send emergency alert',
  'sos.cancelStop': 'Cancel — stop the alert',
  'sos.name': 'Your name',
  'sos.namePlaceholder': 'Who needs help',
  'sos.nameError': 'Please enter your name.',
  'sos.phone': 'Phone number',
  'sos.phonePlaceholder': 'How a crew reaches you',
  'sos.phoneError': 'That looks too short to be a number we can call.',
  'sos.whatHappening': 'What is happening?',
  'sos.situation.medical': 'Medical emergency',
  'sos.situation.medical.hint': 'Injury or illness',
  'sos.situation.danger': 'Immediate danger',
  'sos.situation.danger.hint': 'Threat to life',
  'sos.situation.fire': 'Fire or hazard',
  'sos.situation.fire.hint': 'Smoke, gas, collapse',
  'sos.situation.rescue': 'Need rescue',
  'sos.situation.rescue.hint': 'Trapped or stranded',
  'sos.support.medical': 'medical help',
  'sos.support.security': 'security help',
  'sos.support.rescue': 'rescue',
  'sos.routing': 'Going to the response queue as urgent {support}.',
  'sos.countdown.sendingIn': 'Sending in',
  'sos.countdown.pressCancel': 'Press cancel to stop',
  'sos.signedInAs':
    'Signed in as {name}. Your alert will be filed against this account, so you can follow it afterwards.',
  'sos.notSignedIn':
    'You are not signed in. Your alert will still be filed, but you will need your reference and phone number to open it later.',
  'sos.fix.locating': 'Finding your location…',
  'sos.fix.locatingBody': 'This takes a moment on some phones.',
  'sos.fix.ready': 'Location ready',
  'sos.fix.accuracy': 'Accurate to about {m} m',
  'sos.fix.none': 'No location shared',
  'sos.fix.sentWithout': 'Your alert will still be sent, marked without a location.',
  'sos.fix.permissionOff': 'Location access is off. Your phone number is what we will use.',
  'sos.fix.timeout': 'The location request timed out. Your phone number is what we will use.',
  'sos.fix.unavailable': 'Could not get a location fix. Your phone number is what we will use.',
  'sos.fix.unsupported':
    'This browser cannot share a location. Your phone number is what we will use.',
  'sos.sending.title': 'Filing your alert',
  'sos.sending.keepOpen': 'Keep this screen open.',
  'sos.sending.sr':
    'Filing your emergency alert. Sending your situation and location to the response queue.',
  'sos.sent.title': 'Alert sent',
  'sos.sent.body': 'Your request is in the response queue. A crew will be assigned to it.',
  'sos.sent.reference': 'Your reference',
  'sos.sent.signedInNote': 'You can follow this in your tickets at any time.',
  'sos.sent.anonNote':
    'Write this down. With your phone number it is how you open this ticket again.',
  'sos.sent.whileWaitLead': 'While you wait:',
  'sos.sent.whileWait':
    'unlock the door if it is safe, move away from glass and unstable walls, and keep your phone volume up. If it is safe, call your local emergency number too.',
  'sos.failed.title': 'No alert was sent',
  'sos.failed.danger':
    'If someone is in danger right now, do not wait for this to work — call your local emergency number.',
  'sos.err.unreachable':
    'The relief service could not be reached. Nothing was saved — try again in a moment.',
  'sos.err.noDatabase':
    'The ticket service is temporarily down, so nothing was saved. Try again in a moment.',
  'sos.err.rejected':
    'The service rejected the details sent. Try again, or use the chat assistant instead.',
  'sos.err.generic':
    'The alert could not be sent and nothing was saved. Your details are still here — try again.',

  // ---- footer -------------------------------------------------------
  'footer.about':
    'A coordination layer for post-disaster response. FLARE routes requests to verified response teams and keeps people informed until help arrives.',
  'footer.getHelp': 'Get help',
  'footer.account': 'My account',
  'footer.assurance': 'Assurance',
  'footer.reportIncident': 'Report an incident',
  'footer.findShelter': 'Find a shelter',
  'footer.voice': 'Voice assistant',
  'footer.howTriage': 'How triage works',
  'footer.accessibility': 'Accessibility',
  'footer.verification': 'Responder verification',
  'footer.rights': '© {year} FLARE Relief Network. Demo interface.',

  // ---- landing ------------------------------------------------------
  'landing.hero.title': 'Relief that answers the moment you need it.',
  'landing.hero.body':
    'FLARE turns a sentence of panic into a dispatched crew. Describe what is happening by voice or text, confirm what we understood, and watch the response arrive — step by step, in plain language.',
  'landing.hero.ctaSos': 'Send an emergency SOS',
  'landing.hero.ctaChat': 'Talk to the assistant',
  'landing.hero.noAccount': 'No account needed for SOS. Works on any phone.',
  'landing.hero.sampleMeta': '3 people · rising water',
  'status.live': 'LIVE',
  'landing.stat.reports': 'Reports',
  'landing.stat.resolved': 'Resolved',
  'landing.stat.median': 'Median',
  'landing.how.title': 'Four steps, and you always know where you are.',
  'landing.step.speak': 'Speak or type',
  'landing.step.reads': 'It reads the details',
  'landing.step.routes': 'It finds the right team',
  'landing.step.confirm': 'You confirm, then track',
  'landing.depts.title': '{n} verified teams, live capacity.',
  'landing.depts.body':
    'FLARE routes to whoever can actually arrive fastest — not just whoever is closest on a map.',
  'landing.depts.cta': 'See the network',
  'landing.crews': '{available}/{total} crews',
  'landing.avgResponse': '~{n} min',
  'landing.trust.title': 'Designed for trust, not for panic.',
  'landing.trust.body':
    'Emergency software is used when people are frightened. That shapes every decision here.',
  'landing.guarantee.human': 'Human confirmed',
  'landing.guarantee.location': 'You control location',
  'landing.guarantee.keyboard': 'Keyboard first',
  'landing.guarantee.bandwidth': 'Low bandwidth',
  'landing.closing.title': 'The fastest way to get help is already on your screen.',
  'landing.closing.body':
    'Open the dashboard to see live requests, or go straight to the assistant. Either way, SOS is one tap away.',

  // ---- buttons ------------------------------------------------------
  'btn.call': 'Call',
  // The dispatch desk on a report, not the reporter: it is the one number that
  // reaches a crew, as opposed to the reporter's own line in the facts list.
  'btn.callDesk': 'Call the desk',
  'btn.directions': 'Directions',
  'btn.requestBed': 'Request a bed',
  'btn.waitlist': 'Waitlist',
  'btn.back': 'Back',
  'btn.next': 'Next',
  'btn.cancel': 'Cancel',
  'btn.close': 'Close',
  'btn.save': 'Save',
  'btn.send': 'Send',
  'btn.retry': 'Try again',
  'btn.signIn': 'Sign in',
  'btn.open': 'Open',
  'btn.copy': 'Copy',
  'btn.copied': 'Copied',

  // ---- dashboard ----------------------------------------------------
  'dashboard.title': 'Dashboard',
  'dashboard.greetingTail': 'Here is where your requests stand.',
  'dashboard.hero.calm':
    'Nothing needs attention right now. If something changes, the assistant is one tap away.',
  'dashboard.hero.open': 'You have {n} open request',
  'dashboard.hero.openPlural': 'You have {n} open requests',
  'dashboard.hero.critical': ', including {n} critical',
  'dashboard.hero.criticalPlural': ', including {n} critical',
  'dashboard.hero.updates': ' Every update below arrives as a responder acts on it.',
  'dashboard.quick.voice.label': 'Report by voice',
  'dashboard.quick.voice.hint': 'Hands-free, no typing',
  'dashboard.quick.text.label': 'Describe in text',
  'dashboard.quick.text.hint': 'AI routes it for you',
  'dashboard.quick.shelter.label': 'Find shelter & supplies',
  'dashboard.quick.shelter.hint': 'Open nearby locations',
  'dashboard.overview': 'Overview',
  'dashboard.overviewWindow': 'Last 24 hours · updated just now',
  'dashboard.activeRequests': 'Active requests',
  // The eyebrow above the department roster, on `/dashboard` and the landing
  // page. One key for both: they are the same list of departments, and two
  // wordings for one list is how the two screens drift apart.
  'dashboard.network': 'Response network',
  'dashboard.showMore': 'Show {n} more active request',
  'dashboard.showMorePlural': 'Show {n} more active requests',
  'dashboard.triageFeed': 'AI triage feed',
  'dashboard.triageDisclaimer':
    'A human confirms every request before dispatch. The AI only prepares it.',
  'dashboard.sure': '{n}% sure',
  'dashboard.departments': '{n} departments',
  'dashboard.crewsAvailable': '{available} of {total} crews available',
  'dashboard.minutesShort': '~{n}m',
  'dashboard.recentlyResolved': 'Recently resolved',
  'dashboard.nothingResolved': 'Nothing resolved yet today.',
  'dashboard.needHelpWith': 'I need help with',
  'dashboard.flow.sos.title': 'One tap to SOS',
  'dashboard.flow.sos.cta': 'Open SOS',
  'dashboard.flow.draft.title': 'AI drafts, you confirm',
  'dashboard.flow.draft.cta': 'Try the assistant',
  'dashboard.flow.track.title': 'Track it live',
  'dashboard.flow.track.cta': 'View reports',
  'dashboard.empty.title': 'No open requests',
  'dashboard.empty.body':
    'Everything you have reported has been resolved. If your situation changes, the assistant is one tap away — by voice or text.',
  'status.activeCount': '{n} active',
  'time.greeting.awake': 'Still awake',
  'time.greeting.morning': 'Good morning',
  'time.greeting.afternoon': 'Good afternoon',
  'time.greeting.evening': 'Good evening',

  // ---- reports ------------------------------------------------------
  'reports.title': 'My reports',
  'reports.viewAll': 'View all reports',
  'reports.subtitle': 'Every request you have sent, with its live status.',
  'reports.subtitleCounts': 'Every request you have sent, with its live status. {open} still open, {resolved} resolved.',
  'reports.newVoice': 'New voice report',
  'reports.filterLabel': 'Filter reports by status',
  'reports.search': 'Search reports',
  'reports.searchPlaceholder': 'Search by place, reference or keyword',
  'reports.all': 'All',
  'reports.open': 'Open',
  'reports.resolved': 'Resolved',
  'reports.newReport': 'New report',
  'reports.empty': 'No reports match these filters',
  'reports.emptyBody': 'Clear the filters, or send a new request and it will show up here.',
  'reports.filters': 'Filters',
  'reports.clearFilters': 'Clear filters',
  'reports.narrowDown': 'Narrow down',
  'reports.reset': 'Reset',
  'reports.priority': 'Priority',
  'reports.any': 'Any',
  'reports.category': 'Category',
  'reports.allCategories': 'All categories',
  'reports.sortBy': 'Sort by',
  'reports.sort.recent': 'Most recent',
  'reports.sort.priority': 'Highest priority',
  'reports.sort.stage': 'Furthest along',
  'reports.responseTargets': 'Response targets',
  'reports.matchingHeading': 'Reports matching your filters',
  'reports.result': '{n} report',
  'reports.resultPlural': '{n} reports',
  'reports.resultMatching': ' matching “{query}”',

  'badges.prioritySuffix': 'priority',
  'badges.minutesShort': '{n}m',
  'badges.increase': 'increase',
  'badges.decrease': 'decrease',

  // ---- report card --------------------------------------------------
  'card.channel.voice': 'Voice',
  'card.channel.sos': 'SOS',
  'card.channel.web': 'Web',
  'card.channel.chat': 'Chat',
  'card.openFull': ' — open full report {code}',
  'card.location': 'Location',
  'card.moreFlags': '+{n} more',
  'card.awaitingCrew': 'Awaiting crew',
  'card.eta': 'ETA {n} min',
  'card.assigned': 'Assigned',

  // ---- lifecycle stepper --------------------------------------------
  'stepper.ariaLabel': 'Report progress',
  'stepper.done': 'Completed',
  'stepper.active': 'In progress',
  'stepper.pending': 'Not started',
  'stepper.now': 'Now',
  'stepper.srStep': 'Step {n} of {total}: {state}.',
  'stepper.srStamp': ' Completed at {stamp}.',
  'stepper.ariaValue': '{stage}, step {n} of {total}',

  // ---- dashboard stat tiles -----------------------------------------
  'stat.view': 'View {label}',

  // ---- login --------------------------------------------------------
  'login.h1.before': 'Get help in the',
  'login.h1.emphasis': 'three taps',
  'login.h1.after': 'it takes to open this screen.',
  'login.pitch':
    'FLARE listens by voice or text, routes your request to the right response team, and keeps you and your responders on the same page — every step, in real time.',
  'login.trust.password': 'No password to forget in an emergency',
  'login.trust.identity': 'Identity verified, never shared with responders',
  'login.trust.location': 'Location shared only when you send a request',
  'login.metric.responders': 'Responders active',
  'login.metric.incidents': 'Open incidents',
  'login.metric.median': 'Median response',
  'login.card.title': 'Sign in to FLARE',
  'login.card.body':
    'Signing in lets responders reach you and keeps your report history in one place. You can send an SOS without signing in.',
  'login.card.google': 'Continue with Google',
  'login.card.privacy':
    'Google verifies your email. FLARE never sees your password, and does not share your identity with response teams.',
  'login.escape.title': 'Need help right now?',
  'login.escape.body':
    'Send an SOS without signing in. Your location goes straight to the nearest crew.',
  'login.escape.cta': 'Send emergency SOS',
  'login.assure.draft':
    'AI drafts the request — a human always confirms before dispatch',
  'login.assure.a11y':
    'WCAG 2.2 AA: keyboard, screen reader and reduced-motion ready',
  'login.assure.bandwidth': 'Works on low-bandwidth connections and older phones',

  // ---- /chat side rail ---------------------------------------------
  'chat.ariaLabel': 'AI Relief Assistant',
  'chat.intentNote': 'You arrived here through the “{category}” category.',
  'chat.tryThese': 'Try one of these',
  'chat.tryTheseHint': 'Tap a phrase to see what the assistant does with it.',
  'chat.quick.trapped': 'People are trapped in a collapsed building',
  'chat.quick.notBreathing': 'Someone cannot breathe and is not responding',
  'chat.quick.shelter': 'We need shelter for a family of five',
  'chat.quick.water': 'We have no clean drinking water',
  'chat.quick.missingChild': 'A child is missing near the irrigation canal',
  'chat.quick.powerLine': 'There is a downed power line across the road',
  'chat.quick.armed': 'Men with machetes are going through the houses on our street',
  'chat.howItWorks': 'How this works',
  'chat.step.describe.t': 'You describe the situation',
  'chat.step.describe.d': 'In your own words, by voice or text. No forms, no jargon.',
  'chat.step.notes.t': 'FLARE writes the details down',
  'chat.step.notes.d': 'Name, phone number, where you are, what you need, how urgent.',
  'chat.step.check.t': 'You check it before it is sent',
  'chat.step.check.d':
    'You read every field and correct anything wrong, then press “Submit ticket”.',
  'chat.step.track.t': 'You track it live',
  'chat.step.track.d': 'Follow the request from submitted to resolved, with every update logged.',
  'chat.danger.title': 'If life is in danger',
  'chat.danger.body':
    'Do not wait for a conversation. The red SOS button on every screen sends your live location to the nearest crew in one tap.',
  'chat.danger.badge': '1 tap',
  'chat.danger.noTyping': 'No typing required',
  'chat.keys.send': 'to send',
  'chat.keys.newline': 'for a new line',
  'chat.keys.voice':
    'Voice mode talks to Google directly, so your audio never touches our servers',
  'chat.keys.privacy':
    'This conversation is sent to our AI service to work out what you need',

  // ---- assistant chat panel -----------------------------------------
  'chat.system': 'System',
  'chat.sentByVoice': 'Sent by voice',
  'chat.sure': '{n}% sure',
  'chat.offlineReply': 'Offline reply',
  'chat.searchPlaceholder': 'Search this conversation…',
  'chat.searchAria': 'Search conversation history',
  'chat.closeSearch': 'Close search',
  'chat.searchMatches': '{n} message matching “{query}”',
  'chat.searchMatchesPlural': '{n} messages matching “{query}”',
  'chat.searchHint': 'Search by keyword or timestamp, e.g. 14:32',
  'chat.entries': '{n} entries',
  'chat.searchLog': 'Search log',
  'chat.showingResults': 'Showing search results',
  'chat.clear': 'Clear',
  'chat.offlineNotice':
    'The live assistant is unreachable, so replies are coming from the offline set. Your ticket draft is still saved — press submit in the review step when it is ready.',
  'chat.empty.title': 'Describe what is happening',
  'chat.empty.body':
    'In your own words, by voice or text. I will ask for whatever I still need, then read it back before anything is sent.',
  'chat.empty.reassure': 'Nothing is dispatched without your confirmation',
  'chat.checking': 'Checking the response network…',
  'chat.typing': 'The assistant is typing a reply.',
  'chat.manualForm': 'I’d rather fill in the form myself',
  'chat.stillNeeded': '{n} details still needed',
  'chat.moreToGo': '{n} more to go',
  'chat.inputLabel': 'Describe what you need',
  'chat.inputPlaceholder': 'Describe what you need — e.g. “two people trapped in a basement”',
  'chat.send': 'Send message',
  'chat.keyboardHint': 'Enter to send · Shift + Enter for a new line',

  // ---- ticket review form -------------------------------------------
  'review.backToChat': 'Back to the conversation',
  'review.title': 'Review your relief ticket',
  'review.subtitle': 'Everything here can be changed. Nothing is sent until you press submit.',
  'review.ticketTime': 'Ticket time',
  'review.ticketTimeBody':
    'Stamped automatically the moment you submit, so responders always know when the call was made.',
  'review.peoplePlaceholder': 'e.g. 4',
  'review.peopleAria': 'How many people need help',
  'review.submit': 'Submit ticket',
  'review.back': 'Back',
  'review.complete':
    'All required details are present. A response team reviews every ticket before anyone is dispatched, and you will be told what happens next.',
  'review.stillNeeded': '{n} more details needed: {slots}.',
  'review.required': 'Required',
  'review.optional': 'Optional',
  'review.namePlaceholder': 'e.g. Sita Gurung',
  'review.victimNamePlaceholder': 'e.g. Kamala Gurung',
  'review.phonePlaceholder': 'e.g. 9801234567',
  'review.phoneInvalid': 'That does not look like a number a responder can dial.',
  'review.summaryPlaceholder': 'In your own words: what is happening and what do they need?',
  'review.locationPlaceholder': 'e.g. House 12, Bag Bazaar, Kathmandu — blue gate, ground floor',
  'review.pickSupport': 'Pick at least one so the right team is contacted.',
  'review.targetHours': '{n}h target',
  'review.targetMinutes': '{n} min target',
  'review.onBehalf.for': 'Reporting for someone else',
  'review.onBehalf.forBody':
    'Their name and number are required, so a responder can reach them directly.',
  'review.onBehalf.self': 'I am the person who needs help',
  'review.onBehalf.selfBody': 'Your own name and number cover both you and the ticket.',
  'review.voice.saveLabel': 'Save what you said with this ticket',
  'review.voice.saveBody':
    'The {n} spoken messages will be stored on the ticket. You can read them again from your ticket, and a responder working your case can too.',
  'review.voice.discardBody':
    'Only the details above will be stored. The spoken messages will be discarded when you submit.',
  'review.voice.hide': 'Hide the transcript',
  'review.voice.show': 'Read the transcript',
  'review.voice.youSaid': 'You said: ',
  'review.voice.assistantSaid': 'Assistant said: ',
  'review.voice.you': 'You',
  'review.voice.assistant': 'Assistant',

  // ---- post-submit receipt ------------------------------------------
  'receipt.title': 'Your ticket has been submitted',
  'receipt.body':
    'A response team reviews every ticket before anyone is dispatched. You will be told what happens next on the number you gave us.',
  'receipt.row.reference': 'Reference',
  'receipt.row.submitted': 'Submitted',
  'receipt.row.status': 'Status',
  'receipt.row.support': 'Support',
  'receipt.row.priority': 'Priority',
  'receipt.row.location': 'Location',
  'receipt.ownedBefore': 'Keep this reference. You can follow this ticket from',
  'receipt.ownedLink': 'your tickets',
  'receipt.ownedAfter': 'to check its status or add a message.',
  'receipt.orphanNote':
    'Keep this reference. You filed this without signing in, so it cannot be reopened from an account — quote it to any response team that contacts you.',
  'receipt.another': 'Report something else',
  'receipt.done': 'Done',

  // ---- assistant shell ---------------------------------------------
  'assistant.name': 'FLARE Relief Assistant',
  'assistant.online': 'Online · routes to {n} response departments',
  'assistant.modeLabel': 'Assistant mode',
  'assistant.mode.chat': 'Text chat',
  'assistant.mode.voice': 'Live voice',
  'assistant.restore': 'Restore panel size',
  'assistant.expand': 'Expand to full screen',
  'assistant.close': 'Close the relief assistant',
  'assistant.launch': 'Open the FLARE Relief Assistant',
  'assistant.launchUnread':
    'Open the FLARE Relief Assistant. You have new information captured from a previous conversation.',
  'assistant.idleHint': 'Describe your situation to begin.',

  // ---- inline action card ------------------------------------------
  'cardBanner.ariaLabel': 'Information captured. Redirecting request to {dept}.',
  'cardBanner.confident': '{n}% confident',
  'cardBanner.dismiss': 'Dismiss this captured request',
  'cardBanner.routing': 'Redirecting request to',
  'cardBanner.crews': '{available} of {total} crews available · avg {n} min',
  'cardBanner.dispatchedTo': 'Dispatched to {dept}',
  'cardBanner.track': 'Track {code}',
  'cardBanner.confirm': 'Confirm & dispatch request',
  'cardBanner.edit': 'Not right — edit',
  'cardBanner.srConfirmed': 'Request confirmed and dispatched to {dept}.',
  'cardBanner.srPending': 'Information captured. Confirm and dispatch request to {dept}?',

  // ---- live voice line ----------------------------------------------
  'voice.idle': 'Voice is ready',
  'voice.idleHint': 'Press the button to start talking',
  'voice.connecting': 'Connecting…',
  'voice.connectingHint': 'Opening a voice channel',
  'voice.listening': 'Listening',
  'voice.listeningHint': 'Speak naturally. I will ask if I do not catch something.',
  'voice.speaking': 'Speaking',
  'voice.speakingHint': 'Interrupt me at any point — just start talking',
  'voice.muted': 'Microphone off',
  'voice.mutedHint': 'I cannot hear you. Unmute when you are ready.',
  'voice.error': 'Voice is unavailable',
  'voice.errorHint': 'Text chat below still works',
  'voice.iAmListening': 'I am listening…',
  'voice.youSaid': 'You said',
  'voice.mute': 'Mute microphone',
  'voice.unmute': 'Unmute microphone',

  // ---- the real Gemini Live session ----------------------------------
  'voice.reconnectingHint': 'Reconnecting — your conversation is saved',
  'voice.encrypted': 'Encrypted',
  'voice.endSession': 'End the voice session',
  'voice.iAmSpeaking': 'I am speaking — you can interrupt me at any time',
  'voice.continueText': 'Continue in text chat',
  'voice.toldEverything': 'I have told you everything',
  'voice.nothingHeard': 'Nothing heard yet',
  'voice.nothingLost': 'Nothing you said has been lost.',
  'voice.startVoice': 'Start a voice conversation',
  'voice.fail.rateLimited':
    'Too many voice sessions started. Try again in a minute, or continue in text.',
  'voice.fail.unavailable': 'Voice is unavailable right now. You can keep going in text.',
  'voice.fail.unreachable': 'Could not reach the voice service. You can keep going in text.',
  'voice.fail.unknown': 'Could not start a voice session. You can keep going in text.',
  'voice.fail.gaveUp':
    'The voice connection kept dropping. You can keep going in text, and nothing you said has been lost.',
  'voice.fail.socketRefused':
    'The voice service refused the connection. You can keep going in text.',
  'voice.fail.noSetup':
    'The voice session never started. You can keep going in text, and nothing you said has been lost.',

  // ---- filed ticket's spoken intake ---------------------------------
  'transcript.ariaLabel': 'Spoken intake',
  'transcript.loading': 'Loading the transcript…',
  'transcript.typed':
    'This ticket was filled in by typing, so there is no spoken conversation to show.',
  'transcript.reporterHint': 'Everything you told us is in the details above.',
  'transcript.title': 'What was said on the call',
  'transcript.turn': '{n} turn',
  'transcript.turns': '{n} turns',
  'transcript.reporter': 'Reporter',
  'transcript.assistant': 'Assistant',

  // ---- /tickets/[id] ------------------------------------------------
  'ticket.opening': 'Opening your ticket…',
  'ticket.signedIn.title': 'Sign in to see this ticket',
  'ticket.signedIn.cta': 'Sign in',
  'ticket.signedIn.body': 'A ticket can only be opened by the account it was filed with.',
  'ticket.missing.title': 'Ticket not found',
  'ticket.missing.cta': 'All my tickets',
  'ticket.missing.body':
    'No ticket with that reference is on your account. If you filed it while signed out it cannot be reopened here — quote the reference to any team that reaches you.',
  'ticket.fact.location': 'Location',
  'ticket.fact.filed': 'Filed',
  'ticket.fact.support': 'Support needed',
  'ticket.fact.people': 'People affected',
  'ticket.fact.notRecorded': 'Not recorded',
  'ticket.fact.priority': 'Priority',
  'ticket.fact.contact': 'Contact number',
  'ticket.transcript.unavailable':
    'The ticket service is briefly down, so the transcript could not be loaded. Your ticket is unaffected.',
  'ticket.transcript.failed': 'The transcript of this call could not be loaded.',
  'ticket.messages.title': 'Messages about this ticket',
  'ticket.messages.degraded':
    'That answer came from the offline set — the live assistant was unreachable. Your message was still added to the ticket.',
  'ticket.messages.empty':
    'No messages yet. Anything you add here goes to the response team working on this ticket.',
  'ticket.messages.replying': 'The assistant is replying…',
  'ticket.messages.inputAria': 'Add a message about this ticket',
  'ticket.messages.inputPlaceholder': 'Ask a question, or add something that changed…',
  'ticket.messages.send': 'Send',
  'ticket.messages.sending': 'Sending…',

  // ---- PortalError, resolved by `portalErrorKey` --------------------
  // The `kind` values are the whole vocabulary of `lib/ticket-portal.ts`, so
  // these keys are exhaustive by construction: a new kind with no sentence
  // renders as the missing-key warning rather than as silence.
  'portalError.not_signed_in': 'You need to sign in to see this.',
  'portalError.forbidden': 'Your account is not allowed to do that.',
  'portalError.not_found': 'No such ticket on your account.',
  'portalError.unreachable': 'The relief service could not be reached.',
  'portalError.unavailable':
    'The ticket service is temporarily down. Nothing was lost — try again in a moment.',
  'portalError.unknown': 'Something went wrong on our side. Your details are still here.',
  'portalError.claimMismatch':
    'That reference and phone number do not match a ticket. Check both and try again.',

  // ---- /admin, the response queue ------------------------------------
  'admin.title': 'Response queue',
  'admin.subtitle':
    'Every ticket filed through the assistant, oldest status first. Moving one here is what a reporter sees on their portal.',
  'admin.refresh': 'Refresh',
  'admin.loading': 'Loading the queue…',
  'admin.filter.all': 'All',
  'admin.empty.title': 'Nothing in the queue',
  'admin.empty.body': 'Tickets appear here as soon as they are filed.',
  'admin.stats.ariaLabel': 'Queue summary',
  'admin.stats.total': 'Filed in total',
  'admin.stats.supportTitle': 'What people are asking for',
  'admin.stats.supportFootnote':
    'A ticket can need more than one kind of help, so these add up to more than the filed total.',
  'admin.row.reporter': 'Reporter',
  'admin.row.location': 'Location',
  'admin.row.support': 'Support',
  'admin.row.priority': 'Priority',
  'admin.row.people': 'People',
  'admin.row.filed': 'Filed',
  'admin.moveTo': 'Move to',
  'admin.saving': 'Saving…',
  'admin.transcript.read': 'Read the transcript of the call',
  'admin.error.forbidden':
    'Your account is not on the admin allowlist. Set ADMIN_EMAILS to include it.',
  'admin.error.unreachable': 'The relief service could not be reached.',
  'admin.error.unavailable': 'The ticket database is down. Nothing was changed.',
  'admin.error.unknown': 'Something went wrong loading the queue.',

  // ---- system lines the store writes into the transcript -------------
  'store.dispatchConfirmed':
    'Dispatch confirmed. Report {code} created and pushed to the response team. You can track it from your dashboard.',
  'store.ticketLogged':
    'Ticket {ticket} submitted and logged as {code}. It is now in the response team’s review queue — they will contact you on {contact}.',
  'store.contactProvided': 'the number you provided',
  'store.captureDismissed':
    'Capture dismissed. The details are still saved in this conversation if you need to send them later.',

  // ---- the assistant's own failure banner, keyed by `ticketErrorKey` ----
  'aiError.rejected':
    'The assistant could not accept this message. Your details are still here — try again in a moment.',
  'aiError.stillMissing': 'Some required details are still missing.',
  'aiError.createFailed':
    'The ticket could not be created. Your details are still here — try again.',
  'aiError.unreachable':
    'The relief service could not be reached. Your details are still here — try again in a moment.',
  'aiError.serviceDown':
    'The ticket service is temporarily down and no ticket was saved. Everything you entered is still here — try again in a moment.',
  'aiError.rejectedFields': 'The service rejected some details. Check the highlighted fields.',

  // ---- report detail ------------------------------------------------
  'detail.mapAlt': 'Map showing {label} in {area}. Interactive map unavailable in this demo.',
  'detail.notFound.title': 'Report not found',
  'detail.notFound.body':
    'We could not find a report with the ID {code}. It may belong to another account.',
  'detail.notFound.cta': 'Back to my reports',
  'detail.submitted': 'Submitted',
  'detail.reporter': 'Reporter',
  'detail.peopleAffected': 'People affected',
  'detail.affected': '{n} affected',
  'detail.channel.voice': 'Reported by voice',
  'detail.channel.sos': 'Reported via SOS',
  'detail.channel.web': 'Reported on web',
  'detail.channel.chat': 'Reported in chat',
  'detail.contactResponder.title': 'Emergency contact',
  'detail.contactResponder.body': 'Nearest crew: EMS Rapid Response · 4 min',
  'detail.contactResponder.cta': 'Contact responder',
  'detail.copyId': 'Copy ID',
  'detail.print': 'Print this report',
  'detail.share': 'Share this report',
  'detail.copy.copied': 'Copied',
  'detail.copy.link': 'Link copied',
  'detail.copy.location': 'Location copied',
  'detail.copy.failed': 'Could not copy',
  'detail.advance.title': 'Status updated',
  'detail.advance.body': 'A responder action has been recorded on this report.',
  'detail.minutes': '{n} min',
  'detail.target': 'Target: {sla}',
  'detail.completed': 'Completed',
  'detail.tracking': 'Tracking',
  'detail.progress.title': 'Live progress',
  'detail.progress.step': 'Step {n} of {total}',
  'detail.progress.demoControl':
    'Demo control: simulate the next responder action on this report.',
  'detail.progress.simulate': 'Simulate next step',
  'detail.eventLog.title': 'Event log',
  'detail.eventLog.entries': '{n} entries',
  'detail.extracted.badge': 'Extracted by FLARE',
  'detail.extracted.title': 'Information captured',
  'detail.extracted.body':
    'These details were read from your conversation or SOS signal. Each is shown with the confidence the assistant had, so you can spot anything that was misread.',
  'detail.classification.title': 'Classification',
  'detail.flags.title': 'Flags for responders',
  'detail.location.title': 'Location',
  'detail.location.address': 'Address',
  'detail.location.area': 'Area',
  'detail.location.coords': 'Coordinates',
  'detail.sharePin': 'Share pin',
  'detail.assigned.title': 'Assigned response',
  'detail.assigned.crews': '{available}/{total} crews · ~{n} min',
  'detail.assigned.unit': 'Assigned unit',
  'detail.assigned.eta': 'Arriving in about {n} minutes',
  'detail.contact.title': 'How responders reach you',
  'detail.contact.none': 'Do not contact',
  'detail.contact.call': 'Phone call preferred',
  'detail.contact.sms': 'Text message preferred',
  'detail.contact.body':
    'Change this any time — responders always see your current preference.',
  'detail.contact.cta': 'Update contact details',
  'detail.impact.title': 'People this affects',
  'detail.impact.counted': 'people counted in this report',
  'detail.exportPdf': 'Export as PDF',
  'detail.backToReports': 'Back to all reports',

  // ---- report detail ------------------------------------------------
  'report.status': 'Status',
  'report.priority': 'Priority',
  'report.department': 'Department',
  'report.reporter': 'Reporter',
  'report.channel': 'Channel',
  'report.people': 'People affected',
  'report.location': 'Location',
  'report.area': 'Area',
  'report.landmark': 'Landmark',
  'report.responder': 'Responder',
  'report.timeline': 'Timeline',
  'report.timelineEmpty': 'Nothing has happened on this request yet.',
  'report.extracted': 'What we understood',
  'report.vulnerability': 'Vulnerability',
  'report.print': 'Print',
  'report.share': 'Share',
  'report.notFound': 'Report not found',
  'report.notFoundBody': 'This report is not in this session. Reports are held in memory, so a reload empties the store.',
  'report.eta': 'ETA {n} min',
  'report.target': 'Response target',
  'report.updated': 'Updated',
  'report.submitted': 'Submitted',

  // ---- resources ----------------------------------------------------
  'resources.title': 'Relief resources',
  'resources.subtitle':
    'Open shelters, supply points and the national emergency numbers for Nepal — plus plain-language guidance on how FLARE works.',
  'resources.tabs': 'Resource categories',
  'resources.tab.shelters': 'Shelters',
  'resources.tab.supplies': 'Supply points',
  'resources.tab.contacts': 'Emergency numbers',
  'resources.tab.guides': 'How it works',
  'resources.shelters.heading': 'Open shelters',
  'resources.shelters.full': 'Full',
  'resources.shelters.spaces': '{n} spaces',
  'resources.shelters.capacity': 'Capacity',
  'resources.shelters.free': '{free} / {total} free',
  'resources.shelters.accessible': 'Step-free access',
  'resources.shelters.fullAria': '{free} of {total} spaces available',
  'resources.supplies.heading': 'Supply distribution points',
  'resources.supplies.available': 'available',
  'resources.supplies.cannotReach': 'Cannot reach a distribution point?',
  'resources.supplies.cannotReachBody':
    'Tell the assistant what you need. Logistics will route the nearest supply run to you — you do not have to travel.',
  'resources.supplies.cta': 'Request food and water',
  'resources.guides.heading': 'Guides',
  'resources.guides.a11y': 'Accessibility',
  'resources.contacts.heading': 'National emergency numbers',
  'resources.contacts.lead':
    'Short codes are free from any phone in Nepal and are answered 24 hours a day. Use them when you cannot reach FLARE — no signal, no data, no account — or when waiting is not safe.',
  'resources.contacts.sosHeading': 'Life in danger right now?',
  'resources.contacts.sosBody':
    'Do not wait on a queue. Send an SOS and FLARE puts a critical request in front of a response team, and you can keep calling the numbers above in parallel.',
  'resources.contacts.dial': 'Call {number}',
  'resources.guide.ai-words': 'What the AI does with your words',
  'resources.guide.queue': 'Why the queue exists',
  'resources.guide.location': 'Who can see your location',
  'resources.guide.verified': 'How responders are verified',
  'resources.guide.prepared': 'Preparing before a disaster',
  'resources.guide.helping': 'If you are helping someone else',
  'resources.a11y.keyboard': 'Full keyboard support',
  'resources.a11y.voice': 'Voice as a first-class input',
  'resources.a11y.colour': 'Never colour alone',
  'resources.a11y.motion': 'Calm motion',

  // ---- tickets ------------------------------------------------------
  'tickets.title': 'My tickets',
  'tickets.subtitle':
    'Everything you have asked us for, and where it has got to. Open one to check its status or add a message for the response team.',
  'tickets.newCta': 'Raise a new ticket',
  'tickets.loading': 'Loading your tickets…',
  'tickets.open': 'Open',
  'tickets.empty': 'No tickets yet',
  'tickets.emptyCta': 'Ask for help',
  'tickets.emptyBody':
    'Nothing is attached to this account. If you asked for help, it is saved either way — the response team has your name, number and location.',
  'tickets.emptyClaimBefore': 'A ticket you filed',
  'tickets.emptyClaimEmphasis': 'without signing in',
  'tickets.emptyClaimAfter':
    'does not show up here on its own. Add it with the reference we gave you and the phone number you gave us.',
  'tickets.failure.signedIn.title': 'Sign in to see your tickets',
  'tickets.failure.signedIn.body':
    'Tickets are tied to the account you were signed in with when you filed them.',
  'tickets.failure.title': 'Cannot load your tickets',
  'tickets.failure.body': 'Nothing was lost. Try again in a moment.',
  'tickets.failure.retry': 'Try again',

  // ---- claiming a ticket filed signed out ----------------------------
  'claim.collapsed': 'I filed this while signed out',
  'claim.title': 'Add a ticket you filed without signing in',
  'claim.body':
    'Your ticket was saved and the response team has it. To follow it here, give us the reference from your receipt and the phone number you gave us.',
  'claim.reference': 'Ticket reference',
  'claim.phone': 'Phone number you gave us',
  'claim.checking': 'Checking',
  'claim.submit': 'Add this ticket',
  'claim.cancel': 'Cancel',
  'claim.footnote':
    'Both details must match the ticket exactly. If the ticket has already been added to an account, it can only be used from that account — there is no way to move it, so nobody else can take it from you.',

  // ---- login --------------------------------------------------------
  'login.title': 'Sign in',
  'login.continue': 'Continue with Google',

  // ---- toasts / messages --------------------------------------------
  'toast.captured.title': 'Information captured',
  'toast.captured.body': 'The assistant extracted a request and prepared it for dispatch.',
  'toast.sosSent.title': 'Emergency alert sent',
  'toast.sosSent.body': '{code} is in the response queue for triage.',
  'msg.reportCreated':
    'Dispatch confirmed. Report {code} created and pushed to the response team. You can track it from your dashboard.',
  'msg.ticketCreated':
    'Ticket {id} submitted and logged as {code}. It is now in the response team’s review queue — they will contact {name} on {phone}.',
  'msg.ticketSubmitted': 'Ticket {id} submitted via AI Relief Assistant',
};

/** Nepali sentences. A subset — anything absent falls back to `EN`. */
export const NE: Record<string, string> = {
  'a11y.skipToMain': 'मुख्य सामग्रीमा जानुहोस्',
  'a11y.primaryNav': 'मुख्य',
  'a11y.primaryNavMobile': 'मुख्य (मोबाइल)',
  'a11y.home': 'FLARE राहत नेटवर्क — गृहपृष्ठ',
  'a11y.sosOpen': 'SOS आपतकालीन सहायता खोल्नुहोस्',
  'a11y.accountMenu': 'खाता मेनु',
  'a11y.closeDialog': 'संवाद बन्द गर्नुहोस्',
  'a11y.dismissNotification': 'सूचना हटाउनुहोस्',
  'a11y.loading': 'कृपया प्रतीक्षा गर्नुहोस्',

  'nav.dashboard': 'ड्यासबोर्ड',
  'nav.reports': 'मेरा रिपोर्टहरू',
  'nav.assistant': 'AI सहायक',
  'nav.tickets': 'मेरा टिकटहरू',
  'nav.resources': 'सहायता',
  'nav.mobile.home': 'गृह',
  'nav.mobile.reports': 'रिपोर्ट',
  'nav.mobile.assistant': 'सहायक',
  'nav.mobile.help': 'सहायता',
  'nav.lang': 'भाषा',
  'nav.lang.switch': 'भाषा बदल्नुहोस्',
  'nav.lang.partial': 'अनुवाद भएको',

  'translate.heading': 'स्वतः अनुवाद',
  'translate.action': 'यो पृष्ठ अनुवाद गर्नुहोस्',
  'translate.actionBody':
    'पृष्ठको बाँकी भाग नेपालीमा अनुवाद गर्नुहोस्। यो यसै यन्त्रमा चल्छ, कुनै सर्भरमा पठिँदैन।',
  'translate.downloading': 'भाषा मोडेल डाउनलोड हुँदैछ…',
  'translate.downloadPercent': 'भाषा मोडेलको {pct}%',
  'translate.translating': 'पृष्ठ अनुवाद हुँदैछ…',
  'translate.progress': '{total} ओटामध्ये {done} अनुवाद भयो',
  'translate.on.title': 'यसै यन्त्रमा अनुवाद भयो',
  'translate.on.counts': '{translated} अनुवाद भयो, {kept} ठीक अनुवाद नभएकाले अङ्ग्रेजीमै राखिएको',
  'translate.on.notSent': '{n} धेरै लामो भएकाले पठिएन',
  'translate.on.device': 'कुनै सर्भरमा पठिएको छैन।',
  'translate.stop': 'अनुवाद बन्द गर्नुहोस्',
  'translate.unsupported.title': 'यो ब्राउजरमा उपलब्ध छैन',
  'translate.unsupported.body':
    'यो ब्राउजरमा यन्त्रमै अनुवाद गर्ने सुविधा छैन। माथिका मेनु र बटनहरू भने अनुवाद भइसकेका छन्।',
  'translate.unavailable.title': 'नेपाली मोडेल जडान भएको छैन',
  'translate.unavailable.body':
    'यो ब्राउजरले अनुवाद गर्न सक्छ, तर अङ्ग्रेजीबाट नेपालीको मोडेल डाउनलोड गरेको छैन। माथिका मेनु र बटनहरू भने अनुवाद भइसकेका छन्।',
  'translate.error.title': 'अनुवाद सुरु हुन सकेन',
  'translate.error.availability':
    'ब्राउजरले आफूले अनुवाद गर्न सक्ने हो कि सक्दैन भन्ने जानकारी दिन चाहेन। माथिका मेनु र बटनहरू भने अनुवाद भइसकेका छन्।',
  'translate.error.unavailable':
    'ब्राउजरले अनुवादक बनाउन मानेन। माथिका मेनु र बटनहरू भने अनुवाद भइसकेका छन्।',

  'account.signIn': 'साइन इन',
  'account.signInShort': 'इन',
  'account.signOut': 'साइन आउट',
  'account.settings': 'सेटिङ',
  'account.verified': 'पहिचान प्रमाणित',
  'account.menu.tickets': 'मेरा टिकटहरू',
  'account.menu.reports': 'मेरा रिपोर्टहरू',
  'account.menu.voice': 'आवाज सहायक',
  'account.menu.resources': 'राहत सहायता',
  'account.menu.location': 'स्थान र सुरक्षा',

  'status.beta': 'बीटा',
  'status.respondersActive': '{n} जवान सक्रिय',
  'status.emergencyContact': 'आपतकालीन सम्पर्क',
  'status.sos': 'SOS',
  'status.announce': 'प्रणालीको अवस्था: {label}. {detail}',
  'mode.operational': 'प्रणाली सक्रिय',
  'mode.relief': 'प्रत्यक्ष राहत मोड',
  'mode.degraded': 'आंशिक अवरोध',
  'mode.offline': 'अफलाइन',

  'sos.button': 'आपतकालीन SOS',
  'sos.sr.floating': 'आपतकालीन SOS — आफ्नो वर्तमान स्थानसहित नजिकको टोलीलाई सूचना पठाउनुहोस्',
  'sos.updates': '{n} अद्यावधिक',
  'sos.updatesPlural': '{n} अद्यावधिक',
  'sos.askAssistant': 'AI राहत सहायक खोल्नुहोस्',
  'sos.askAssistantShort': 'AI लाई सोध्नुहोस्',
  'sos.floating.title': 'अहिले सहयोग चाहिन्छ?',
  'sos.floating.subtitle': 'एकै पटकमा नजिकको प्रतिक्रिया दललाई सूचना पठाउनुहोस्।',
  'sos.footer.warn': 'कसैको जीवन तत्काल खतरामा छ भने पहिले आफ्नै स्थानीय आपतकालीन नम्बरमा फोन गर्नुहोस्।',

  // ---- SOS dialog ---------------------------------------------------
  'sos.title.idle': 'आपतकालीन SOS',
  'sos.title.countdown': 'रोक्न अस्वीकार गर्नुहोस्',
  'sos.title.sending': 'तपाईंको सूचना दर्ता गरिँदै…',
  'sos.title.sent': 'तपाईंको सूचना दर्ता भयो',
  'sos.title.failed': 'तपाईंको सूचना पठाइएन',
  'sos.desc.idle':
    'तपाईं को हुनुहुन्छ र तपाईंलाई कसले भेट्ने भन्ने भन्नुहोस्, अनि पठाउनुहोस्। यसले सहयोगका लागि वास्तविक अनुरोध दर्ता गर्छ।',
  'sos.desc.countdown': 'तपाईंको स्थान प्रतिक्रिया पङ्क्तिमा पठाइनेछ।',
  'sos.desc.sending': 'तपाईंको अवस्था र स्थान प्रतिक्रिया पङ्क्तिमा पठाइँदैछ।',
  'sos.desc.sent': 'यो अहिले प्रतिक्रिया पङ्क्तिमा छ। कुनै टोलीले फोन गर्न भएमा फोन साथै राख्नुहोस्।',
  'sos.desc.failed': 'केही पनि सुरक्षित भएन। तपाईंको विवरण यहाँै छ — फेरि प्रयास गर्नुहोस्।',
  'sos.send': 'आपतकालीन सूचना पठाउनुहोस्',
  'sos.cancelStop': 'रद्द गर्नुहोस् — सूचना रोक्नुहोस्',
  'sos.name': 'तपाईंको नाम',
  'sos.namePlaceholder': 'कसलाई सहयोग चाहिन्छ',
  'sos.nameError': 'कृपया आफ्नो नाम लेख्नुहोस्।',
  'sos.phone': 'फोन नम्बर',
  'sos.phonePlaceholder': 'टोलीले तपाईंलाई कसरी भेट्ने',
  'sos.phoneError': 'यो हामीले फोन गर्न मिल्ने नम्बरभन्दा छोटो देखिन्छ।',
  'sos.whatHappening': 'के भइरहेको छ?',
  'sos.situation.medical': 'चिकित्सकीय आपतकाल',
  'sos.situation.medical.hint': 'चोट वा बिरामी',
  'sos.situation.danger': 'तत्काल खतरा',
  'sos.situation.danger.hint': 'जीवनमा खतरा',
  'sos.situation.fire': 'आगो वा जोखिम',
  'sos.situation.fire.hint': 'धुवाँ, ग्यास, भत्किएको भवन',
  'sos.situation.rescue': 'उद्धार चाहिन्छ',
  'sos.situation.rescue.hint': 'छेपिएको वा अलग',
  'sos.support.medical': 'चिकित्सा सहयोग',
  'sos.support.security': 'सुरक्षा सहयोग',
  'sos.support.rescue': 'उद्धार',
  'sos.routing': 'प्रतिक्रिया पङ्क्तिमा अत्यावश्यक रूपमा {support} को रूपमा पठाइँदैछ।',
  'sos.countdown.sendingIn': 'यति सेकेन्डमा पठाइनेछ',
  'sos.countdown.pressCancel': 'रोक्न रद्द थिच्नुहोस्',
  'sos.signedInAs':
    '{name} को रूपमा साइन इन हुनुहुन्छ। तपाईंको सूचना यही खातामा दर्ता हुनेछ, त्यसैले पछि अनुगमन गर्न सक्नुहुन्छ।',
  'sos.notSignedIn':
    'तपाईं साइन इन हुनुहुन्न। तपाईंको सूचना दर्ता हुन्छ, तर पछि खोल्न तपाईंको सन्दर्भ र फोन नम्बर चाहिन्छ।',
  'sos.fix.locating': 'तपाईंको स्थान खोजिँदै…',
  'sos.fix.locatingBody': 'केही फोनमा केही समय लाग्छ।',
  'sos.fix.ready': 'स्थान तयार छ',
  'sos.fix.accuracy': 'लगभग {m} मिटरसम्म सटीक',
  'sos.fix.none': 'स्थान सेयर गरिएको छैन',
  'sos.fix.sentWithout': 'तपाईंको सूचना पठाइनेछ, स्थान नभएको रूपमा चिन्ह लगाएर।',
  'sos.fix.permissionOff': 'स्थान पहुँच बन्द छ। हामी तपाईंको फोन नम्बर प्रयोग गर्नेछौं।',
  'sos.fix.timeout': 'स्थान खोज्ने समय सकियो। हामी तपाईंको फोन नम्बर प्रयोग गर्नेछौं।',
  'sos.fix.unavailable': 'स्थान प्राप्त हुन सकेन। हामी तपाईंको फोन नम्बर प्रयोग गर्नेछौं।',
  'sos.fix.unsupported': 'यो ब्राउजरले स्थान सेयर गर्न सक्दैन। हामी तपाईंको फोन नम्बर प्रयोग गर्नेछौं।',
  'sos.sending.title': 'तपाईंको सूचना दर्ता गरिँदै',
  'sos.sending.keepOpen': 'यो स्क्रिन खुला राख्नुहोस्।',
  'sos.sending.sr': 'तपाईंको आपतकालीन सूचना दर्ता गरिँदै। अवस्था र स्थान प्रतिक्रिया पङ्क्तिमा पठाइँदै।',
  'sos.sent.title': 'सूचना पठाइयो',
  'sos.sent.body': 'तपाईंको अनुरोध प्रतिक्रिया पङ्क्तिमा छ। एउटा टोली यसको लागि खोजिनेछ।',
  'sos.sent.reference': 'तपाईंको सन्दर्भ',
  'sos.sent.signedInNote': 'तपाईं आफ्ना टिकटहरूमा जहिले पनि यसलाई अनुगमन गर्न सक्नुहुन्छ।',
  'sos.sent.anonNote': 'यो लेखिदिनुहोस्। तपाईंको फोन नम्बरसँगै यसैले यो टिकट पुनः खोल्न सकिन्छ।',
  'sos.sent.whileWaitLead': 'पर्खनुवानीमा:',
  'sos.sent.whileWait':
    'सुरक्षित भए ढोका खोल्नुहोस्, सिसा र नबले भित्तिबाट टाढा जानुहोस्, र फोनको आवाज उच्च राख्नुहोस्। सुरक्षित भए स्थानीय आपतकालीन नम्बरमा पनि फोन गर्नुहोस्।',
  'sos.failed.title': 'कुनै सूचना पठाइएन',
  'sos.failed.danger':
    'अहिले कसैको जीवन खतरामा छ भने यसको पर्खाइ नगर्नुहोस् — स्थानीय आपतकालीन नम्बरमा फोन गर्नुहोस्।',
  'sos.err.unreachable': 'राहत सेवामा पुग्न सकिएन। केही पनि सुरक्षित भएन — केही पलपछि फेरि प्रयास गर्नुहोस्।',
  'sos.err.noDatabase': 'टिकट सेवा अस्थायी रूपमा बन्द छ, त्यसैले केही सुरक्षित भएन। केही पलपछि फेरि प्रयास गर्नुहोस्।',
  'sos.err.rejected': 'सेवाले पठाइएको विवरण स्वीकार गेन। फेरि प्रयास गर्नुहोस्, वा कुराकानी सहायक प्रयोग गर्नुहोस्।',
  'sos.err.generic': 'सूचना पठाउन सकिएन र केही सुरक्षित भएन। तपाईंको विवरण यहाँै छ — फेरि प्रयास गर्नुहोस्।',

  'footer.about':
    'विपत्तपछिको प्रतिक्रियाका लागि समन्वय तह। FLARE ले अनुरोधहरू प्रमाणित प्रतिक्रिया दलसम्म पुगाउँछ र सहयोग नपुगेसम्म मानिसलाई जानकारी दिन्छ।',
  'footer.getHelp': 'सहयोग लिनुहोस्',
  'footer.account': 'मेरो खाता',
  'footer.assurance': 'प्रतिभा',
  'footer.reportIncident': 'घटना जनाउनुहोस्',
  'footer.findShelter': 'आश्रयस्थल खोज्नुहोस्',
  'footer.voice': 'आवाज सहायक',
  'footer.howTriage': 'वर्गीकरण कसरी हुन्छ',
  'footer.accessibility': 'सुगम्यता',
  'footer.verification': 'प्रतिक्रियादाता प्रमाणीकरण',
  'footer.rights': '© {year} FLARE राहत नेटवर्क। डेमो इन्टरफेस।',

  // ---- landing ------------------------------------------------------
  'landing.hero.title': 'तपाईंलाई जहिले आवश्यक पर्छ, त्यतिखेरै पुग्ने राहत।',
  'landing.hero.body':
    'FLARE आत्मानुभूतिको एउटा वाक्यलाई पठाइएको टोलीमा बदल्छ। के भइरहेको छ आवाज वा लेखाबाट भन्नुहोस्, हामीले बुझेको कुरा पुष्टि गर्नुहोस्, अनि प्रतिक्रिया आउँदै गर्दा हेर्नुहोस् — चरणबचरण, सरल भाषामा।',
  'landing.hero.ctaSos': 'आपतकालीन SOS पठाउनुहोस्',
  'landing.hero.ctaChat': 'सहायकसँग कुराकानी गर्नुहोस्',
  'landing.hero.noAccount': 'SOS का लागि खाता चाहिनँदैन। कुनै पनि फोनमा चल्छ।',
  'landing.hero.sampleMeta': '3 जना · पानी बढ्दै',
  'status.live': 'प्रत्यक्ष',
  'landing.stat.reports': 'रिपोर्ट',
  'landing.stat.resolved': 'समाधान',
  'landing.stat.median': 'बीचको',
  'landing.how.title': 'चार चरण, र तपाईंलाई सधैँ आफ्नो अवस्था थाहा हुन्छ।',
  'landing.step.speak': 'बोल्नुहोस् वा लेख्नुहोस्',
  'landing.step.reads': 'विवरण पढ्छ',
  'landing.step.routes': 'उपयुक्त टोली खोज्छ',
  'landing.step.confirm': 'तपाईं पुष्टि गर्नुहोस्, अनि अनुगमन',
  'landing.depts.title': '{n} प्रमाणित टोली, प्रत्यक्ष क्षमता।',
  'landing.depts.body':
    'FLARE ले नक्सामा नजिक भन्दा साँच्चै सबैभन्दा छिटो पुग्न सक्ने टोलीलाई पठाउँछ।',
  'landing.depts.cta': 'नेटवर्क हेर्नुहोस्',
  'landing.crews': '{total} मध्ये {available} टोली',
  'landing.avgResponse': '~{n} मिनेट',
  'landing.trust.title': 'आतंकका लागि होइन, विश्वासका लागि बनाइएको।',
  'landing.trust.body':
    'आपतकालीन सफ्टवेयर मानिसहरू डराएको बेला प्रयोग हुन्छ। यहाँका हरेक निर्णय त्यसैले तोकिन्छ।',
  'landing.guarantee.human': 'मानिसले पुष्टि गर्छन्',
  'landing.guarantee.location': 'स्थान तपाईंकै नियन्त्रणमा',
  'landing.guarantee.keyboard': 'किबोर्ड पहिले',
  'landing.guarantee.bandwidth': 'कम ब्यान्डविथ',
  'landing.closing.title': 'सहयोग पाउने सबैभन्दा छिटो उपाय तपाईंको स्क्रिनमै छ।',
  'landing.closing.body':
    'प्रत्यक्ष अनुरोधहरू हेर्न ड्यासबोर्ड खोल्नुहोस्, वा सीधै सहायकमा जानुहोस्। जे गरे पनि SOS एक ट्यापको दूरीमा छ।',

  'btn.call': 'फोन गर्नुहोस्',
  'btn.callDesk': 'डिस्प्याच डेसलाई फोन गर्नुहोस्',
  'btn.directions': 'दिशा देखाउनुहोस्',
  'btn.requestBed': 'बेड माग्नुहोस्',
  'btn.waitlist': 'प्रतीक्षा सूची',
  'btn.back': 'पछाडि',
  'btn.next': 'अर्को',
  'btn.cancel': 'रद्द गर्नुहोस्',
  'btn.close': 'बन्द गर्नुहोस्',
  'btn.save': 'सुरक्षित गर्नुहोस्',
  'btn.send': 'पठाउनुहोस्',
  'btn.retry': 'फेरि प्रयास',
  'btn.signIn': 'साइन इन',
  'btn.open': 'खोल्नुहोस्',
  'btn.copy': 'प्रतिलिपि',
  'btn.copied': 'प्रतिलिपि भयो',

  'dashboard.title': 'ड्यासबोर्ड',
  'dashboard.greetingTail': 'तपाईंका अनुरोधहरूको अवस्था यहाँ छ।',
  'dashboard.hero.calm':
    'अहिले ध्यान दिनुपर्ने केही छैन। केही बदलियो भने सहायक एक ट्यापको दूरीमा छ।',
  'dashboard.hero.open': 'तपाईंको {n} अनुरोध खुला छ',
  'dashboard.hero.openPlural': 'तपाईंका {n} अनुरोध खुला छन्',
  'dashboard.hero.critical': ', जसमा {n} अत्यावश्यक',
  'dashboard.hero.criticalPlural': ', जसमा {n} अत्यावश्यक',
  'dashboard.hero.updates': ' तलका हरेक अद्यावधिक प्रतिक्रियादाताले काम गर्दा आउँछ।',
  'dashboard.quick.voice.label': 'आवाजमा जनाउनुहोस्',
  'dashboard.quick.voice.hint': 'हात नलगाई, टाइप नगरी',
  'dashboard.quick.text.label': 'लेखेर भन्नुहोस्',
  'dashboard.quick.text.hint': 'AI ले आफैं पठाउँछ',
  'dashboard.quick.shelter.label': 'आश्रय र सामग्री खोज्नुहोस्',
  'dashboard.quick.shelter.hint': 'नजिकका स्थानहरू',
  'dashboard.overview': 'सारांश',
  'dashboard.overviewWindow': 'गत २४ घण्टा · अहिले अद्यावधिक',
  'dashboard.activeRequests': 'सक्रिय अनुरोधहरू',
  'dashboard.network': 'प्रतिक्रिया सञ्जाल',
  'dashboard.showMore': 'सक्रिय अनुरोध {n} थप देखाउनुहोस्',
  'dashboard.showMorePlural': 'सक्रिय अनुरोध {n} थप देखाउनुहोस्',
  'dashboard.triageFeed': 'AI वर्गीकरण',
  'dashboard.triageDisclaimer':
    'पठाउनुअघि हरेक अनुरोध मानिसले पुष्टि गर्छन्। AI ले तयारी मात्र गर्छ।',
  'dashboard.sure': '{n}% निश्चित',
  'dashboard.departments': '{n} विभाग',
  'dashboard.crewsAvailable': '{total} मध्ये {available} टोली उपलब्ध',
  'dashboard.minutesShort': '~{n} मि',
  'dashboard.recentlyResolved': 'हालै समाधान भएका',
  'dashboard.nothingResolved': 'आज अझै केही समाधान भएको छैन।',
  'dashboard.needHelpWith': 'मलाई यसमा सहयोग चाहिन्छ',
  'dashboard.flow.sos.title': 'एक ट्यापमा SOS',
  'dashboard.flow.sos.cta': 'SOS खोल्नुहोस्',
  'dashboard.flow.draft.title': 'AI ले तयार गर्छ, तपाईंले पुष्टि',
  'dashboard.flow.draft.cta': 'सहायक प्रयोग गर्नुहोस्',
  'dashboard.flow.track.title': 'प्रत्यक्ष अनुगमन गर्नुहोस्',
  'dashboard.flow.track.cta': 'रिपोर्ट हेर्नुहोस्',
  'dashboard.empty.title': 'खुला अनुरोध छैन',
  'dashboard.empty.body':
    'तपाईंले जनाउनुभएका सबै अनुरोध समाधान भइसकेका छन्। तपाईंको अवस्था बदलिएमा सहायक एक ट्यापको दूरीमा छ — आवाज वा लेखाबाट।',
  'status.activeCount': '{n} सक्रिय',
  'time.greeting.awake': 'अझै जागौ',
  'time.greeting.morning': 'शुभ प्रभात',
  'time.greeting.afternoon': 'शुभ दिन',
  'time.greeting.evening': 'शुभ सन्ध्या',

  'reports.title': 'मेरा रिपोर्टहरू',
  'reports.viewAll': 'सबै रिपोर्टहरू हेर्नुहोस्',
  'reports.subtitle': 'तपाईंले पठाउनुभएका सबै अनुरोध, प्रत्यक्ष अवस्थासहित।',
  'reports.subtitleCounts':
    'तपाईंले पठाउनुभएका सबै अनुरोध, प्रत्यक्ष अवस्थासहित। {open} अझै खुला, {resolved} समाधान भयो।',
  'reports.newVoice': 'नयाँ आवाज रिपोर्ट',
  'reports.filterLabel': 'अवस्थाअनुसार रिपोर्ट छान्नुहोस्',
  'reports.search': 'रिपोर्ट खोज्नुहोस्',
  'reports.searchPlaceholder': 'स्थान, सन्दर्भ वा शब्द खोज्नुहोस्',
  'reports.all': 'सबै',
  'reports.open': 'खुला',
  'reports.resolved': 'समाधान भयो',
  'reports.newReport': 'नयाँ रिपोर्ट',
  'reports.empty': 'यी फिल्टरसँग मिल्ने रिपोर्ट छैन',
  'reports.emptyBody': 'फिल्टर हटाउनुहोस्, वा नयाँ अनुरोध पठाउनुहोस् — त्यहाँ यहाँ देखिनेछ।',
  'reports.filters': 'फिल्टर',
  'reports.clearFilters': 'फिल्टर हटाउनुहोस्',
  'reports.narrowDown': 'छान्नुहोस्',
  'reports.reset': 'रिसेट',
  'reports.priority': 'प्राथमिकता',
  'reports.any': 'कुनै पनि',
  'reports.category': 'श्रेणी',
  'reports.allCategories': 'सबै श्रेणी',
  'reports.sortBy': 'क्रमबद्ध गर्नुहोस्',
  'reports.sort.recent': 'सबैभन्दा नयाँ',
  'reports.sort.priority': 'उच्चतम प्राथमिकता',
  'reports.sort.stage': 'सबैभन्दा अगाडि बढेको',
  'reports.responseTargets': 'प्रतिक्रिया लक्ष्य',
  'reports.matchingHeading': 'तपाईंका फिल्टरसँग मिल्ने रिपोर्टहरू',
  'reports.result': '{n} रिपोर्ट',
  'reports.resultPlural': '{n} रिपोर्ट',
  'reports.resultMatching': ' — “{query}” सँग मिल्ने',

  'badges.prioritySuffix': 'प्राथमिकता',
  'badges.minutesShort': '{n} मि',
  'badges.increase': 'वृद्धि',
  'badges.decrease': 'गिरावट',

  // ---- report card --------------------------------------------------
  'card.channel.voice': 'आवाज',
  'card.channel.sos': 'SOS',
  'card.channel.web': 'वेब',
  'card.channel.chat': 'कुराकानी',
  'card.openFull': ' — पूरा रिपोर्ट {code} खोल्नुहोस्',
  'card.location': 'स्थान',
  'card.moreFlags': '+{n} थप',
  'card.awaitingCrew': 'टोलीको प्रतीक्षामा',
  'card.eta': 'लगभग {n} मिनेट',
  'card.assigned': 'सौंपिएको',

  // ---- lifecycle stepper --------------------------------------------
  'stepper.ariaLabel': 'रिपोर्टको प्रगति',
  'stepper.done': 'पूरा भयो',
  'stepper.active': 'क्रममा छ',
  'stepper.pending': 'सुरु भएको छैन',
  'stepper.now': 'अहिले',
  'stepper.srStep': '{total} मध्ये {n} चरण: {state}.',
  'stepper.srStamp': ' {stamp} मा पूरा भयो.',
  'stepper.ariaValue': '{stage}, {total} मध्ये {n} चरण',

  // ---- dashboard stat tiles -----------------------------------------
  'stat.view': '{label} हेर्नुहोस्',

  // ---- login --------------------------------------------------------
  'login.h1.before': 'यो स्क्रिन खोल्न लाग्ने',
  'login.h1.emphasis': 'तीन ट्यापमा',
  'login.h1.after': 'सहयोग पाउनुहोस्।',
  'login.pitch':
    'FLARE ले आवाज वा लेखबाट सुन्छ, तपाईंको अनुरोध सही प्रतिक्रिया टोलीलाई पुगाउँछ, र तपाईं तथा प्रतिक्रियादातालाई हरेक चरणमा उही अवस्थामा राख्छ।',
  'login.trust.password': 'आपतकालमा बिर्सने पासवर्ड छैन',
  'login.trust.identity': 'पहिचान प्रमाणित, प्रतिक्रियादातालाई कहिल्यै दिइँदैन',
  'login.trust.location': 'तपाईंले अनुरोध पठाउँदा मात्र स्थान साझा हुन्छ',
  'login.metric.responders': 'सक्रिय प्रतिक्रियादाता',
  'login.metric.incidents': 'खुला घटना',
  'login.metric.median': 'बढीमध्ये प्रतिक्रिया',
  'login.card.title': 'FLARE मा साइन इन गर्नुहोस्',
  'login.card.body':
    'साइन इन गर्दा प्रतिक्रियादाताले तपाईंलाई भेट्न सक्छन् र तपाईंको रिपोर्ट इतिहास एउटै ठाउँमा रहन्छ। साइन इन नगरीै पनि SOS पठाउन सक्नुहुन्छ।',
  'login.card.google': 'Google प्रयोग गरी जारी राख्नुहोस्',
  'login.card.privacy':
    'Google ले तपाईंको इमेल प्रमाणित गर्छ। FLARE ले तपाईंको पासवर्ड कहिल्यै हेर्दैन, र प्रतिक्रिया टोलीसँग तपाईंको पहिचान साझा गर्दैन।',
  'login.escape.title': 'अहिले नै सहयोग चाहिन्छ?',
  'login.escape.body':
    'साइन इन नगरी SOS पठाउनुहोस्। तपाईंको स्थान सीधै नजिकको टोलीलाई पुग्छ।',
  'login.escape.cta': 'आपतकालीन SOS पठाउनुहोस्',
  'login.assure.draft':
    'AI ले अनुरोधको मस्यौदा तयार पार्छ — पठाउनुअघि मानिसले सधैँ पुष्टि गर्छन्',
  'login.assure.a11y':
    'WCAG 2.2 AA: किबोर्ड, स्क्रिन रिडर र कम गरिएको गतिमा तयार',
  'login.assure.bandwidth': 'कम ब्यान्डविथ जडान र पुरानो फोनमा पनि चल्छ',

  // ---- /chat side rail ---------------------------------------------
  'chat.ariaLabel': 'AI सहायक',
  'chat.intentNote': 'तपाईं “{category}” श्रेणीबाट यहाँ आउनुभएको हो।',
  'chat.tryThese': 'यीमध्ये एउटा प्रयास गर्नुहोस्',
  'chat.tryTheseHint': 'सहायकले यसलाई के गर्छ भन्ने हेर्न वाक्य थिच्नुहोस्।',
  'chat.quick.trapped': 'भित्र खपेको भवनमा मानिसहरू फसेका छन्',
  'chat.quick.notBreathing': 'एकजना मानिसले सास फेरिरहेका छैनन् र जवाफ दिइरहेका छैनन्',
  'chat.quick.shelter': 'पाँच जनाको परिवारलाई आश्रय चाहिन्छ',
  'chat.quick.water': 'हामीसँग सफा पिउने पानी छैन',
  'chat.quick.missingChild': 'सिंचाइ नहरको टोकामा एउटा बालक हराएको छ',
  'chat.quick.powerLine': 'सडकभरि बिजुलीको टेर्लो तार झरेको छ',
  'chat.quick.armed': 'हाम्रो टोलीमा आदमीहरू कुल्फामा लिएर घर-घरमा छिरेका छन्',
  'chat.howItWorks': 'यो कसरी काम गर्छ',
  'chat.step.describe.t': 'तपाईं परिस्थिति बताउनुहुन्छ',
  'chat.step.describe.d': 'आफ्नै शब्दमा, आवाज वा लेखबाट। कुनै फाराम छैन, कुनै कठिन शब्द छैन।',
  'chat.step.notes.t': 'FLARE ले विवरण लेख्छ',
  'chat.step.notes.d': 'नाम, फोन नम्बर, तपाईं कहाँ हुनुहुन्छ, के चाहिन्छ, कत्तिको आवश्यकता।',
  'chat.step.check.t': 'पठाउनुअघि तपाईं आफैं हेर्नुहुन्छ',
  'chat.step.check.d':
    'हरेक फाँट पढेर गलत ठीक गर्नुहुन्छ, त्यसपछि “टिकट पठाउनुहोस्” थिच्नुहुन्छ।',
  'chat.step.track.t': 'तपाईं प्रत्यक्ष अवस्था हेर्नुहुन्छ',
  'chat.step.track.d': 'अनुरोध पेश भएदेखि समाधानसम्म, हरेक अद्यावधिक दर्ता गरेर।',
  'chat.danger.title': 'जीवन जोखिममा भएमा',
  'chat.danger.body':
    'कुराकानीको पर्खाइ नगर्नुहोस्। हरेक स्क्रिनमा रहेको रातो SOS बटनले एक ट्यापमै तपाईंको प्रत्यक्ष स्थान नजिकको टोलीलाई पुगाउँछ।',
  'chat.danger.badge': '१ ट्याप',
  'chat.danger.noTyping': 'केही लेख्नु पर्दैन',
  'chat.keys.send': 'पठाउन',
  'chat.keys.newline': 'नयाँ लाइनका लागि',
  'chat.keys.voice':
    'आवाज मोडले सिधै Google सँग कुरा गर्छ, त्यसैले तपाईंको अडियो हाम्रा सर्भरमा पुग्दैन',
  'chat.keys.privacy':
    'तपाईंलाई के चाहिन्छ बुझ्न यो कुराकानी हाम्रो AI सेवामा पठाइन्छ',

  // ---- assistant chat panel -----------------------------------------
  'chat.system': 'प्रणाली',
  'chat.sentByVoice': 'आवाजबाट पठाइएको',
  'chat.sure': '{n}% निश्चित',
  'chat.offlineReply': 'अफलाइन जवाफ',
  'chat.searchPlaceholder': 'यो कुराकानी खोज्नुहोस्…',
  'chat.searchAria': 'कुराकानीको इतिहास खोज्नुहोस्',
  'chat.closeSearch': 'खोज बन्द गर्नुहोस्',
  'chat.searchMatches': '“{query}” सँग मिल्ने {n} सन्देश',
  'chat.searchMatchesPlural': '“{query}” सँग मिल्ने {n} सन्देश',
  'chat.searchHint': 'शब्द वा समयअनुसार खोज्नुहोस्, जस्तै 14:32',
  'chat.entries': '{n} प्रविष्टि',
  'chat.searchLog': 'लग खोज्नुहोस्',
  'chat.showingResults': 'खोजका नतिजा देखाइँदै',
  'chat.clear': 'हटाउनुहोस्',
  'chat.offlineNotice':
    'प्रत्यक्ष सहायक पुग्न सकिएन, त्यसैले जवाफ अफलाइन सेटबाट आउँदैछ। तपाईंको टिकट मस्यौदा सुरक्षित छ — तयार भएपछि समीक्षा चरणमा पठाउनुहोस् थिच्नुहोस्।',
  'chat.empty.title': 'के भइरहेको छ वर्णन गर्नुहोस्',
  'chat.empty.body':
    'आफ्नै शब्दमा, आवाज वा लेखबाट। मलाई अझै के चाहिन्छ सोध्नेछु, त्यसपछि केही पठाउनुअघि पढाएर सुनाउनेछु।',
  'chat.empty.reassure': 'तपाईंको पुष्टि बिना केही पठाइँदैन',
  'chat.checking': 'प्रतिक्रिया नेटवर्क जाँच्दै…',
  'chat.typing': 'सहायकले जवाफ लेख्दैछ।',
  'chat.manualForm': 'म आफैं फाराम भर्न चाहन्छु',
  'chat.stillNeeded': 'अझै {n} विवरण चाहिन्छ',
  'chat.moreToGo': 'अझै {n} बाँकी',
  'chat.inputLabel': 'तपाईंलाई के चाहिन्छ वर्णन गर्नुहोस्',
  'chat.inputPlaceholder':
    'तपाईंलाई के चाहिन्छ वर्णन गर्नुहोस् — जस्तै “बेसमेन्टमा दुईजना मानिस फसेका छन्”',
  'chat.send': 'सन्देश पठाउनुहोस्',
  'chat.keyboardHint': 'पठाउन Enter · नयाँ लाइनका लागि Shift + Enter',

  // ---- ticket review form -------------------------------------------
  'review.backToChat': 'कुराकानीमा फर्कनुहोस्',
  'review.title': 'आफ्नो राहत टिकट समीक्षा गर्नुहोस्',
  'review.subtitle':
    'यहाँ भएको सबै बदल्न सकिन्छ। तपाईंले पठाउनुहोस् नथिचेसम्म केही पठाइँदैन।',
  'review.ticketTime': 'टिकटको समय',
  'review.ticketTimeBody':
    'तपाईंले पठाउने बित्तिकै स्वतः जन्मिन्छ, त्यसैले प्रतिक्रियादातालाई कहिले खबर गरिएको थियो भन्ने सधैँ थाहा हुन्छ।',
  'review.peoplePlaceholder': 'जस्तै 4',
  'review.peopleAria': 'कति जनालाई सहयोग चाहिन्छ',
  'review.submit': 'टिकट पठाउनुहोस्',
  'review.back': 'पछाडि',
  'review.complete':
    'आवश्यक सबै विवरण छन्। कसैलाई पठाउनुअघि प्रतिक्रिया टोलीले हरेक टिकट समीक्षा गर्छ, र अब के हुन्छ भन्ने तपाईंलाई भनिनेछ।',
  'review.stillNeeded': 'अझै {n} विवरण चाहिन्छ: {slots}।',
  'review.required': 'आवश्यक',
  'review.optional': 'ऐच्छिक',
  'review.namePlaceholder': 'जस्तै सीता गुरुङ',
  'review.victimNamePlaceholder': 'जस्तै कमला गुरुङ',
  'review.phonePlaceholder': 'जस्तै 9801234567',
  'review.phoneInvalid': 'यो प्रतिक्रियादाताले डायल गर्न मिल्ने नम्बरजस्तो देखिँदैन।',
  'review.summaryPlaceholder':
    'आफ्नै शब्दमा: के भइरहेको छ र उनलाई के चाहिन्छ?',
  'review.locationPlaceholder': 'जस्तै घर नं. १२, बागबजार, काठमाडौं — निलो ढोका, तल्लो तला',
  'review.pickSupport': 'सही टोलीलाई खबर पुग्न कम्तीमा एउटा छान्नुहोस्।',
  'review.targetHours': '{n} घण्टा लक्ष्य',
  'review.targetMinutes': '{n} मिनेट लक्ष्य',
  'review.onBehalf.for': 'अरू कसैकोपक्षि जनाइदैछु',
  'review.onBehalf.forBody':
    'प्रतिक्रियादाताले सीधै उनलाई भेट्न सकून् भन्ने उनको नाम र नम्बर आवश्यक हुन्छ।',
  'review.onBehalf.self': 'सहयोग चाहिने व्यक्ति म नै हुँ',
  'review.onBehalf.selfBody': 'तपाईंको आफ्नै नाम र नम्बरले तपाईं र टिकट दुवै ओगट्छ।',
  'review.voice.saveLabel': 'तपाईंले भनेका कुरा यस टिकटसँगै सुरक्षित गर्नुहोस्',
  'review.voice.saveBody':
    'भनिएका {n} सन्देश टिकटमा सुरक्षित हुनेछन्। तपाईं आफ्नो टिकटबाट फेरि पढ्न सक्नुहुन्छ, तपाईंको केसम्बन्धी काम गर्ने प्रतिक्रियादाताले पनि।',
  'review.voice.discardBody':
    'माथिका विवरणहरू मात्र सुरक्षित हुनेछन्। तपाईंले पठाउँदा भनिएका सन्देश हटाइनेछन्।',
  'review.voice.hide': 'प्रतिलेखन लुकाउनुहोस्',
  'review.voice.show': 'प्रतिलेखन पढ्नुहोस्',
  'review.voice.youSaid': 'तपाईंले भन्नुभयो: ',
  'review.voice.assistantSaid': 'सहायकले भन्यो: ',
  'review.voice.you': 'तपाईं',
  'review.voice.assistant': 'सहायक',

  // ---- post-submit receipt ------------------------------------------
  'receipt.title': 'तपाईंको टिकट पेश भयो',
  'receipt.body':
    'कसैलाई पठाउनुअघि प्रतिक्रिया टोलीले हरेक टिकट समीक्षा गर्छ। अब के हुन्छ भन्ने तपाईंले दिएको नम्बरमा भनिनेछ।',
  'receipt.row.reference': 'सन्दर्भ',
  'receipt.row.submitted': 'पेश भएको',
  'receipt.row.status': 'अवस्था',
  'receipt.row.support': 'सहयोग',
  'receipt.row.priority': 'प्राथमिकता',
  'receipt.row.location': 'स्थान',
  'receipt.ownedBefore': 'यो सन्दर्भ राख्नुहोस्। तपाईं',
  'receipt.ownedLink': 'आफ्ना टिकटहरूबाट',
  'receipt.ownedAfter': 'यस टिकटलाई अनुगमन गर्न, वा सन्देश थप्न सक्नुहुन्छ।',
  'receipt.orphanNote':
    'यो सन्दर्भ राख्नुहोस्। तपाईंले साइन इन नगरी यो दर्ता गर्नुभएको थियो, त्यसैले यसलाई खाताबाट पुनः खोल्न सकिँदैन — तपाईंलाई सम्पर्क गर्ने कुनै पनि प्रतिक्रिया टोलीलाई यो सन्दर्भ भन्नुहोस्।',
  'receipt.another': 'अरू केही जनाउनुहोस्',
  'receipt.done': 'सम्पन्न',

  // ---- assistant shell ---------------------------------------------
  'assistant.name': 'FLARE राहत सहायक',
  'assistant.online': 'अनलाइन · {n} प्रतिक्रिया विभागमा पुग्छ',
  'assistant.modeLabel': 'सहायकको मोड',
  'assistant.mode.chat': 'लेखेर कुराकानी',
  'assistant.mode.voice': 'प्रत्यक्ष आवाज',
  'assistant.restore': 'प्यानलको आकार फर्काउनुहोस्',
  'assistant.expand': 'पूरा स्क्रिनमा विस्तार गर्नुहोस्',
  'assistant.close': 'राहत सहायक बन्द गर्नुहोस्',
  'assistant.launch': 'FLARE राहत सहायक खोल्नुहोस्',
  'assistant.launchUnread':
    'FLARE राहत सहायक खोल्नुहोस्। अघिल्लो कुराकानीबाट नयाँ जानकारी समाइएको छ।',
  'assistant.idleHint': 'सुरु गर्न आफ्नो परिस्थिति वर्णन गर्नुहोस्।',

  // ---- inline action card ------------------------------------------
  'cardBanner.ariaLabel': 'जानकारी संकलित भयो। अनुरोध {dept} मा पुगाइँदै।',
  'cardBanner.confident': '{n}% निश्चित',
  'cardBanner.dismiss': 'यो संकलित अनुरोध हटाउनुहोस्',
  'cardBanner.routing': 'अनुरोध पुगाइँदै',
  'cardBanner.crews': '{total} मध्ये {available} टोली उपलब्ध · औसत {n} मिनेट',
  'cardBanner.dispatchedTo': '{dept} मा पठाइयो',
  'cardBanner.track': '{code} अनुगमन गर्नुहोस्',
  'cardBanner.confirm': 'पुष्टि गरी अनुरोध पठाउनुहोस्',
  'cardBanner.edit': 'मिलेन — सम्पादन गर्नुहोस्',
  'cardBanner.srConfirmed': 'अनुरोध पुष्टि भयो र {dept} मा पठाइयो।',
  'cardBanner.srPending': 'जानकारी संकलित भयो। {dept} मा अनुरोध पठाउन पुष्टि गर्नुहोस्?',

  // ---- live voice line ----------------------------------------------
  'voice.idle': 'आवाज तयार छ',
  'voice.idleHint': 'बोल्न सुरु गर्न बटन थिच्नुहोस्',
  'voice.connecting': 'जडान हुँदै…',
  'voice.connectingHint': 'आवाज च्यानल खोल्दै',
  'voice.listening': 'सुन्दैछु',
  'voice.listeningHint': 'स्वाभाविक रूपमा बोल्नुहोस्। केही नबुझेमा म सोध्छु।',
  'voice.speaking': 'बोल्दैछु',
  'voice.speakingHint': 'जहिले पनि मलाई रोक्न सक्नुहुन्छ — बोल्न थाल्नुहोस्',
  'voice.muted': 'माइक्रोफोन बन्द',
  'voice.mutedHint': 'म तपाईंलाई सुन्न सक्दिन। तयार भएपछि आवाज खोल्नुहोस्।',
  'voice.error': 'आवाज उपलब्ध छैन',
  'voice.errorHint': 'तलको लेखेर कुराकानी अझै काम गर्छ',
  'voice.iAmListening': 'म सुन्दैछु…',
  'voice.youSaid': 'तपाईंले भन्नुभयो',
  'voice.mute': 'माइक्रोफोन बन्द गर्नुहोस्',
  'voice.unmute': 'माइक्रोफोन खोल्नुहोस्',

  // ---- the real Gemini Live session ----------------------------------
  'voice.reconnectingHint': 'पुनः जडान हुँदै — तपाईंको कुराकानी सुरक्षित छ',
  'voice.encrypted': 'इन्क्रिप्टेड',
  'voice.endSession': 'आवाज सत्र समाप्त गर्नुहोस्',
  'voice.iAmSpeaking': 'म बोल्दैछु — जहिले पनि मलाई रोक्न सक्नुहुन्छ',
  'voice.continueText': 'लेखेर कुराकानी जारी राख्नुहोस्',
  'voice.toldEverything': 'मैले सबै कुरा भनिसकें',
  'voice.nothingHeard': 'अहिलेसम्म केही सुनेको छैन',
  'voice.nothingLost': 'तपाईंले भन्नुभएको केही पनि गुमेको छैन।',
  'voice.startVoice': 'आवाज कुराकानी सुरु गर्नुहोस्',
  'voice.fail.rateLimited':
    'धेरै आवाज सत्र सुरु भयो। एक मिनेटपछि प्रयास गर्नुहोस्, वा लेखमा जारी राख्नुहोस्।',
  'voice.fail.unavailable':
    'अहिले आवाज उपलब्ध छैन। तपाईं लेखमा जारी राख्न सक्नुहुन्छ।',
  'voice.fail.unreachable':
    'आवाज सेवामा पुग्न सकिएन। तपाईं लेखमा जारी राख्न सक्नुहुन्छ।',
  'voice.fail.unknown':
    'आवाज सत्र सुरु गर्न सकिएन। तपाईं लेखमा जारी राख्न सक्नुहुन्छ।',
  'voice.fail.gaveUp':
    'आवाज जडान बारम्बार खसियो। तपाईं लेखमा जारी राख्न सक्नुहुन्छ, र तपाईंले भन्नुभएको केही पनि गुमेको छैन।',
  'voice.fail.socketRefused':
    'आवाज सेवाले जडान अस्वीकार गर्‍यो। तपाईं लेखमा जारी राख्न सक्नुहुन्छ।',
  'voice.fail.noSetup':
    'आवाज सत्र सुरु भएन। तपाईं लेखमा जारी राख्न सक्नुहुन्छ, र तपाईंले भन्नुभएको केही पनि गुमेको छैन।',

  // ---- filed ticket's spoken intake ---------------------------------
  'transcript.ariaLabel': 'मौखिक बयन',
  'transcript.loading': 'प्रतिलेखन लोड हुँदै…',
  'transcript.typed':
    'यो टिकट लेखेर भरिएको हो, त्यसैले देखाउनुपर्ने मौखिक कुराकानी छैन।',
  'transcript.reporterHint': 'तपाईंले हामीलाई दिएको सबै कुरा माथिका विवरणमा छ।',
  'transcript.title': 'कलमा के भनिएको थियो',
  'transcript.turn': '{n} पटक',
  'transcript.turns': '{n} पटक',
  'transcript.reporter': 'जनाउने व्यक्ति',
  'transcript.assistant': 'सहायक',

  // ---- /tickets/[id] ------------------------------------------------
  'ticket.opening': 'तपाईंको टिकट खोल्दै…',
  'ticket.signedIn.title': 'यो टिकट हेर्न साइन इन गर्नुहोस्',
  'ticket.signedIn.cta': 'साइन इन गर्नुहोस्',
  'ticket.signedIn.body': 'कुनै टिकट त्यही खाताबाट मात्र खोल्न सकिन्छ जसबाट दर्ता गरिएको थियो।',
  'ticket.missing.title': 'टिकट भेटिएन',
  'ticket.missing.cta': 'मेरा सबै टिकटहरू',
  'ticket.missing.body':
    'तपाईंको खातामा यस्तो सन्दर्भ भएको कुनै टिकट छैन। साइन इन नगरी दर्ता गर्नुभएको हो भने यहाँ पुनः खोल्न सकिँदैन — तपाईंलाई भेट्ने कुनै टोलीलाई सन्दर्भ भन्नुहोस्।',
  'ticket.fact.location': 'स्थान',
  'ticket.fact.filed': 'दर्ता भएको',
  'ticket.fact.support': 'चाहिने सहयोग',
  'ticket.fact.people': 'प्रभावित जनसंख्या',
  'ticket.fact.notRecorded': 'रेकर्ड छैन',
  'ticket.fact.priority': 'प्राथमिकता',
  'ticket.fact.contact': 'सम्पर्क नम्बर',
  'ticket.transcript.unavailable':
    'टिकट सेवा छोटो समय बन्द छ, त्यसैले प्रतिलेखन लोड हुन सकेन। तपाईंको टिकटमा असर पर्दैन।',
  'ticket.transcript.failed': 'यस कलको प्रतिलेखन लोड हुन सकेन।',
  'ticket.messages.title': 'यो टिकटबारे सन्देशहरू',
  'ticket.messages.degraded':
    'त्यो जवाफ अफलाइन सेटबाट आयो — प्रत्यक्ष सहायक पुग्न सकिएन। तपाईंको सन्देश टिकटमा पनि थपियो।',
  'ticket.messages.empty':
    'अझै कुनै सन्देश छैन। यहाँ थप्नुभएको कुरा यस टिकटमा काम गरिरहेको प्रतिक्रिया टोलीलाई पुग्छ।',
  'ticket.messages.replying': 'सहायकले जवाफ दिँदै…',
  'ticket.messages.inputAria': 'यो टिकटबारे सन्देश थप्नुहोस्',
  'ticket.messages.inputPlaceholder': 'प्रश्न सोध्नुहोस्, वा परिवर्तन भएको कुरा थप्नुहोस्…',
  'ticket.messages.send': 'पठाउनुहोस्',
  'ticket.messages.sending': 'पठाइँदै…',

  // ---- PortalError, resolved by `portalErrorKey` --------------------
  'portalError.not_signed_in': 'यो हेर्न साइन इन गर्नुपर्छ।',
  'portalError.forbidden': 'तपाईंको खातालाई यो गर्न अनुमति छैन।',
  'portalError.not_found': 'तपाईंको खातामा यस्तो कुनै टिकट छैन।',
  'portalError.unreachable': 'राहत सेवामा पुग्न सकिएन।',
  'portalError.unavailable':
    'टिकट सेवा अस्थायी रूपमा बन्द छ। केही गुमेन — केही समयपछि फेरि प्रयास गर्नुहोस्।',
  'portalError.unknown': 'हाम्रोतिर केही गडबड भयो। तपाईंका विवरण यथावत् छन्।',
  'portalError.claimMismatch':
    'त्यो सन्दर्भ र फोन नम्बर कुनै टिकटसँग मिल्दैन। दुवै जाँचेर फेरि प्रयास गर्नुहोस्।',

  // ---- /admin, the response queue ------------------------------------
  'admin.title': 'प्रतिक्रिया पङ्क्ति',
  'admin.subtitle':
    'सहायकमार्फत दर्ता भएका सबै टिकट, पहिलेका अवस्थादेखि। यहाँ एउटाको अवस्था बदल्दा त्यही प्रतिक्रियादाताले आफ्नो पृष्ठमा देख्छन्।',
  'admin.refresh': 'नवीकरण गर्नुहोस्',
  'admin.loading': 'पङ्क्ति लोड हुँदै…',
  'admin.filter.all': 'सबै',
  'admin.empty.title': 'पङ्क्तिमा केही छैन',
  'admin.empty.body': 'टिकट दर्ता भएकैमा यहाँ देखिन्छन्।',
  'admin.stats.ariaLabel': 'पङ्क्तिको सारांश',
  'admin.stats.total': 'जम्मा दर्ता भएको',
  'admin.stats.supportTitle': 'मानिसहरूले के मागिरहेका छन्',
  'admin.stats.supportFootnote':
    'एउटै टिकटमा एकभन्दा बढी प्रकारको सहयोग चाहिन सक्छ, त्यसैले यी जोडा दर्ता कुलभन्दा बढी हुन्छन्।',
  'admin.row.reporter': 'जनाउने व्यक्ति',
  'admin.row.location': 'स्थान',
  'admin.row.support': 'सहयोग',
  'admin.row.priority': 'प्राथमिकता',
  'admin.row.people': 'जनसंख्या',
  'admin.row.filed': 'दर्ता भएको',
  'admin.moveTo': 'यसमा सार्नुहोस्',
  'admin.saving': 'सुरक्षित गर्दै…',
  'admin.transcript.read': 'कलको प्रतिलेखन पढ्नुहोस्',
  'admin.error.forbidden':
    'तपाईंको खाता एडमिन अनुमतिसूचीमा छैन। यसमा समावेश गर्न ADMIN_EMAILS सेट गर्नुहोस्।',
  'admin.error.unreachable': 'राहत सेवामा पुग्न सकिएन।',
  'admin.error.unavailable': 'टिकट डाटाबेस बन्द छ। केही परिवर्तन भएको छैन।',
  'admin.error.unknown': 'पङ्क्ति लोड गर्दा केही गडबड भयो।',

  // ---- system lines the store writes into the transcript -------------
  'store.dispatchConfirmed':
    'पठाउने काम पुष्टि भयो। {code} रिपोर्ट बनाइयो र प्रतिक्रिया टोलीलाई पुगाइयो। तपाईं आफ्नो ड्यासबोर्डबाट अनुगमन गर्न सक्नुहुन्छ।',
  'store.ticketLogged':
    '{ticket} टिकट पेश भयो र {code} रूपमा दर्ता भयो। अब यो प्रतिक्रिया टोलीको समीक्षा पङ्क्तिमा छ — तिनीहरूले {contact} मा तपाईंलाई सम्पर्क गर्नेछन्।',
  'store.contactProvided': 'तपाईंले दिएको नम्बर',
  'store.captureDismissed':
    'संकलन रद्द गरियो। पछि पठाउनुपर्दा यही कुराकानीमा विवरण सुरक्षित छैन।',

  // ---- the assistant's own failure banner, keyed by `ticketErrorKey` ----
  'aiError.rejected':
    'सहायकले यो सन्देश स्वीकार गर्न सकेन। तपाईंका विवरण यथावत् छन् — केही समयपछि फेरि प्रयास गर्नुहोस्।',
  'aiError.stillMissing': 'केही आवश्यक विवरण अझै छैन।',
  'aiError.createFailed':
    'टिकट बनाउन सकिएन। तपाईंका विवरण यथावत् छन् — फेरि प्रयास गर्नुहोस्।',
  'aiError.unreachable':
    'राहत सेवामा पुग्न सकिएन। तपाईंका विवरण यथावत् छन् — केही समयपछि फेरि प्रयास गर्नुहोस्।',
  'aiError.serviceDown':
    'टिकट सेवा अस्थायी रूपमा बन्द छ र कुनै टिकट सुरक्षित भएको छैन। तपाईंले लेखेको सबै कुरा यथावत् छ — केही समयपछि फेरि प्रयास गर्नुहोस्।',
  'aiError.rejectedFields': 'सेवाले केही विवरण स्वीकार गरेन। चिन्ह लगाइएका फाँट हेर्नुहोस्।',

  // ---- report detail ------------------------------------------------
  'detail.mapAlt': '{area} मा {label} देखाउने नक्सा। यो डेमोमा अन्तरक्रियात्मक नक्सा उपलब्ध छैन।',
  'detail.notFound.title': 'रिपोर्ट भेटिएन',
  'detail.notFound.body':
    'ID {code} भएको कुनै रिपोर्ट भेटिएन। त्यो अर्को खाताको हुन सक्छ।',
  'detail.notFound.cta': 'मेरा रिपोर्टहरूमा फर्कनुहोस्',
  'detail.submitted': 'पेश गरिएको',
  'detail.reporter': 'जनाउने व्यक्ति',
  'detail.peopleAffected': 'प्रभावित हुने',
  'detail.affected': '{n} प्रभावित',
  'detail.channel.voice': 'आवाजमा जनाइएको',
  'detail.channel.sos': 'SOS बाट जनाइएको',
  'detail.channel.web': 'वेबमा जनाइएको',
  'detail.channel.chat': 'कुराकानीमा जनाइएको',
  'detail.contactResponder.title': 'आपतकालीन सम्पर्क',
  'detail.contactResponder.body': 'नजिकको टोली: एम्बुलेन्स द्रुत प्रतिक्रिया · ४ मिनेट',
  'detail.contactResponder.cta': 'प्रतिक्रियादातालाई सम्पर्क',
  'detail.copyId': 'ID प्रतिलिपि',
  'detail.print': 'यो रिपोर्ट छाप्नुहोस्',
  'detail.share': 'यो रिपोर्ट सेयर गर्नुहोस्',
  'detail.copy.copied': 'प्रतिलिपि भयो',
  'detail.copy.link': 'लिङ्क प्रतिलिपि भयो',
  'detail.copy.location': 'स्थान प्रतिलिपि भयो',
  'detail.copy.failed': 'प्रतिलिपि गर्न सकिएन',
  'detail.advance.title': 'अवस्था अद्यावधिक भयो',
  'detail.advance.body': 'यो रिपोर्टमा प्रतिक्रियादाताको कार्य दर्ता भयो।',
  'detail.minutes': '{n} मिनेट',
  'detail.target': 'लक्ष्य: {sla}',
  'detail.completed': 'पूरा भयो',
  'detail.tracking': 'अनुगमन भइरहेको छ',
  'detail.progress.title': 'प्रत्यक्ष प्रगति',
  'detail.progress.step': '{total} मध्ये {n} चरण',
  'detail.progress.demoControl':
    'डेमो नियन्त्रण: यो रिपोर्टमा अर्को प्रतिक्रियादाताको कार्य अनुकरण गर्नुहोस्।',
  'detail.progress.simulate': 'अर्को चरण अनुकरण',
  'detail.eventLog.title': 'घटना लग',
  'detail.eventLog.entries': '{n} प्रविष्टि',
  'detail.extracted.badge': 'FLARE ले निकालेको',
  'detail.extracted.title': 'संकलित जानकारी',
  'detail.extracted.body':
    'यी विवरण तपाईंको कुराकानी वा SOS सङ्केतबाट पढिएका हुन्। हरेकसँग सहायकको आत्मविश्वास देखाइन्छ, ताकि गलत बुझाइ पत्ता लगाउन सक्नुहोस्।',
  'detail.classification.title': 'वर्गीकरण',
  'detail.flags.title': 'प्रतिक्रियादाताका लागि संकेत',
  'detail.location.title': 'स्थान',
  'detail.location.address': 'ठेगाना',
  'detail.location.area': 'क्षेत्र',
  'detail.location.coords': 'निर्देशाङ्क',
  'detail.sharePin': 'पिन सेयर',
  'detail.assigned.title': 'सौंपिएको प्रतिक्रिया',
  'detail.assigned.crews': '{total} मध्ये {available} टोली · ~{n} मिनेट',
  'detail.assigned.unit': 'सौंपिएको एकाइ',
  'detail.assigned.eta': 'लगभग {n} मिनेटमा पुग्नेछ',
  'detail.contact.title': 'प्रतिक्रियादाताले तपाईंलाई कसरी भेट्ने',
  'detail.contact.none': 'सम्पर्क नगर्नुहोस्',
  'detail.contact.call': 'फोन कल मन पराउनुहुन्छ',
  'detail.contact.sms': 'एसएमएस मन पराउनुहुन्छ',
  'detail.contact.body':
    'यहिले पनि बदल्न सक्नुहुन्छ — प्रतिक्रियादाताले तपाईंको हालको रोजाइ सधैँ देख्नुहुन्छ।',
  'detail.contact.cta': 'सम्पर्क विवरण अद्यावधिक गर्नुहोस्',
  'detail.impact.title': 'यसले प्रभावित पार्ने',
  'detail.impact.counted': 'जन यस रिपोर्टमा गनी गरी जम्मा',
  'detail.exportPdf': 'PDF मा निर्यात',
  'detail.backToReports': 'सबै रिपोर्टमा फर्कनुहोस्',

  'report.status': 'अवस्था',
  'report.priority': 'प्राथमिकता',
  'report.department': 'विभाग',
  'report.reporter': 'प्रतिवेदक',
  'report.channel': 'माध्यम',
  'report.people': 'प्रभावित मानिस',
  'report.location': 'स्थान',
  'report.area': 'क्षेत्र',
  'report.landmark': 'चिनोह',
  'report.responder': 'प्रतिक्रियादाता',
  'report.timeline': 'समयरेखा',
  'report.timelineEmpty': 'यो अनुरोधमा अझै केही भएको छैन।',
  'report.extracted': 'हामीले बुझेको कुरा',
  'report.vulnerability': 'सङ्कट',
  'report.print': 'प्रिन्ट',
  'report.share': 'साझा',
  'report.notFound': 'रिपोर्ट भेटिएन',
  'report.notFoundBody':
    'यो रिपोर्ट यस सत्रमा छैन। रिपोर्ट मेमोरीमा रहन्छन्, त्यसैले पेज रिफ्रेस गर्दा स्टोर खाली हुन्छ।',
  'report.eta': '{n} मिनेटमा',
  'report.target': 'प्रतिक्रिया लक्ष्य',
  'report.updated': 'हालको अवस्था',
  'report.submitted': 'पेश गरिएको',

  'resources.title': 'राहत सहायता',
  'resources.subtitle':
    'खुला आश्रयस्थल, वितरण केन्द्र र नेपालका राष्ट्रिय आपतकालीन नम्बरहरू — सँगै FLARE कसरी काम गर्छ भन्ने सरल भाषामा जानकारी।',
  'resources.tabs': 'सहायताका प्रकार',
  'resources.tab.shelters': 'आश्रयस्थल',
  'resources.tab.supplies': 'वितरण केन्द्र',
  'resources.tab.contacts': 'आपतकालीन नम्बर',
  'resources.tab.guides': 'कसरी काम गर्छ',
  'resources.shelters.heading': 'खुला आश्रयस्थलहरू',
  'resources.shelters.full': 'भरिएको',
  'resources.shelters.spaces': '{n} ठाउँ',
  'resources.shelters.capacity': 'क्षमता',
  'resources.shelters.free': '{free} / {total} खाली',
  'resources.shelters.accessible': 'सीढीबिना पहुँच',
  'resources.shelters.fullAria': '{total} मध्ये {free} ठाउँ उपलब्ध',
  'resources.supplies.heading': 'राहत सामग्री वितरण केन्द्रहरू',
  'resources.supplies.available': 'उपलब्ध',
  'resources.supplies.cannotReach': 'वितरण केन्द्रमा पुग्न सक्नुहुन्न?',
  'resources.supplies.cannotReachBody':
    'सहायकलाई आफूलाई के चाहिन्छ भन्नुहोस्। रसद व्यवस्थापनले नजिकको आपूर्ति पठाउँछ — तपाईंलाई आफैं हिँड्नुपर्दैन।',
  'resources.supplies.cta': 'खाना र पानी माग्नुहोस्',
  'resources.guides.heading': 'मार्गदर्शन',
  'resources.guides.a11y': 'सुगम्यता',
  'resources.contacts.heading': 'राष्ट्रिय आपतकालीन नम्बरहरू',
  'resources.contacts.lead':
    'सर्ट कोड नेपालको कुनै पनि फोनबाट निःशुल्क हुन् र २४ घण्टा उत्तर दिन्छन्। FLARE मा पुग्न नसक्दा — नेटवर्क, डाटा वा खाता नभएमा — तिनलाई प्रयोग गर्नुहोस्, वा प्रतीक्षा गर्नु सुरक्षित नभएमा।',
  'resources.contacts.sosHeading': 'अहिले जीवन खतरामा छ?',
  'resources.contacts.sosBody':
    'पङ्क्तिमा नोब्नुहोस्। SOS पठाउनुहोस् र FLARE ले प्रतिक्रिया दलसमक्ष अत्यावश्यक अनुरोध राख्छ; माथिका नम्बरमा तपाईं फोन गरिरहन सक्नुहुन्छ।',
  'resources.contacts.dial': '{number} मा फोन गर्नुहोस्',
  'resources.guide.ai-words': 'तपाईंका शब्दसँग AI के गर्छ',
  'resources.guide.queue': 'पङ्क्ति किन रहन्छ',
  'resources.guide.location': 'तपाईंको स्थान कसले हेर्न सक्छ',
  'resources.guide.verified': 'प्रतिक्रियादाता कसरी प्रमाणित हुन्छन्',
  'resources.guide.prepared': 'विपत्तअघिको तयारी',
  'resources.guide.helping': 'कसैलाई सहयोग गर्दै हुनुहुन्छ भने',
  'resources.a11y.keyboard': 'पूर्ण किबोर्ड समर्थन',
  'resources.a11y.voice': 'आवाज पहिलो-क्रमको इनपुट',
  'resources.a11y.colour': 'कहिल्यै रङ मात्र होइन',
  'resources.a11y.motion': 'शान्त गति',

  'tickets.title': 'मेरा टिकटहरू',
  'tickets.subtitle':
    'तपाईंले हामीसँग मागेका सबै कुरा, र त्यसको अहिलेको अवस्था। खोलेर अवस्था हेर्नुहोस् वा प्रतिक्रिया टोलीलाई सन्देश थप्नुहोस्।',
  'tickets.newCta': 'नयाँ टिकट दर्ता गर्नुहोस्',
  'tickets.loading': 'तपाईंका टिकटहरू लोड हुँदै…',
  'tickets.open': 'खोल्नुहोस्',
  'tickets.empty': 'अझै कुनै टिकट छैन',
  'tickets.emptyCta': 'सहयोग सोध्नुहोस्',
  'tickets.emptyBody':
    'यस खातासँग केही जोडिएको छैन। तपाईंले सहयोग सोध्नुभएको हो भने त्यो जे भए पनि सुरक्षित छ — प्रतिक्रिया टोलीसँग तपाईंको नाम, नम्बर र स्थान छ।',
  'tickets.emptyClaimBefore': 'तपाईंले दर्ता गराएको टिकट',
  'tickets.emptyClaimEmphasis': 'साइन इन नगरी',
  'tickets.emptyClaimAfter':
    'आफैँ यहाँ देखिँदैन। हामीले दिएको सन्दर्भ र तपाईंले दिएको फोन नम्बर थपेर यसलाई जोड्नुहोस्।',
  'tickets.failure.signedIn.title': 'आफ्ना टिकटहरू हेर्न साइन इन गर्नुहोस्',
  'tickets.failure.signedIn.body':
    'टिकट तपाईंले दर्ता गर्दाको खातासँग जोडिएका हुन्छन्।',
  'tickets.failure.title': 'आफ्ना टिकटहरू लोड गर्न सकिएन',
  'tickets.failure.body': 'केही गुमेन। केही समयपछि फेरि प्रयास गर्नुहोस्।',
  'tickets.failure.retry': 'फेरि प्रयास गर्नुहोस्',

  // ---- claiming a ticket filed signed out ----------------------------
  'claim.collapsed': 'मैले साइन इन नगरी दर्ता गरेको थिएँ',
  'claim.title': 'साइन इन नगरी दर्ता गरेको टिकट थप्नुहोस्',
  'claim.body':
    'तपाईंको टिकट सुरक्षित भयो र प्रतिक्रिया टोलीसँग छ। यहाँ अनुगमन गर्न, रसिदमा भएको सन्दर्भ र तपाईंले दिएको फोन नम्बर दिनुहोस्।',
  'claim.reference': 'टिकट सन्दर्भ',
  'claim.phone': 'तपाईंले दिएको फोन नम्बर',
  'claim.checking': 'जाँच्दै',
  'claim.submit': 'यो टिकट थप्नुहोस्',
  'claim.cancel': 'रद्द गर्नुहोस्',
  'claim.footnote':
    'दुवै विवरण टिकटसँग ठीकै मिल्नुपर्छ। टिकट पहिले नै कुनै खातामा थपिएको भए, त्यही खाताबाट मात्र प्रयोग गर्न सकिन्छ — यसलाई सार्ने कुनै तरिका छैन, त्यसैले अरूले तपाईंबाट लिएर जान सक्दैन।',

  'login.title': 'साइन इन',
  'login.continue': 'Google मार्फत जारी राख्नुहोस्',

  'toast.captured.title': 'जानकारी सम्हालियो',
  'toast.captured.body': 'सहायकले अनुरोध छुट्याएर पठाउन तयार पार्‍यो।',
  'toast.sosSent.title': 'आपतकालीन सूचना पठाइयो',
  'toast.sosSent.body': '{code} वर्गीकरणका लागि प्रतिक्रिया पङ्क्तिमा छ।',
  'msg.reportCreated':
    'पठाउन पुष्टि भयो। {code} सिर्जना भई प्रतिक्रिया दलमा पठाइयो। तपाईं ड्यासबोर्डबाट अनुगमन गर्न सक्नुहुन्छ।',
  'msg.ticketCreated':
    'टिकट {id} पेश गरी {code} मा दर्ता भयो। अब यो प्रतिक्रिया दलको समीक्षा पङ्क्तिमा छ — तिनले {phone} मा {name} लाई सम्पर्क गर्नेछन्।',
  'msg.ticketSubmitted': 'टिकट {id} AI राहत सहायकमार्फत पेश गरियो',
};

/** Taxonomy tables, keyed by the id already on the object. */
export type Table =
  | 'category'
  | 'categoryHint'
  | 'department'
  | 'departmentShort'
  | 'coverage'
  | 'priority'
  | 'adminStatus'
  | 'stage'
  | 'stageShort'
  | 'stageChip'
  | 'slot'
  | 'slotHint'
  | 'statLabel'
  | 'ticketStatus'
  | 'ticketStatusDetail'
  | 'statDelta'
  | 'status'
  | 'support'
  | 'shelterTag';

/** Nepali overrides for taxonomy labels. English stays on the object. */
export const NE_TABLES: Record<Table, Record<string, string>> = {
  category: {
    medical: 'चिकित्सा आपतकाल',
    shelter: 'आश्रय अनुरोध',
    'food-water': 'खाना र पानी',
    'search-rescue': 'खोज र उद्धार',
    infrastructure: 'पूर्वाधार जोखिम',
    'missing-person': 'हराएको व्यक्ति',
    evacuation: 'निकाल्ने सहयोग',
    security: 'सुरक्षा सहायता',
  },
  /**
   * The sub-label on a dashboard category tile.
   *
   * English is `description.split(',')[0]`, so these are written to the same
   * one-clause budget rather than translating the whole sentence — the tile is
   * 11px text in an eight-column grid, and a full clause wraps to three lines.
   */
  categoryHint: {
    medical: 'चोट र बिरामी',
    shelter: 'सुरक्षित आवास',
    'food-water': 'सफा पानी',
    'search-rescue': 'जालिएका व्यक्ति',
    infrastructure: 'ग्यास र आगो',
    'missing-person': 'हराएका बालबालिका',
    evacuation: 'सुरक्षित बाहिर निकाल्ने',
    security: 'हिंसा र चोरी',
  },
  department: {
    'dept-medical': 'आपतकालीन चिकित्सा सेवा',
    'dept-sar': 'शहरी खोज तथा उद्धार',
    'dept-shelter': 'आपतकालीन आश्रय तथा आवास',
    'dept-logistics': 'राहत सामग्री तथा आपूर्ति',
    'dept-fire': 'आगो तथा जोखिम न्यूनीकरण',
    'dept-security': 'नागरिक सुरक्षा',
  },
  /**
   * Reporter-facing lifecycle wording, keyed by the same ids as `STAGES`.
   *
   * Separate from `stage` on purpose: `stage` names the routing state a
   * responder's queue is in ("Triage"), this names what the reporter is told
   * ("Under review"). Collapsing them would make one of the two screens lie.
   */
  /** `DASHBOARD_STATS[].label` — the tile heading. */
  statLabel: {
    total: 'कुल रिपोर्ट',
    review: 'समीक्षामा',
    dispatched: 'पठाइएका',
    resolved: 'समाधान भएका',
  },
  /** `DASHBOARD_STATS[].deltaLabel` — the period the delta is measured over. */
  statDelta: {
    total: 'गत २४ घण्टा तुलनामा',
    review: 'वर्गीकरणको लाइन',
    dispatched: 'टोली सडकमा',
    resolved: 'गत २४ घण्टा',
  },
  /**
   * The intake slots, keyed by the `SlotName` on the wire.
   *
   * These are field names rather than copy, and they are the same names the
   * backend uses in `missing` / `next_questions`, so they get the table
   * treatment: English stays in `SLOT_LABELS` (which `lib/ticket-intake.ts`
   * also uses headlessly) and the Nepali lives here.
   */
  slot: {
    reporterName: 'तपाईंको नाम',
    reporterPhone: 'तपाईंको सम्पर्क नम्बर',
    victimName: 'सहयोग चाहिने व्यक्ति — नाम',
    victimPhone: 'सहयोग चाहिने व्यक्ति — नम्बर',
    summary: 'के भइरहेको छ',
    location: 'तिनीहरू कहाँ छन्',
    supportNeeded: 'कुन सहयोग चाहिन्छ',
    urgency: 'कत्तिको आवश्यकता',
    peopleAffected: 'कति जना',
  },
  slotHint: {
    reporterName: 'प्रतिक्रियादातालाई थाहा हुन्छ कसलाई फर्कने।',
    reporterPhone: 'प्रतिक्रियादाताले साँच्चै डायल गर्न सक्ने नम्बर।',
    victimName: 'तपाईं अरूकोपक्षि जनाइदा मात्र चाहिन्छ।',
    victimPhone: 'उनको नम्बर, भएमा। तपाईंको भन्दा फरक।',
    summary: 'दुई-तीन वाक्य भए पुग्छ।',
    location: 'सडक, भवन, तला, र देखिने कुनै पनि कुरा।',
    supportNeeded: 'लागू हुने हरेक प्रकारको सहयोग छान्नुहोस्।',
    urgency: 'अत्यावश्यक भनेको अहिले नै कसै जीवन जोखिममा छ।',
    peopleAffected: 'ऐच्छिक, तर सही मात्रा पठाउन मद्दत गर्छ।',
  },
  /**
   * Reporter-facing ticket lifecycle, keyed by the backend's `TicketStatus`.
   *
   * Five operational states, five sentences — the collapsing into three phases
   * happens in `PHASES` on the way in, not in the translation, so a status a
   * responder sets always has exactly one reporter-facing wording.
   */
  ticketStatus: {
    submitted: 'अझै समीक्षा भएको छैन',
    under_review: 'काम भइरहेको छ',
    dispatched: 'काम भइरहेको छ — पठाइएको',
    resolved: 'पूरा भयो',
    closed: 'पूरा भयो — बन्द',
  },
  ticketStatusDetail: {
    submitted: 'प्राप्त भयो, प्रतिक्रिया टोलीले हेर्नुको पर्खाइमा छ।',
    under_review: 'प्रतिक्रिया टोलीले तपाईंको अनुरोध समीक्षा गरिरहेको छ।',
    dispatched: 'यस टिकटको स्थानमा एकाइ पठाइएको छ।',
    resolved: 'यस टिकटको प्रतिक्रिया पूरा भयो।',
    closed: 'यो टिकट बन्द गरिएको छ।',
  },
  /**
   * The **operator's** status names, keyed by the raw `TicketStatus`.
   *
   * Deliberately a different table from `ticketStatus`. The reporter reads
   * "not reviewed yet" and waits; the person working the queue needs to know
   * whether it is `submitted` or `under_review` because those are different
   * amounts of work. Translating the reporter's sentence here would make the
   * queue lie to the only person in the system who can act on it.
   */
  adminStatus: {
    submitted: 'पेश भएको',
    under_review: 'समीक्षा हुँदै',
    dispatched: 'पठाइएको',
    resolved: 'समाधान भएको',
    closed: 'बन्द गरिएको',
  },
  stageChip: {
    submitted: 'पेश भयो',
    triage: 'समीक्षामा',
    dispatched: 'पठाइयो',
    'on-site': 'स्थानमा पुगे',
    resolved: 'समाधान भयो',
  },
  /** The rail and triage-feed abbreviation: `EMS`, `USAR`, … */
  departmentShort: {
    'dept-medical': 'एम्बुलेन्स',
    'dept-sar': 'उद्धार',
    'dept-shelter': 'आश्रय',
    'dept-logistics': 'आपूर्ति',
    'dept-fire': 'दमचल',
    'dept-security': 'सुरक्षा',
  },
  coverage: {
    'dept-medical': 'राष्ट्रिय एम्बुलेन्स, २४ घण्टा',
    'dept-sar': 'काठमाडौं घाटी, कास्की, चितवन',
    'dept-shelter': 'काठमाडौं, ललितपुर, भक्तपुर',
    'dept-logistics': 'जिल्ला ७७ वटै',
    'dept-fire': 'घाटीका नगरपालिका, औद्योगिक क्षेत्र',
    'dept-security': 'राष्ट्रिय',
  },
  priority: {
    critical: 'अत्यावश्यक',
    high: 'उच्च',
    medium: 'मध्यम',
    low: 'न्यून',
  },
  stage: {
    submitted: 'रिपोर्ट पेश भयो',
    triage: 'AI वर्गीकरण र विभाग निर्धारण',
    dispatched: 'प्रथम उद्धारकर्ता पठाइए',
    'on-site': 'स्थानमा सहयोग',
    resolved: 'समाधान भयो',
  },
  stageShort: {
    submitted: 'पेश भयो',
    triage: 'वर्गीकरण',
    dispatched: 'पठाइयो',
    'on-site': 'स्थलमा',
    resolved: 'समाधान भयो',
  },
  status: {
    available: 'उपलब्ध',
    strained: 'व्यस्त',
    overloaded: 'अधिभारित',
    offline: 'बन्द',
  },
  support: {
    rescue: 'उद्धार टोली',
    'relief-supplies': 'खाना, लुगा र आवास',
    medical: 'चिकित्सा सहयोग',
    security: 'सुरक्षा सहायग',
  },
  shelterTag: {
    beds: 'बेड',
    showers: 'स्नान',
    'medical-staff': 'चिकित्सकीय कर्मचारी',
    childcare: 'बाल स्याहार',
    charging: 'चार्जिङ',
    blankets: 'बल',
    water: 'पानी',
    food: 'खाना',
  },
};

/**
 * The BCP 47 tag `Intl` should format dates and times in.
 *
 * Kept beside the tables so every call site picks the same tag; the alternative
 * is a `locale === 'ne' ? ... : ...` in six components, one of which is
 * guaranteed to be wrong.
 */
export function intlLocale(locale: Locale): string {
  return locale === 'ne' ? 'ne-NP' : 'en-US';
}

/**
 * Date/time options shared by every timestamp in the app.
 *
 * `numberingSystem: 'latn'` is load-bearing, not a preference — see the note
 * about digits at the top of this file. A `ne-NP` date without it renders as
 * `२६ सेप्टेम्बर` next to a `TKT-000042` reference and a phone number a
 * responder has to read back, and mixed digit systems in one block is how a
 * reference gets misread.
 */
export const INTL_DATE_TIME: Intl.DateTimeFormatOptions = {
  dateStyle: 'medium',
  timeStyle: 'short',
  numberingSystem: 'latn',
};

/**
 * Coverage, for the switcher to state out loud.
 *
 * The one thing a partial translation must not do is look finished. Taxonomy
 * labels count alongside sentences because most of what a user reads on a
 * triage screen is a label, not a paragraph.
 */
export function localeCoverage(locale: Locale): { translated: number; total: number } {
  const sentences = locale === 'ne' ? Object.keys(NE).length : Object.keys(EN).length;
  const labelKeys = Object.values(NE_TABLES).reduce((n, t) => n + Object.keys(t).length, 0);
  const total = Object.keys(EN).length + labelKeys;
  return { translated: sentences + (locale === 'ne' ? labelKeys : 0), total };
}
