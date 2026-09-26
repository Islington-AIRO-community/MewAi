"""
Tests for the deterministic half of the intake.

`slots.py` and the draft-assembly helpers in `chat_service.py` decide what a
ticket is *allowed* to contain. They are duplicated on the client in
`lib/ticket-intake.ts` so the review form can show what is missing while the
user types, which makes silent drift the main risk on this side of the
codebase — so these are the rules worth pinning.

No model calls: everything here is a pure function, so the suite runs in
milliseconds and never spends quota.

    .venv/bin/python -m pytest app/tests -q
"""

from __future__ import annotations

import pytest

from app.chat_service import _apply_edits, _clean_edits, _draft_from_payload
from app.schemas import CaptureState, SlotName, SupportType, TicketDraft, Urgency
from app.slots import is_usable_phone, missing_slots, normalise_phone, slot_states


def draft(**overrides) -> TicketDraft:
    """A complete self-report; override one field to make it incomplete."""
    base = {
        "reporter_name": "Amina Yusuf",
        "reporter_phone": "0722 555 019",
        "summary": "Trapped in my flat, the door is jammed.",
        "location": "Kileleshi Road, block C",
        "support_needed": [SupportType.RESCUE],
        "urgency": Urgency.CRITICAL,
        "on_behalf_of_other": False,
    }
    base.update(overrides)
    return TicketDraft.model_validate(base)


# --------------------------------------------------------------- required rules


def test_complete_self_report_has_nothing_missing():
    assert missing_slots(draft()) == []


@pytest.mark.parametrize(
    "field,slot",
    [
        ("reporter_name", SlotName.REPORTER_NAME),
        ("reporter_phone", SlotName.REPORTER_PHONE),
        ("summary", SlotName.SUMMARY),
        ("location", SlotName.LOCATION),
    ],
)
def test_each_always_required_field_blocks_submission(field, slot):
    assert slot in missing_slots(draft(**{field: ""}))


def test_empty_support_blocks_submission():
    assert SlotName.SUPPORT_NEEDED in missing_slots(draft(support_needed=[]))


def test_missing_urgency_blocks_submission():
    assert SlotName.URGENCY in missing_slots(draft(urgency=None))


def test_missing_slots_are_reported_in_spec_order():
    """The review checklist reads top to bottom, so the order has to be the
    spec's order rather than whatever the enum walk happens to produce."""
    assert missing_slots(TicketDraft()) == [
        SlotName.REPORTER_NAME,
        SlotName.REPORTER_PHONE,
        SlotName.SUMMARY,
        SlotName.LOCATION,
        SlotName.SUPPORT_NEEDED,
        SlotName.URGENCY,
    ]


# ----------------------------------------------------- on_behalf_of_other rule


def test_self_report_does_not_need_victim_details():
    """The one conditional in the spec: a person reporting on themselves is a
    complete ticket with no victim fields at all."""
    assert missing_slots(draft(on_behalf_of_other=False)) == []


def test_relative_must_supply_victim_name_and_phone():
    assert set(missing_slots(draft(on_behalf_of_other=True))) == {
        SlotName.VICTIM_NAME,
        SlotName.VICTIM_PHONE,
    }


def test_relative_with_both_victim_fields_is_complete():
    assert (
        missing_slots(
            draft(
                on_behalf_of_other=True,
                victim_name="Grace Wanjiru",
                victim_phone="0722555019",
            )
        )
        == []
    )


def test_victim_name_alone_is_not_enough_for_a_relative():
    missing = missing_slots(draft(on_behalf_of_other=True, victim_name="Grace Wanjiru"))
    assert missing == [SlotName.VICTIM_PHONE]


def test_victim_fields_are_optional_again_once_it_is_a_self_report():
    """Flipping the switch back must relax the rule, not just add to it."""
    reported = draft(
        on_behalf_of_other=True, victim_name="Grace Wanjiru", victim_phone="0722555019"
    )
    assert missing_slots(reported) == []
    relaxed = reported.model_copy(update={"on_behalf_of_other": False})
    assert missing_slots(relaxed) == []


# ------------------------------------------------------------------- phone rules


@pytest.mark.parametrize(
    "value",
    ["5550143", "555-0143", "+1 (555) 014-3", "0722555019", "+254 712 555 019", "911019"],
)
def test_usable_phone_numbers(value):
    assert is_usable_phone(value)


@pytest.mark.parametrize(
    "value",
    ["", "   ", "none", "unknown", "n/a", "12345", "911", "call me", "...", "- - -"],
)
def test_unusable_phone_numbers(value):
    """A field that looks filled but cannot be dialled still counts as missing —
    a crew driving to a street with an undialable number cannot call ahead.

    `911` is in this list deliberately: three digits is a valid *emergency*
    number, but not a usable contact number for a ticket.
    """
    assert not is_usable_phone(value)


def test_unusable_phone_is_reported_missing_not_silently_accepted():
    assert SlotName.REPORTER_PHONE in missing_slots(draft(reporter_phone="I lost it"))
    assert SlotName.VICTIM_PHONE in missing_slots(
        draft(on_behalf_of_other=True, victim_name="Grace", victim_phone="???")
    )


def test_normalise_phone_keeps_digits_and_a_leading_plus():
    """Numbers are read aloud, so spaces, dots and brackets go — but a leading
    `+` is the difference between a local and an international number, and
    hyphens the person chose to keep are left where they are."""
    assert normalise_phone("+254 712 555 019") == "+254712555019"
    assert normalise_phone("555-0143") == "555-0143"
    assert normalise_phone("(555) 014.3") == "5550143"
    assert normalise_phone("555--0143") == "555-0143"
    assert normalise_phone("") == ""


