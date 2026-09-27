"""
The Live API's system prompt, and the session config pinned into the token.

**This prompt is not `prompts.SYSTEM_INSTRUCTION`.** That one is written for a
model that answers in JSON against a response schema: it names slots, lists
support types, and reasons about capture state. Read aloud through a voice
interface, that prompt produces a machine talking about a data structure. So
the spoken prompt below is a separate artefact with a separate job: hold a calm
short conversation, and let the *existing* intake pipeline do the extraction
afterwards.

The two halves of the live feature meet at `ingestTranscript` in
`lib/use-ai-chat.ts`. The browser replays the finished conversation as
`user`/`assistant` messages into the ordinary `POST /api/chat/message`, and
`ChatService` extracts the draft exactly as it does for typed chat. So:

  * nothing here decides whether a ticket is complete, and
  * `slots.missing_slots()` remains the only authority on readiness.

That is also why the prompt below refuses to collect phone numbers. Verified
against the live service: asked a vague question, `gemini-3.8-live` invented
"Lincoln Elementary School, 123 Maple Street". Spoken digits are worse. Exact
numbers are typed into the review form, which already exists for this.
"""

from __future__ import annotations

from typing import Any

from .config import Settings

LIVE_SYSTEM_INSTRUCTION = """\
You are the FLARE Relief Assistant, speaking by voice with someone who needs
help right now. They may be injured, frightened, cut off, or calling from a
phone with one hand. Speak slowly, calmly and plainly.

# How to speak

  * Keep every turn to one or two short sentences. This is speech, not text.
  * Ask exactly one question per turn, then stop and listen.
  * Never read out lists, slot names, field labels or internal terminology.
    There are no "fields" here; you are talking to a person.
  * Plain words only. No jargon, no lists, no numbered options, no URLs.
  * If you do not understand something, say so plainly and ask again in
    simpler words. Do not guess and do not fill silence with invention.

# What you are trying to find out

Enough detail for a relief crew to reach the right place with the right help:
who they are and how to contact them, where they are, what they need, whether
anyone is in danger right now, and how many people are affected.

# Phone numbers

Never ask someone to say a phone number out loud, and never try to read one
back digit by digit. Spoken numbers are transcribed unreliably and a wrong
digit means a rescue call goes to the wrong person. If a number comes up, say
only that you will need them to type it in, and move on to the next question.

# Safety

If what you hear suggests an immediate threat to life — trapped, buried,
unconscious, not breathing, bleeding heavily, chest pain, a child alone, a
building coming down — say so plainly in your first reply, tell them to call
their local emergency number now if they can, and ask what they need. Do not
bury a safety point inside a longer sentence.

If they mention anyone else needs help, ask for that person's name and whether
that person can be reached.

# Boundaries

  * You arrange relief. You are not emergency services, and you do not give
    medical diagnosis or treatment.
  * If they ask for something outside arranging relief, say briefly that you
    cannot help with that and bring the conversation back to what they need.
  * Do not read back or repeat personal details more than once. There is no
    need to confirm what they just told you.
"""

# Fields the model must never be trusted to capture from speech. Used by the
# prompt above and asserted in tests so the two cannot drift apart.
SPOKEN_UNRELIABLE_FIELDS = (
    "reporterPhone",
    "victimPhone",
    "location",
)


def live_connect_setup(settings: Settings) -> dict[str, Any]:
    """
    Build the `BidiGenerateContentSetup` for the ephemeral token.

    This dict is the whole reason the token exists. Two properties of the
    `AuthToken` schema make it load-bearing, both verified against the live
    service:

    1. Sending `bidiGenerateContentSetup` with an empty `field_mask` means the
       server takes the config *entirely* from this request and **ignores the
       setup message the browser sends**. So a modified client cannot ask for
       text output, a different model, or no system prompt.
    2. `sessionResumption` and `contextWindowCompression` must be requested
       here, not in a follow-up message. Audio runs ~25 tokens/second and a
       connection is capped around 10 minutes, so a session that does not
       enable both from the first handshake dies mid-conversation.

    The field is `bidiGenerateContentSetup`, not `liveConnectConstraints` —
    the latter is the SDK-side alias and is rejected by the REST endpoint.
    """
    return {
        "model": f"models/{settings.gemini_live_model}",
        "systemInstruction": {"parts": [{"text": LIVE_SYSTEM_INSTRUCTION}]},
        "generationConfig": {
            # Audio only. Text responses are not rendered and would cost a turn.
            "responseModalities": ["AUDIO"],
            "speechConfig": {
                "languageCode": settings.gemini_live_language,
                "voiceConfig": {
                    "prebuiltVoiceConfig": {"voiceName": settings.gemini_live_voice}
                },
            },
        },
        # Both transcriptions on. inputTranscription is what gets replayed into
        # the ticket draft, so it is not optional.
        "inputAudioTranscription": {},
        "outputAudioTranscription": {},
        "sessionResumption": {},
        "contextWindowCompression": {"slidingWindow": {"targetTokens": "8000"}},
        "realtimeInputConfig": {
            "automaticActivityDetection": {
                "disabled": False,
                "startOfSpeechSensitivity": settings.gemini_live_start_of_speech_sensitivity,
                "endOfSpeechSensitivity": "END_SENSITIVITY_LOW",
                "prefixPaddingMs": 100,
                "silenceDurationMs": settings.gemini_live_silence_duration_ms,
            },
            # Let a reporter cut the model off mid-sentence. Without this a
            # shouting person has to wait out the reply before being heard.
            "activityHandling": "START_OF_ACTIVITY_INTERRUPTS",
        },
        # v1alpha-only. Rejected outright by v1beta, which is why
        # `gemini_live_api_version` is pinned. It suppresses replies to
        # background noise and other people's conversation, which is the
        # mitigation for running an always-open microphone in a street full of
        # people during an earthquake.
        "proactivity": {"proactiveAudio": True},
    }


def ws_url(settings: Settings, token: str) -> str:
    """
    The constrained WebSocket endpoint the browser opens with the token.

    `BidiGenerateContentConstrained` is required: on the unconstrained endpoint
    the token is not accepted, and the config pinned above is not enforced.
    """
    return (
        f"wss://generativelanguage.googleapis.com/ws/"
        f"google.ai.generativelanguage.{settings.gemini_live_api_version}."
        f"GenerativeService.BidiGenerateContentConstrained?access_token={token}"
    )
