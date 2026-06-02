import gc
import base64
import json
import logging
import os
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from threading import Lock
from typing import Any

import librosa
import numpy as np
import torch
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from rapidfuzz.distance import Levenshtein
from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor
from transformers import pipeline as transformers_pipeline

LOCAL_WAV2VEC2_MODEL_ID = os.getenv(
    "PRONUNCIATION_ASSESSOR_MODEL", "facebook/wav2vec2-base-960h"
)
LOCAL_WHISPER_MODEL_IDS = {
    "local-whisper-tiny": os.getenv(
        "PRONUNCIATION_ASSESSOR_WHISPER_TINY_MODEL", "openai/whisper-tiny"
    ),
    "local-whisper-base": os.getenv(
        "PRONUNCIATION_ASSESSOR_WHISPER_BASE_MODEL", "openai/whisper-base"
    ),
    "local-whisper-small": os.getenv(
        "PRONUNCIATION_ASSESSOR_WHISPER_SMALL_MODEL", "openai/whisper-small"
    ),
    "local-whisper-medium": os.getenv(
        "PRONUNCIATION_ASSESSOR_WHISPER_MEDIUM_MODEL", "openai/whisper-medium"
    ),
    "local-whisper-large-v3": os.getenv(
        "PRONUNCIATION_ASSESSOR_WHISPER_LARGE_V3_MODEL", "openai/whisper-large-v3"
    ),
    "local-whisper-large-v3-turbo": os.getenv(
        "PRONUNCIATION_ASSESSOR_WHISPER_LARGE_V3_TURBO_MODEL",
        "openai/whisper-large-v3-turbo",
    ),
}
DEFAULT_ASSESSOR_MODEL = os.getenv(
    "PRONUNCIATION_ASSESSOR_DEFAULT_MODEL", "local-whisper-large-v3-turbo"
)
PRELOAD_MODEL = os.getenv("PRONUNCIATION_ASSESSOR_PRELOAD", "true").lower() != "false"
LOCAL_MODEL_IDLE_TTL_SECONDS = int(
    os.getenv("PRONUNCIATION_ASSESSOR_IDLE_TTL_SECONDS", "900")
)
LOCAL_MODEL_MAX_LOADED = max(
    1, int(os.getenv("PRONUNCIATION_ASSESSOR_MAX_LOADED_MODELS", "1"))
)
SAMPLE_RATE = 16_000
LOCAL_ASSESSOR_MODEL = "local-wav2vec2"
SUPPORTED_ASSESSOR_MODELS = {
    *LOCAL_WHISPER_MODEL_IDS.keys(),
    LOCAL_ASSESSOR_MODEL,
}
PIPER_DATA_DIR = os.getenv("PIPER_DATA_DIR", "/root/.cache/piper")
PIPER_EXECUTABLE = os.getenv("PIPER_EXECUTABLE", "piper")
PIPER_DEFAULT_VOICE = os.getenv("PIPER_DEFAULT_VOICE", "en_US-lessac-high")
PIPER_VOICE_REPOSITORY_URL = os.getenv(
    "PIPER_VOICE_REPOSITORY_URL",
    "https://huggingface.co/rhasspy/piper-voices/resolve/main",
).rstrip("/")
PIPER_VOICES = {
    "en_US-lessac-high": {
        "language": "english",
        "label": "English classroom narrator high",
        "path": "en/en_US/lessac/high",
    },
    "en_US-lessac-medium": {
        "language": "english",
        "label": "English classroom narrator",
        "path": "en/en_US/lessac/medium",
    },
    "en_GB-alan-medium": {
        "language": "english",
        "label": "British English narrator",
        "path": "en/en_GB/alan/medium",
    },
}

app = FastAPI(title="Tuturuuu Pronunciation Assessor")
logger = logging.getLogger(__name__)


@dataclass
class LoadedLocalModel:
    device: torch.device
    kind: str
    last_used_at: float
    model: Any
    model_id: str
    pipeline: Any | None = None
    processor: Any | None = None


class ModelRequest(BaseModel):
    model: str | None = None


class TtsRequest(BaseModel):
    language: str = "english"
    pace: float = 0.9
    speakerId: int | None = None
    text: str
    voiceId: str = PIPER_DEFAULT_VOICE


loaded_local_models: dict[str, LoadedLocalModel] = {}
model_lock = Lock()
tts_lock = Lock()


def clamp_score(value: float) -> int:
    return max(0, min(100, int(round(value))))


def score_to_level(score: int) -> str:
    if score >= 85:
        return "green"
    if score >= 70:
        return "amber"
    if score >= 50:
        return "orange"
    return "red"


