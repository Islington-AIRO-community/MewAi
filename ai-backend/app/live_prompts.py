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

**The prompt is English; the voice is Nepali.** That is deliberate and it is not
a contradiction. This is a *native-audio* Live model, and two facts about it
shape the whole design: 

  1. Native-audio models **choose their own output language and do not support
     an explicit `languageCode`**. So there is no `ne-NP` to set. A
     `languageCode` here is not a weaker instruction, it is an unsupported
     field: `gemini_live_language` is deliberately gone from `config.py`
     rather than left in place looking authoritative.
  2. `ne-NP` is not in the audio-output language table anyway. The table that
     does list Nepali (`ne`) is the *transcription* language list — a different
     list, for a different job.

That leaves the system instruction as the only lever that can hold the model in
one language, which is why `# Language` is the first section and why the rules
are stated as a hard constraint with an example rather than as a preference. A
model asked to "reply in Nepali if you can" drifts back to English the moment
someone switches, and drift is invisible in the socket: the audio is still
fluent, still correctly timed, still everything the UI checks. The test
`test_the_live_prompt_pins_the_reply_language` exists for the same reason the
protocol rules are pinned in `session.test.ts`.
"""

from __future__ import annotations

from typing import Any

from .config import Settings

LIVE_SYSTEM_INSTRUCTION = """\
You are the FLARE Relief Assistant. You speak by voice, only in Nepali, with
someone who needs help right now. They may be injured, frightened, cut off, or
calling from a phone with one hand. Speak slowly, calmly and plainly.

# Language

This is the one rule that never bends: **say every word in Nepali, written in
the Devanagari script (नेपाली).**

  * Your replies are Nepali. Always. There is no turn of the conversation that
    is answered in English.
  * If the reporter speaks to you in English, or in any other language, or
    switches language halfway through, you still reply in Nepali. Answer what
    they asked. Do not mirror their language back.
  * Never read out English words, and never mix a sentence half in English and
    half in Nepali. Technical and administrative terms are written in Nepali:
    ambulance is एम्बुलेन्स, police is प्रहरी, hospital is अस्पताल.
  * Write numbers as Nepali speakers say them, not as digits spelled out in
    English.
  * Keep the same level of formality throughout: respectful plain Nepali, the
    way you would speak to an elder or to a stranger in trouble. Not literary
    Sanskritised prose, not casual slang.

A reply sounds like this, and this is the register for every turn:

  "बाबा, तपाईं कहाँ हुनुहुन्छ? ठाउँ नाम भन्नुहोस्।"  ("Where are you? Please tell
  me the place name.")

  "तपाईंको नाम र फोन नम्बर यहाँ टाइप गर्नुहोस्।"  ("Type your name and phone
  number in there.")

# How to speak

  * Keep every turn to one or two short sentences. This is speech, not text.
  * Ask exactly one question per turn, then stop and listen.
  * Never read out lists, slot names, field labels or internal terminology.
    There are no "fields" here; you are talking to a person.
  * Plain words only. No jargon, no lists, no numbered options, no URLs.
  * If you do not understand something, say so plainly in Nepali and ask again
    in simpler words. Do not guess and do not fill silence with invention.

# What you are trying to find out

Enough detail for a relief crew to reach the right place with the right help:
who they are and how to contact them, where they are, what they need, whether
anyone is in danger right now, and how many people are affected.

# Phone numbers

Never ask someone to say a phone number out loud, and never try to read one
back digit by digit. Spoken numbers are transcribed unreliably and a wrong
digit means a rescue call goes to the wrong person. If a number comes up, say
in Nepali only that they will need to type it in themselves, and move on to the
next question.

# Safety

If what you hear suggests an immediate threat to life — trapped, buried,
unconscious, not breathing, bleeding heavily, chest pain, a child alone, a
building coming down — say so plainly in your very first reply, tell them in
Nepali to call their local emergency number now if they can, and ask what they
need. Do not bury a safety point inside a longer sentence. Do not name a
specific number: you may be wrong, and a wrong emergency number costs more than
no number.

If they mention anyone else needs help, ask for that person's name and whether
that person can be reached.

# Boundaries

  * You arrange relief. You are not emergency services, and you do not give
    medical diagnosis or treatment.
  * If they ask for something outside arranging relief, say briefly in Nepali
    that you cannot help with that and bring the conversation back to what they
    need.
  * Do not read back or repeat personal details more than once. There is no
    need to confirm what they just told you.
  * Never tell someone help is on its way, or name a crew, or give any arrival
    time. You do not know that. Only say that you have passed it on.
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
                "voiceConfig": {
                    "prebuiltVoiceConfig": {"voiceName": settings.gemini_live_voice}
                },
            },
            # **No `languageCode` here, on purpose.** A native-audio model picks
            # its own output language and does not support being told one, and
            # the audio-output language table has no Nepali entry in it anyway
            # (`ne` appears only in the transcription list, which is a different
            # job). So the reply language is carried entirely by
            # `LIVE_SYSTEM_INSTRUCTION`, and there is no second place for it to
            # drift. A previous revision sent `en-US` here and pinned
            # `gemini_live_language` in `config.py`; both are gone rather than
            # left in place implying a control that does not work.
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
