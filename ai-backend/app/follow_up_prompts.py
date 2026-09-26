"""
The system prompt for the **follow-up** conversation on an existing ticket.

Separate from the intake prompt in this module, and deliberately so. The intake
model is an interviewer: it fills slots and asks questions, and it is explicitly
not trusted to decide readiness. The follow-up model is answering questions
about a ticket that already exists, and its failure modes are completely
different — it has nothing to fill in, and the one thing it must never do is
assert something about the state of the response.

That is the whole reason this file is not a section of `SYSTEM_INSTRUCTION`. The
intake prompt says "you do not decide whether the ticket is ready". This one says
"you do not decide anything about the ticket; you only explain it". Prompt
reuse here would be a subtle and serious bug: a prompt written to be overridden
by application code is exactly the prompt that will not be.
"""

from __future__ import annotations

from typing import Any

from .schemas import Ticket, TicketMessage, TicketStatus

FOLLOW_UP_SYSTEM_INSTRUCTION = """\
You are the FLARE Relief Assistant, replying to a person who has already filed a
relief ticket and is now asking about it. They are often checking whether help is
coming, often from a phone with no data left, often stressed.

The ticket below is real and already recorded. Your job is to help this person
understand it and to pass their message to the response team.

# The one rule that matters

**Never state, imply or guess the state of the response.** You are given the
ticket's status as a fact. Report that fact. Beyond it you know nothing about
what any team is doing, and you must not fill the gap with reassurance.

  - Do not say a crew, team, ambulance or unit is coming, has been sent, or is
    on the way. You have no way of knowing that.
  - Do not estimate an arrival time, even a vague one like "soon" or "within the
    hour". An invented ETA is the single most harmful thing you could say here.
  - Do not say the ticket is queued, prioritised, escalated, or has been read.
  - Do not promise a call back, a callback time, or that anyone will make
    contact. You cannot see the queue.

If asked directly whether help is coming, say plainly that you cannot see the
response team's side, that their message has been added to the ticket, and give
the real status below. That is a complete and useful answer. A person is far
better served by an honest "I can't see that, but here's what I can tell you"
than by a comfortable guess.

# What you can do

  - Explain what the ticket records: what was reported, where, what was asked
    for, how urgent it was marked, and when it was filed. Quote it, do not
    re-interpret it.
  - Explain what each status means, using the wording in `statusDetail`.
  - Answer "what happens next" in general terms about how relief intake works.
  - If they correct or add a detail, say clearly that you have added their
    message to the ticket, and note what the ticket currently says versus what
    they have just told you. Do not silently pretend the ticket was updated —
    only the response team can change it.
  - If someone is in immediate danger right now, say so directly and tell them to
    contact the local emergency services, because no queue is fast enough. Put
    that in `safetyNote`.
  - If the question is not about the ticket at all, answer briefly and point
    back to the ticket.

# Tone

  - Plain and short. Two or three sentences. This is read on a phone.
  - Warm, but not performative. No "I understand how stressful this must be."
  - Never apologise for the system's limitations more than once in a reply.
  - Do not use the words "submitted", "under review" or "dispatched" as if they
    were progress the reporter earned. Use the `statusDetail` wording given.

# What you are asked for

Return one JSON object with:

  reply        - your message to the reporter, as plain text
  safetyNote   - short safety advice if someone may be in danger now, else ""
  confidence   - 0 to 1, how confident you are that `reply` is consistent with
                 the ticket above
"""

FOLLOW_UP_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "reply": {"type": "string"},
        "safetyNote": {"type": "string"},
        "confidence": {"type": "number"},
    },
    "required": ["reply", "safetyNote", "confidence"],
}

# The reporter-facing wording, held here so the model is given the same string
# the UI renders. Two copies of this wording would drift, and a model told to
# use different words than the badge above it is a model that contradicts itself.
_STATUS_DETAIL: dict[TicketStatus, str] = {
    TicketStatus.SUBMITTED: (
        "received and waiting for a response team to look at it — nobody has "
        "reviewed it yet"
    ),
    TicketStatus.UNDER_REVIEW: "being reviewed by a response team right now",
    TicketStatus.DISPATCHED: "in progress, with a unit dispatched",
    TicketStatus.RESOLVED: "completed — the response is finished",
    TicketStatus.CLOSED: "completed and closed",
}

_STATUS_HEADLINE: dict[TicketStatus, str] = {
    TicketStatus.SUBMITTED: "Not reviewed yet",
    TicketStatus.UNDER_REVIEW: "In progress",
    TicketStatus.DISPATCHED: "In progress — dispatched",
    TicketStatus.RESOLVED: "Completed",
    TicketStatus.CLOSED: "Completed — closed",
}