def normalize_token(value: str) -> str:
    return "".join(ch.lower() for ch in value if ch.isalnum())


def tokenize_words(value: str) -> list[str]:
    return value.split()


def compare_tokens(expected: str, heard: str) -> int:
    left = normalize_token(expected)
    right = normalize_token(heard)
    max_length = max(len(left), len(right))
    if max_length == 0:
        return 100
    distance = Levenshtein.distance(left, right)
    return clamp_score((1 - distance / max_length) * 100)


def build_character_grades(
    expected: str, heard: str, word_score: int
) -> list[dict[str, Any]]:
    normalized_heard = normalize_token(heard)
    heard_index = 0
    characters: list[dict[str, Any]] = []

    for character in expected:
        normalized_character = normalize_token(character)
        if not normalized_character:
            characters.append({"character": character, "level": "green", "score": 100})
            continue

        heard_character = (
            normalized_heard[heard_index]
            if heard_index < len(normalized_heard)
            else ""
        )
        heard_index += 1
        score = (
            max(word_score, 88)
            if normalized_character == heard_character
            else max(0, word_score - 25)
        )
        score = clamp_score(score)
        characters.append(
            {
                "character": character,
                "level": score_to_level(score),
                "score": score,
            }
        )

    return characters


def parse_valsea_response(value: str | None) -> dict[str, Any]:
    if not value:
        return {}
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def get_assessor_model(requested_model: str | None) -> str:
    fallback = (
        DEFAULT_ASSESSOR_MODEL
        if DEFAULT_ASSESSOR_MODEL in SUPPORTED_ASSESSOR_MODELS
        else "local-whisper-large-v3-turbo"
    )
    model = requested_model or fallback
    return model if model in SUPPORTED_ASSESSOR_MODELS else fallback


def get_loaded_model_snapshot() -> list[dict[str, Any]]:
    now = time.monotonic()
    return [
        {
            "idleSeconds": int(now - loaded.last_used_at),
            "kind": loaded.kind,
            "modelId": loaded.model_id,
        }
        for loaded in loaded_local_models.values()
    ]


def get_piper_voice_id(voice_id: str | None) -> str:
    if voice_id and voice_id in PIPER_VOICES:
        return voice_id

    requested_voice = voice_id.strip() if voice_id else PIPER_DEFAULT_VOICE
    local_model_path = os.path.join(PIPER_DATA_DIR, f"{requested_voice}.onnx")
    if os.path.exists(local_model_path):
        return requested_voice

    if PIPER_DEFAULT_VOICE in PIPER_VOICES:
        return PIPER_DEFAULT_VOICE

    return "en_US-lessac-medium"


def get_piper_voice_paths(voice_id: str) -> tuple[str, str]:
    return (
        os.path.join(PIPER_DATA_DIR, f"{voice_id}.onnx"),
        os.path.join(PIPER_DATA_DIR, f"{voice_id}.onnx.json"),
    )


def redact_url_for_logs(url: str) -> str:
    parsed = urllib.parse.urlsplit(url)
    host = parsed.hostname or ""
    port = f":{parsed.port}" if parsed.port else ""
    netloc = f"{host}{port}" if host else parsed.netloc.rsplit("@", 1)[-1]
    return urllib.parse.urlunsplit((parsed.scheme, netloc, parsed.path, "", ""))


def download_piper_asset(url: str, destination: str) -> None:
    os.makedirs(os.path.dirname(destination), exist_ok=True)
    with tempfile.NamedTemporaryFile(
        dir=os.path.dirname(destination),
        delete=False,
        suffix=".download",
    ) as temp_file:
        temp_path = temp_file.name

    try:
        with urllib.request.urlopen(url, timeout=120) as response:
            with open(temp_path, "wb") as temp_file:
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    temp_file.write(chunk)
        os.replace(temp_path, destination)
    except (OSError, urllib.error.URLError) as error:
        try:
            os.unlink(temp_path)
        except OSError:
            pass
        logger.exception(
            "Could not download Piper asset",
            extra={
                "destination": os.path.basename(destination),
                "url": redact_url_for_logs(url),
            },
        )
        raise RuntimeError("Could not download Piper voice asset") from error