# ------------------------------------------------------------------ slot states


def test_slot_states_reflect_the_draft():
    states = slot_states(draft(on_behalf_of_other=True))
    assert states[SlotName.LOCATION] is CaptureState.CAPTURED
    assert states[SlotName.VICTIM_PHONE] is CaptureState.NEEDED


def test_optional_slot_is_unknown_not_needed_when_blank():
    """`peopleAffected` never blocks submission, so reporting it as outstanding
    would make the checklist look permanently incomplete."""
    assert slot_states(draft())[SlotName.PEOPLE_AFFECTED] is CaptureState.UNKNOWN


# ------------------------------------------------------------------ edit overlay


def test_hand_edit_wins_over_the_model():
    result = _apply_edits(draft(), {"location": "Flat 4B, 12 Beacon St"})
    assert result.location == "Flat 4B, 12 Beacon St"


def test_hand_edit_does_not_touch_unedited_fields():
    result = _apply_edits(draft(), {"location": "Flat 4B"})
    assert result.reporter_name == "Amina Yusuf"
    assert result.summary == draft().summary


def test_blank_edits_are_discarded():
    """An empty edit is a no-op, not a request to clear the field."""
    assert _clean_edits({"location": "   "}) is None
    assert _clean_edits({"location": "  Flat 4B "}) == {"location": "Flat 4B"}


def test_people_affected_stays_free_text():
    """"the two of us" and "about 12" are both legitimate answers, so the slot is
    a string until the database coerces it."""
    result = _apply_edits(draft(), {"peopleAffected": "the two of us"})
    assert result.people_affected == "the two of us"


# ------------------------------------------------------------- payload handling


def test_an_undialable_number_is_shown_to_the_reporter_but_still_counts_as_missing():
    """The model sometimes echoes a placeholder like "I do not have it" into a
    phone field. It is *not* silently blanked: the reporter can see what was
    understood and correct it, which beats an empty box they cannot diagnose.

    What matters is that the slot still reads as outstanding, so the intake keeps
    asking and `POST /api/tickets` refuses to write the row.
    """
    built = _draft_from_payload(
        {
            "draft": {
                "reporterName": "Amina Yusuf",
                "reporterPhone": "I do not have it",
                "victimPhone": "n/a",
                "summary": "s",
                "location": "l",
                "supportNeeded": ["rescue"],
                "urgency": "critical",
                "onBehalfOfOther": True,
            }
        }
    )
    # Preserved for the reporter to see and fix...
    assert built.reporter_phone == "I do not have it"
    assert built.victim_phone == "n/a"
    # ...but never counted as captured. `victimName` is outstanding too, since
    # the payload never supplied one.
    assert set(missing_slots(built)) == {
        SlotName.REPORTER_PHONE,
        SlotName.VICTIM_NAME,
        SlotName.VICTIM_PHONE,
    }
    assert slot_states(built)[SlotName.REPORTER_PHONE] is CaptureState.NEEDED


def test_snake_case_keys_from_the_model_are_accepted():
    """Gemini does not always honour the camelCase schema it was given."""
    built = _draft_from_payload(
        {
            "draft": {
                "reporter_name": "Amina Yusuf",
                "reporter_phone": "0722555019",
                "summary": "s",
                "location": "l",
                "support_needed": ["rescue"],
                "urgency": "critical",
                "on_behalf_of_other": False,
            }
        }
    )
    assert built.reporter_name == "Amina Yusuf"
    assert built.reporter_phone == "0722555019"
    assert built.support_needed == [SupportType.RESCUE]


def test_a_bad_classification_drops_the_whole_field_rather_than_being_trusted():
    """Recovery is "ask again", not "partially believe". If the model emits a
    support type outside the four classes, discarding the classification
    entirely is safer than keeping the valid entries — the reporter confirms it
    in the review step either way."""
    built = _draft_from_payload(
        {
            "draft": {
                "summary": "s",
                "location": "l",
                "supportNeeded": ["rescue", "helicopter"],
                "urgency": "critical",
            }
        }
    )
    assert built.support_needed == []
    assert SlotName.SUPPORT_NEEDED in missing_slots(built)


def test_a_bad_urgency_does_not_take_the_whole_draft_down_with_it():
    """One malformed field must cost only that field, or a single stray token
    would discard a fully extracted ticket and force the reporter to repeat
    everything."""
    built = _draft_from_payload(
        {
            "draft": {
                "reporterName": "Amina Yusuf",
                "reporterPhone": "0722555019",
                "summary": "s",
                "location": "l",
                "supportNeeded": ["rescue"],
                "urgency": "extremely-urgent",
            }
        }
    )
    assert built.urgency is None
    assert built.reporter_name == "Amina Yusuf"
    assert built.location == "l"
    assert SlotName.URGENCY in missing_slots(built)


def test_a_draft_with_no_recognised_fields_yields_an_empty_draft_not_a_crash():
    built = _draft_from_payload({"draft": {"somethingElse": "?"}})
    assert built.reporter_name == ""
    assert missing_slots(built)


def test_a_missing_draft_block_is_handled():
    """Constrained decoding should always produce one, but a malformed response
    must not become a 500."""
    assert _draft_from_payload({"reply": "hi"}).summary == ""
