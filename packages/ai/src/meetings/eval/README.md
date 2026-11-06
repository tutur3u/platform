# Meet transcription evaluation

Run from the repository root with Bun. This CLI is evaluation-only: nothing
registers these adapters with Meet, writes to a database or changes the production
provider. Gemini Flash-Lite and Flash run by default; OpenAI requires explicit
opt-in. Provider calls incur API charges and send consented audio and glossary
to the selected providers. No real clips or references belong in this directory.

Create a private directory **outside every Git checkout**, containing a JSON
manifest, audio files and UTF-8 reference files. All paths, including symlinks
and report destinations, are checked against enclosing Git markers.
Relative clip/reference paths resolve against the manifest directory.

Manifest shape (values below are paths, never transcript content):

~~~json
{
  "version": 1,
  "consented": true,
  "glossary": [],
  "clips": [
    {
      "audio": "clip.wav",
      "reference": "reference.txt",
      "mediaType": "audio/wav",
      "language": "vi+en"
    }
  ]
}
~~~

The consent flag is an operator attestation that every clip is approved for every
enabled provider. Use about 20 internal consented 30–90 second clips across
Vietnamese, English, code-switching, noise and names. Never use Parley customer
content. The CLI accepts 1–40 clips, each at most 12 MB; reference and returned
text are limited to 10,000 Unicode characters. Supported MIME types are WAV,
MPEG, MP4, WebM and Ogg audio; supply correctly encoded audio for each provider.
Glossary hints have a 1,500-character total cap and at most 50 entries.

Set these environment variables through your secret manager or shell:

- MEET_STT_EVAL_MANIFEST: absolute path to the private manifest.
- MEET_STT_EVAL_REPORT_DIR: absolute path to an existing private output directory.
- GOOGLE_GENERATIVE_AI_API_KEY: Gemini credential.
- MEET_STT_EVAL_FLASH_MODEL: explicit current Gemini Flash candidate model ID.
  Review the candidate before D1; no guessed Flash model is selected.
- MEET_STT_EVAL_OPENAI=1 and OPENAI_API_KEY: optional eval-only
  gpt-4o-transcribe. Merely having an OpenAI key does not enable it.

~~~sh
bun packages/ai/src/meetings/eval/cli.ts
~~~

The script writes uniquely named Markdown and JSON reports with mode 0600,
and prints only the aggregate Markdown report. It never prints paths, clip IDs,
glossary terms, transcript content, provider error bodies or credentials. SDK
warnings and telemetry are disabled. Keep reports private. A failed clip
increments a count; failures are excluded from score denominators and the exit
code is 1. Configuration/input/output failures return a fixed sanitized message.
Compare successful/total coverage before ranking providers. Calls are sequential,
with no retries and a 90-second timeout per clip/provider (at most 120 calls).

## Scoring contract

Reference and hypothesis use NFC, Vietnamese lowercase, punctuation/symbol
replacement with spaces and whitespace collapse. Tone marks, vowel marks and
đ are retained. Vietnamese WER uses whitespace tokens (syllables, not linguistic
word segmentation); CER uses Unicode code points without spaces. WER and CER
are Levenshtein insertions + deletions + substitutions divided by the corresponding
reference count; corpus scores sum counts before division and can exceed 100%.
A zero denominator is null / N/A, including silence; insertion counts remain
available in JSON and contribute to nonempty corpus denominators.

Term/name accuracy is occurrence recall of normalized whole-token glossary
phrases found in the reference, with hypothesis hits capped at each reference
count. Duplicate normalized glossary entries count once; absent terms are ignored.
This is glossary recall, not diarization, positional alignment or precision.
Use the same glossary and hints for every provider. Reference text is never
passed to a provider. There is no prior-transcript carry-over.

Synthetic-only regression coverage: metrics.test.ts, runner.test.ts and
dataset.test.ts. No consented dataset or real-provider score is included.
Run focused tests with the owning workspace's Vitest configuration:

~~~sh
cd packages/ai
ttr resources run -- bun x vitest run src/meetings/eval --maxWorkers=1
~~~

The evaluation-local SttProvider.transcribeBatch(clips, hints) boundary keeps
execution injectable. It has no production imports; align it with the
M1-D production interface when that independent lane lands.