def ensure_piper_voice(voice_id: str) -> tuple[str, str, list[str]]:
    model_path, config_path = get_piper_voice_paths(voice_id)
    downloaded: list[str] = []

    if os.path.exists(model_path) and os.path.exists(config_path):
        return model_path, config_path, downloaded

    metadata = PIPER_VOICES.get(voice_id)
    if not metadata:
        raise RuntimeError(
            "Unsupported Piper voice. Available voices: "
            + ", ".join(sorted(PIPER_VOICES))
        )

    remote_path = metadata["path"]
    assets = [
        (f"{voice_id}.onnx", model_path),
        (f"{voice_id}.onnx.json", config_path),
    ]

    with tts_lock:
        for filename, destination in assets:
            if os.path.exists(destination):
                continue
            url = f"{PIPER_VOICE_REPOSITORY_URL}/{remote_path}/{filename}"
            download_piper_asset(url, destination)
            downloaded.append(filename)

    return model_path, config_path, downloaded


def get_piper_length_scale(pace: float) -> str:
    safe_pace = min(1.4, max(0.6, pace or 1.0))
    return f"{1 / safe_pace:.3f}"


def run_piper_tts(request: TtsRequest) -> dict[str, Any]:
    voice_id = get_piper_voice_id(request.voiceId)
    os.makedirs(PIPER_DATA_DIR, exist_ok=True)
    model_path, config_path, downloaded_assets = ensure_piper_voice(voice_id)

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=True) as output_file:
        command = [
            PIPER_EXECUTABLE,
            "--model",
            model_path,
            "--config",
            config_path,
            "--output_file",
            output_file.name,
            "--length-scale",
            get_piper_length_scale(request.pace),
            "--data-dir",
            PIPER_DATA_DIR,
        ]
        if request.speakerId is not None:
            command.extend(["--speaker", str(request.speakerId)])

        started_at = time.monotonic()
        process = subprocess.run(
            command,
            input=request.text,
            text=True,
            capture_output=True,
            timeout=90,
            check=False,
        )
        duration_ms = int((time.monotonic() - started_at) * 1000)

        if process.returncode != 0:
            logger.error(
                "Piper process failed",
                extra={
                    "returncode": process.returncode,
                    "stderr": process.stderr.strip()[:1000],
                    "voiceId": voice_id,
                },
            )
            raise RuntimeError("Piper speech synthesis failed")

        output_file.seek(0)
        audio = output_file.read()

    return {
        "audioBase64": base64.b64encode(audio).decode("ascii"),
        "contentType": "audio/wav",
        "durationMs": duration_ms,
        "engine": "piper",
        "model": voice_id,
        "trace": {
            "downloadedAssets": downloaded_assets,
            "language": request.language,
            "lengthScale": get_piper_length_scale(request.pace),
            "speakerId": request.speakerId,
        },
        "voiceId": voice_id,
    }


def release_torch_memory() -> None:
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()


def unload_local_model(model_id: str | None = None) -> list[str]:
    with model_lock:
        if model_id:
            removed = [model_id] if loaded_local_models.pop(model_id, None) else []
        else:
            removed = list(loaded_local_models.keys())
            loaded_local_models.clear()

    if removed:
        release_torch_memory()

    return removed


def unload_idle_local_models(now: float | None = None) -> list[str]:
    timestamp = now or time.monotonic()
    with model_lock:
        expired = [
            model_id
            for model_id, loaded in loaded_local_models.items()
            if timestamp - loaded.last_used_at > LOCAL_MODEL_IDLE_TTL_SECONDS
        ]
        for model_id in expired:
            loaded_local_models.pop(model_id, None)

    if expired:
        release_torch_memory()

    return expired


def enforce_loaded_model_limit() -> list[str]:
    with model_lock:
        if len(loaded_local_models) <= LOCAL_MODEL_MAX_LOADED:
            return []

        evictable = sorted(
            loaded_local_models.values(), key=lambda loaded: loaded.last_used_at
        )
        evicted = []
        while len(loaded_local_models) > LOCAL_MODEL_MAX_LOADED and evictable:
            candidate = evictable.pop(0)
            if loaded_local_models.pop(candidate.model_id, None):
                evicted.append(candidate.model_id)

    if evicted:
        release_torch_memory()

    return evicted


def get_local_model_id(assessor_model: str) -> str:
    if assessor_model == LOCAL_ASSESSOR_MODEL:
        return LOCAL_WAV2VEC2_MODEL_ID

    return LOCAL_WHISPER_MODEL_IDS[assessor_model]