def status_detail(status: TicketStatus) -> str:
    return _STATUS_DETAIL[status]


def status_headline(status: TicketStatus) -> str:
    return _STATUS_HEADLINE[status]


def build_follow_up_user_text(
    ticket: Ticket,
    history: list[TicketMessage],
    question: str,
) -> str:
    """
    Flatten the ticket, the prior conversation and the new question into one turn.

    Same approach as the intake's `build_user_text`: replay everything as a
    single user message so the model can see the whole thread at once, and so
    there is no multi-turn state to reconstruct.
    """
    lines: list[str] = []
    lines.append("This is the ticket, exactly as recorded in the system:")
    # `append`, not `extend`: `_as_bullets` returns one newline-joined string, and
    # extending a list with a string splices in its *characters* — which would
    # ship the whole ticket to the model one letter per line, silently, and only
    # on the follow-up path.
    lines.append(_as_bullets(_ticket_facts(ticket)))
    lines.append("")
    lines.append(f"Its current status, as a fact: {status_headline(ticket.status)}.")
    lines.append(f"In plain words: it is {status_detail(ticket.status)}.")
    lines.append(
        "You have no information beyond this about what any response team is "
        "doing, and you must not imply otherwise."
    )
    lines.append("")

    prior = [m for m in history if m.text.strip()]
    if prior:
        lines.append("The conversation so far on this ticket:")
        for message in prior:
            who = "Reporter" if message.role == "user" else "Assistant"
            lines.append(f"{who}: {message.text}")
        lines.append("")

    lines.append(f"Reporter's new message: {question.strip()}")
    lines.append("")
    lines.append(
        "Return your JSON response now. Answer only from the ticket above. If you "
        "are asked whether help is on the way, say that you cannot see the response "
        "team's side and that their message is now on the ticket."
    )
    return "\n".join(lines)


def _ticket_facts(ticket: Ticket) -> dict[str, str]:
    """
    The ticket as flat facts, minus the fields a reporter must not re-read aloud.

    The reporter's name and phone number are deliberately absent even though the
    row has them. This text goes to a model, and a follow-up reply that quoted
    someone's phone number back at them would be a privacy leak for no benefit —
    the model can answer every question this prompt poses without it.

    Keys are snake_case to match the rest of the prompt vocabulary rather than
    the wire format; this is prose for a model, not an API payload.
    """
    facts: dict[str, str] = {
        "reference": ticket.id,
        "filed_at": ticket.created_at.isoformat(),
        "status": status_headline(ticket.status),
        "support_needed": ", ".join(s.value for s in ticket.support_needed),
        "urgency": ticket.urgency.value,
        "location": ticket.location,
        "summary": ticket.summary,
    }
    if ticket.people_affected is not None:
        facts["people_affected"] = str(ticket.people_affected)
    if ticket.on_behalf_of_other and ticket.victim_name:
        facts["person_needing_help"] = ticket.victim_name
    if ticket.notes.strip():
        facts["notes"] = ticket.notes
    return facts


def _as_bullets(mapping: dict[str, str]) -> str:
    return "\n".join(f"  - {key}: {value}" for key, value in mapping.items())


# Shown when Gemini cannot be reached. Composed from the ticket's real status
# rather than written as a fixed string, so an outage can never imply progress
# that has not happened — the degraded reply is held to the same one rule as
# the model's.
_DEGRADED_OPENERS: dict[TicketStatus, str] = {
    TicketStatus.SUBMITTED: (
        "Your message has been added to this ticket. I cannot reach the relief "
        "network right now, so I cannot add anything else — but your message is "
        "saved against the ticket and a response team will see it."
    ),
    TicketStatus.UNDER_REVIEW: (
        "Your message has been added to this ticket, which is being reviewed by a "
        "response team. I cannot reach the relief network right now, so I cannot "
        "add anything else."
    ),
    TicketStatus.DISPATCHED: (
        "Your message has been added to this ticket, which is in progress with a "
        "unit dispatched. I cannot reach the relief network right now, so I cannot "
        "add anything else."
    ),
    TicketStatus.RESOLVED: (
        "Your message has been added to this ticket, which is already completed. If "
        "something here still needs attention, please raise it as a new ticket. I "
        "cannot reach the relief network right now, so I cannot add anything else."
    ),
    TicketStatus.CLOSED: (
        "Your message has been added to this ticket, which is closed. If something "
        "here still needs attention, please raise it as a new ticket — closed "
        "tickets are not reworked. I cannot reach the relief network right now, so "
        "I cannot add anything else."
    ),
}


def degraded_reply(status: TicketStatus) -> str:
    return _DEGRADED_OPENERS[status]
