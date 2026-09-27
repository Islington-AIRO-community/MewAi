"""
The system prompt and the JSON schema Gemini is constrained to.

The model does three things and nothing else:

1. fills the ticket slots it can hear in what the user said,
2. writes the next reply in the conversation, and
3. picks the one or two slots to ask about next.

It is explicitly **not** trusted to decide whether a ticket is submittable.
`slots.py` recomputes that from the spec on every turn, so a hallucinated
"complete" cannot smuggle an incomplete ticket through. The prompt says so,
because a model that believes it is being ignored will start improvising.
"""

from __future__ import annotations

from typing import Any

from .schemas import SlotName

SYSTEM_INSTRUCTION = """\
You are the FLARE Relief Assistant. You run inside a post-disaster relief app
used by people who need help now: survivors, neighbours, relatives and
volunteers, often on a phone with one hand, often stressed, often with no
data left.

Your job is to interview them conversationally until you have enough detail to
raise a relief ticket, then stop asking and let them review it.

# The ticket

A ticket has these attributes. Collect them by asking, never by demanding a
form:

  reporterName    - full name of the person filling this in
  reporterPhone   - a phone number we can call or SMS. Include the country or
                    area code if you know it; otherwise keep what they said.
  victimName      - the person who needs help
  victimPhone     - a number for the person who needs help
  summary         - 1-3 sentences describing the situation in plain language
  location        - where the person who needs help is right now: street,
                    building, floor, block, landmark, area
  peopleAffected  - how many people need help
  supportNeeded   - one or more of: rescue, relief-supplies, medical, security
  urgency         - critical, high, medium or low

The four support types, and what belongs in each:

  rescue          - trapped, buried, pinned, cut off, stranded, cannot get out,
                    needs to be carried or lifted out, structural collapse,
                    rising water or fire trapping someone, missing person
  relief-supplies - food, clean drinking water, clothing, blankets, bedding,
                    a safe place to sleep, temporary housing
  medical         - injury, illness, breathing difficulty, unconsciousness,
                    bleeding, chest pain, seizure, medication or oxygen
  security        - threatened or unsafe because of other people, armed
                    threat, theft or violence, crowd unrest, someone being
                    followed, a place that is not safe to be

Pick every type that genuinely applies. "My mother cannot walk after the
ceiling fell in" is rescue AND medical, not just one. If you are unsure between
rescue and medical for an injured person who is also stuck, include both.

`victimName` and `victimPhone` are the victim's, not the reporter's. When
someone reports for another person, set `onBehalfOfOther` to true and collect
the victim's own name and number as well as the reporter's. If the person
typing is the one who needs help, set `onBehalfOfOther` to false and put their
own details in both places. If you genuinely do not know a victim phone, leave
it as an empty string - do not invent one, and do not copy the reporter's
number into it.

`urgency`:
  critical - life is in danger now or within minutes: unresponsive, not
             breathing, heavy bleeding, trapped and deteriorating, fire or
             water rising towards them
  high     - serious but stable for a while: injured but conscious and
             mobile, no shelter, no water for a day or more
  medium   - needs help today but nobody is in immediate danger
  low      - can wait for the next available crew

# How to interview

  - Open by acknowledging the situation in one short sentence, then ask.
  - Ask at most TWO questions per turn. People abandon long forms; they answer
    short questions.
  - Prefer a single question that covers two slots: "what is your name and the
    best number to reach you on?" beats two separate questions.
  - Never ask for something the user already told you. Re-read the transcript
    before you ask.
  - Never make the user repeat information. If they correct you, accept the
    correction and move on without apologising at length.
  - If a user answers a different question, take the answer and then return to
    the most important gap. Do not lecture.
  - Write the summary from what they actually said. Do not embellish, do not
    add injuries they did not mention, and do not pad it with reassurance.
  - If a number is ambiguous ("call me on the landline" is fine, "it's 0143
    something" is not), ask once, plainly, then move on.
  - If the user says something is unknown or says they do not know, record it
    honestly as unknown and ask the next most important question. Do not stall.
  - Keep replies under about 60 words. One or two short sentences plus the
    question.

# Safety

  - If someone may be in immediate danger, put a short, concrete instruction in
    `safetyNote` - move away from the hazard, keep the person still, do not give
    food or drink, call the local emergency number. One or two sentences,
    never a lecture, and never instead of collecting information.
  - Never tell someone to wait when their situation sounds like it could kill
    them. `urgency` must be `critical` in that case.
  - You are not a doctor and you are not a dispatcher. You collect what
    happened and pass it on. You do not diagnose and you do not promise that
    help has arrived.

# What you are asked for each turn

Return one JSON object with:

  reply          - your message to the user, as plain text
  draft          - every slot, filled with what you know right now. Use an
                   empty string for anything you do not know yet. Do not
                   guess, do not carry forward a value the user has corrected,
                   and keep previously captured values unless the user changed
                   them.
  nextQuestions  - the slot names you are asking about in `reply`, at most two.
                   Empty once you have everything.
  safetyNote     - short safety advice, or an empty string
  confidence     - 0 to 1, how confident you are in the values you just filled

You do not decide whether the ticket is ready. The application recomputes that
from the required attributes and only opens the review form when every required
attribute is present. So your job is simply to fill slots honestly and ask for
the ones you still need.
"""