def load_local_model(assessor_model: str) -> LoadedLocalModel:
    unload_idle_local_models()
    now = time.monotonic()
    model_id = get_local_model_id(assessor_model)

    with model_lock:
        loaded = loaded_local_models.get(assessor_model)
        if loaded:
            loaded.last_used_at = now
            return loaded

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    if assessor_model == LOCAL_ASSESSOR_MODEL:
        processor = Wav2Vec2Processor.from_pretrained(model_id)
        model = Wav2Vec2ForCTC.from_pretrained(model_id).to(device)
        model.eval()
        loaded = LoadedLocalModel(
            device=device,
            kind="wav2vec2",
            last_used_at=now,
            model=model,
            model_id=assessor_model,
            processor=processor,
        )
    else:
        torch_dtype = torch.float16 if torch.cuda.is_available() else torch.float32
        pipeline = transformers_pipeline(
            "automatic-speech-recognition",
            device=0 if torch.cuda.is_available() else -1,
            model=model_id,
            torch_dtype=torch_dtype,
        )
        loaded = LoadedLocalModel(
            device=device,
            kind="whisper",
            last_used_at=now,
            model=pipeline.model,
            model_id=assessor_model,
            pipeline=pipeline,
        )

    with model_lock:
        loaded_local_models[assessor_model] = loaded

    enforce_loaded_model_limit()
    return loaded


def run_local_ctc(
    audio_path: str, assessor_model: str
) -> tuple[str, int, dict[str, Any]]:
    loaded = load_local_model(assessor_model)
    audio, _ = librosa.load(audio_path, sr=SAMPLE_RATE, mono=True)
    if audio.size == 0:
        return "", 0, {"model": get_local_model_id(assessor_model), "transcript": ""}

    if not loaded.processor:
        return "", 0, {"model": get_local_model_id(assessor_model), "transcript": ""}

    inputs = loaded.processor(
        audio, sampling_rate=SAMPLE_RATE, return_tensors="pt", padding=True
    )
    input_values = inputs.input_values.to(loaded.device)

    with torch.inference_mode():
        logits = loaded.model(input_values).logits
        probabilities = torch.softmax(logits, dim=-1)
        confidence = probabilities.max(dim=-1).values.mean().item()
        predicted_ids = torch.argmax(logits, dim=-1)

    loaded.last_used_at = time.monotonic()
    transcript = loaded.processor.batch_decode(predicted_ids)[0].strip()
    return (
        transcript,
        clamp_score(confidence * 100),
        {"model": get_local_model_id(assessor_model), "transcript": transcript},
    )


def get_whisper_language_hint(language: str) -> str | None:
    normalized = language.lower().strip()
    if normalized in {"", "auto"}:
        return None

    aliases = {
        "filipino": "tagalog",
        "malay": "ms",
        "singlish": "english",
    }
    return aliases.get(normalized, normalized)


def run_local_whisper(
    audio_path: str, assessor_model: str, language: str
) -> tuple[str, int, dict[str, Any]]:
    loaded = load_local_model(assessor_model)
    if not loaded.pipeline:
        return "", 0, {"model": get_local_model_id(assessor_model), "transcript": ""}

    generate_kwargs: dict[str, str] = {"task": "transcribe"}
    language_hint = get_whisper_language_hint(language)
    if language_hint:
        generate_kwargs["language"] = language_hint

    result = loaded.pipeline(audio_path, generate_kwargs=generate_kwargs)
    loaded.last_used_at = time.monotonic()
    transcript = result.get("text", "") if isinstance(result, dict) else ""
    return (
        transcript.strip(),
        90,
        {
            "languageHint": language_hint,
            "model": get_local_model_id(assessor_model),
            "response": result,
        },
    )


def build_grade(
    *,
    acoustic_confidence: int,
    assessor_model: str,
    local_transcript: str,
    provider: str,
    raw: dict[str, Any],
    reference_text: str,
    valsea_response: dict[str, Any],
    valsea_transcript: str,
) -> dict[str, Any]:
    expected_words = tokenize_words(reference_text)
    valsea_words = tokenize_words(valsea_transcript)
    local_words = tokenize_words(local_transcript)
    corrections = valsea_response.get("corrections")
    correction_count = len(corrections) if isinstance(corrections, list) else 0
    correction_penalty = min(18, correction_count * 3)

    words = []
    for index, expected in enumerate(expected_words):
        valsea_heard = valsea_words[index] if index < len(valsea_words) else ""
        local_heard = local_words[index] if index < len(local_words) else ""
        valsea_score = compare_tokens(expected, valsea_heard)
        local_score = compare_tokens(expected, local_heard)
        score = clamp_score(
            (local_score * 0.62) + (valsea_score * 0.23) + (acoustic_confidence * 0.15)
        )
        native_score = clamp_score(
            (score * 0.72) + (acoustic_confidence * 0.28) - correction_penalty
        )
        heard = local_heard or valsea_heard
        words.append(
            {
                "characters": build_character_grades(expected, heard, score),
                "expected": expected,
                "heard": heard,
                "level": score_to_level(score),
                "nativeScore": native_score,
                "score": score,
            }
        )

    overall_score = (
        clamp_score(np.mean([word["score"] for word in words])) if words else 0
    )
    native_similarity = (
        clamp_score(np.mean([word["nativeScore"] for word in words])) if words else 0
    )

    if native_similarity >= 85:
        summary = "Native-like delivery with stable acoustic confidence and strong phrase alignment."
    elif native_similarity >= 70:
        summary = "Understandable delivery with a few words that would benefit from another pass."
    elif native_similarity >= 50:
        summary = "Partly understandable delivery; focus on the highlighted amber and orange sounds."
    else:
        summary = "The phrase needs focused pronunciation practice before using it live."

    return {
        "assessorModel": assessor_model,
        "heardText": local_transcript or valsea_transcript,
        "nativeSimilarity": native_similarity,
        "overallScore": overall_score,
        "provider": provider,
        "raw": {
            "acousticConfidence": acoustic_confidence,
            "assessor": raw,
            "loadedLocalModels": get_loaded_model_snapshot(),
        },
        "referenceText": reference_text,
        "summary": summary,
        "words": words,
    }


@app.on_event("startup")
def warm_model() -> None:
    if PRELOAD_MODEL:
        load_local_model(get_assessor_model(DEFAULT_ASSESSOR_MODEL))


@app.get("/health")
def health() -> dict[str, Any]:
    unload_idle_local_models()
    return {
        "defaultModel": DEFAULT_ASSESSOR_MODEL,
        "idleTtlSeconds": LOCAL_MODEL_IDLE_TTL_SECONDS,
        "loadedLocalModels": get_loaded_model_snapshot(),
        "ok": True,
        "supportedModels": sorted(SUPPORTED_ASSESSOR_MODELS),
    }


@app.get("/models")
def models() -> dict[str, Any]:
    unload_idle_local_models()
    return {
        "defaultModel": DEFAULT_ASSESSOR_MODEL,
        "idleTtlSeconds": LOCAL_MODEL_IDLE_TTL_SECONDS,
        "loadedLocalModels": get_loaded_model_snapshot(),
        "maxLoadedLocalModels": LOCAL_MODEL_MAX_LOADED,
        "supportedModels": sorted(SUPPORTED_ASSESSOR_MODELS),
    }


@app.get("/tts/voices")
def tts_voices() -> dict[str, Any]:
    return {
        "defaultVoice": PIPER_DEFAULT_VOICE,
        "engine": "piper",
        "voices": [
            {
                "id": voice_id,
                **metadata,
            }
            for voice_id, metadata in PIPER_VOICES.items()
        ],
    }


@app.post("/tts/synthesize")
def synthesize_tts(request: TtsRequest) -> dict[str, Any]:
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="text is required")
    try:
        return run_piper_tts(request)
    except Exception as error:
        logger.exception("Piper speech synthesis failed")
        raise HTTPException(
            status_code=503, detail="Local speech synthesis failed"
        ) from error


@app.post("/models/load")
def load_model_endpoint(request: ModelRequest) -> dict[str, Any]:
    model = get_assessor_model(request.model)
    load_local_model(model)
    return {
        "loadedLocalModels": get_loaded_model_snapshot(),
        "model": model,
    }


@app.post("/models/unload")
def unload_model_endpoint(request: ModelRequest) -> dict[str, Any]:
    model = get_assessor_model(request.model) if request.model else None
    removed = unload_local_model(model)
    return {
        "loadedLocalModels": get_loaded_model_snapshot(),
        "removed": removed,
    }


@app.post("/assess")
async def assess(
    file: UploadFile = File(...),
    language: str = Form("english"),
    referenceText: str = Form(...),
    valseaTranscript: str = Form(""),
    valseaResponse: str | None = Form(None),
    assessorModel: str | None = Form(None),
) -> dict[str, Any]:
    model = get_assessor_model(assessorModel)
    suffix = os.path.splitext(file.filename or "")[1] or ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=True) as temp_file:
        temp_file.write(await file.read())
        temp_file.flush()

        if model == LOCAL_ASSESSOR_MODEL:
            local_transcript, acoustic_confidence, raw = run_local_ctc(
                temp_file.name,
                model,
            )
        else:
            local_transcript, acoustic_confidence, raw = run_local_whisper(
                temp_file.name,
                model,
                language,
            )

    valsea_response = parse_valsea_response(valseaResponse)
    return build_grade(
        acoustic_confidence=acoustic_confidence,
        assessor_model=model,
        local_transcript=local_transcript,
        provider="local-model",
        raw=raw,
        reference_text=referenceText,
        valsea_response=valsea_response,
        valsea_transcript=valseaTranscript,
    )