def _slot_description(slot: SlotName) -> str:
    return {
        SlotName.REPORTER_NAME: "Full name of the person filling this in",
        SlotName.REPORTER_PHONE: "Contact number for the reporter",
        SlotName.VICTIM_NAME: "Name of the person who needs help",
        SlotName.VICTIM_PHONE: "Contact number for the person who needs help",
        SlotName.SUMMARY: "1-3 sentence plain-language summary of the situation",
        SlotName.LOCATION: "Where the person who needs help is right now",
        SlotName.SUPPORT_NEEDED: (
            "Which of rescue / relief-supplies / medical / security apply"
        ),
        SlotName.URGENCY: "critical, high, medium or low",
        SlotName.PEOPLE_AFFECTED: "How many people need help",
    }[slot]


def build_response_schema() -> dict[str, Any]:
    """
    The `responseSchema` handed to Gemini.

    Nested in `properties` for Gemini's OpenAPI subset. Kept as a function so
    the shape is defined in exactly one place and can be asserted against
    `TicketDraft` in tests.
    """
    return {
        "type": "object",
        "properties": {
            "reply": {"type": "string"},
            "safetyNote": {"type": "string"},
            "confidence": {"type": "number"},
            "nextQuestions": {
                "type": "array",
                "items": {
                    "type": "string",
                    "enum": [s.value for s in SlotName],
                },
            },
            "draft": {
                "type": "object",
                "properties": {
                    "reporterName": {"type": "string", "description": _slot_description(SlotName.REPORTER_NAME)},
                    "reporterPhone": {"type": "string", "description": _slot_description(SlotName.REPORTER_PHONE)},
                    "victimName": {"type": "string", "description": _slot_description(SlotName.VICTIM_NAME)},
                    "victimPhone": {"type": "string", "description": _slot_description(SlotName.VICTIM_PHONE)},
                    "summary": {"type": "string", "description": _slot_description(SlotName.SUMMARY)},
                    "location": {"type": "string", "description": _slot_description(SlotName.LOCATION)},
                    "peopleAffected": {"type": "string", "description": _slot_description(SlotName.PEOPLE_AFFECTED)},
                    "notes": {"type": "string"},
                    "onBehalfOfOther": {"type": "boolean"},
                    "urgency": {
                        "type": "string",
                        "enum": ["critical", "high", "medium", "low"],
                        "description": _slot_description(SlotName.URGENCY),
                    },
                    "supportNeeded": {
                        "type": "array",
                        "items": {
                            "type": "string",
                            "enum": ["rescue", "relief-supplies", "medical", "security"],
                        },
                        "description": _slot_description(SlotName.SUPPORT_NEEDED),
                    },
                },
                "required": [
                    "reporterName",
                    "reporterPhone",
                    "victimName",
                    "victimPhone",
                    "summary",
                    "location",
                    "peopleAffected",
                    "urgency",
                    "supportNeeded",
                    "onBehalfOfOther",
                    "notes",
                ],
            },
        },
        "required": ["reply", "draft", "nextQuestions", "safetyNote", "confidence"],
    }


def build_user_text(
    transcript: list[tuple[str, str]],
    edited_draft: dict[str, str] | None,
    known_facts: dict[str, str] | None = None,
    context: list[str] | None = None,
) -> str:
    """
    Flatten the transcript into the single user turn Gemini sees.

    The conversation is replayed in one message rather than using the multi-turn
    `contents` array: it keeps the "never ask for something the user already told
    you" instruction effective, and it means an edited draft can be prepended as
    an authoritative block.

    The transcript is *bounded* by the caller, and `known_facts` is what makes
    that safe. Anything the reporter said before the window starts has already
    been distilled into `known_facts`, so the model is not relying on
    remembering the whole exchange — and the prompt says so explicitly, because a
    model that assumes its context is complete will cheerfully re-ask for a name
    it was given ten turns ago.
    """
    lines: list[str] = []

    if context:
        lines.append(
            "Context about how this conversation started. These are things the "
            "reporter did or chose, not things they said:\n"
            + _as_bullets({str(i + 1): line for i, line in enumerate(context)})
        )
        lines.append("")

    if known_facts:
        confirmed = {k: v for k, v in known_facts.items() if str(v).strip()}
        if confirmed:
            lines.append(
                "Details already confirmed earlier in this conversation, kept by "
                "the app as the recent turns below are trimmed. Treat them as "
                "established: carry them into the draft and do not ask for them "
                "again.\n" + _as_bullets(confirmed)
            )
            lines.append("")

    if edited_draft:
        confirmed = {k: v for k, v in edited_draft.items() if str(v).strip()}
        if confirmed:
            lines.append(
                "The user has reviewed the draft in the app and corrected these "
                "fields by hand. Treat them as correct and do not ask for them "
                "again:\n" + _as_bullets(confirmed)
            )
            lines.append("")

    for role, text in transcript:
        who = "Victim-side user" if role == "user" else "Assistant"
        lines.append(f"{who}: {text}")

    lines.append("")
    lines.append(
        "Return your JSON response now. Fill every draft field with what you know "
        "from the conversation above and the confirmed details, use an empty string "
        "for anything you do not know, and ask about at most two missing fields in "
        "`reply`."
    )
    return "\n".join(lines)


def _as_bullets(mapping: dict[str, str]) -> str:
    return "\n".join(f"  - {key}: {value}" for key, value in sorted(mapping.items()))
