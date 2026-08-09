# Plan 016: Bound Meeting Transcription Input Before AI Invocation

> **Executor instructions:** Enforce the inline-provider contract on the server
> and mirror it in the shared client. Reject before byte-buffer allocation or AI
> setup whenever request metadata permits. Do not add silent truncation.
>
> **Drift check (run first):**
> `git diff --stat 68a1457aed77cb9ba4b8b1f3b8f467fa4b04da9b..HEAD -- packages/ai/src/meetings/transcription packages/internal-api/src/meetings.ts apps/meet/src/hooks/useTranscription.ts apps/meet/src/features/call/lib/recording.ts`
> Stop if the provider transport or recording pipeline has changed.

## Status

- **Execution status:** TODO
- **Priority:** P1
- **Effort:** S
- **Risk:** LOW
- **Category:** Performance / Security / AI cost
- **Depends on:** none
- **Planned at:** commit `68a1457aed`, 2026-08-10

## Why this matters

The authenticated transcription route parses multipart data, allocates the full
audio buffer, and invokes a metered AI model without a byte or media-type
contract. It also labels every upload `audio/mpeg`, although Meet records WebM,
MP4, or Ogg. Oversized input can consume request memory and provider budget and
will exceed Gemini's inline request contract instead of producing a useful
transcript.

## Current state

`packages/ai/src/meetings/transcription/route.ts:45-55` calls `req.formData()`,
casts `audio` to `File`, and immediately calls `arrayBuffer()`. Lines 57-80 pass
those bytes to `generateObject` with hard-coded `mediaType: 'audio/mpeg'`.
`packages/internal-api/src/meetings.ts:154-163` accepts any Blob and always names
it `recording.mp3`.

The Meet recorder intentionally produces `audio/webm`, `audio/mp4`, or
`audio/ogg` variants in
`apps/meet/src/features/call/lib/recording.ts:1-14`. Google documents a 20 MB
total limit for inline audio requests, including prompt/system content, in its
[official audio guide](https://ai.google.dev/gemini-api/docs/audio); this plan
reserves headroom with an explicit `18 * 1024 * 1024` byte audio maximum.
Files larger than that need a separate Files API/chunking design, not a larger
inline cap.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Route tests | `bun --cwd packages/ai vitest run src/meetings/transcription/route.test.ts` | exit 0; rejection precedes buffer/provider calls |
| Internal client tests | `bun --cwd packages/internal-api vitest run src/meetings.test.ts` | exit 0; client mirrors size/type contract |
| Typechecks | `bun --cwd packages/ai run type-check && bun --cwd packages/internal-api run type-check` | both exit 0 |
| Repository gate | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- `packages/ai/src/meetings/transcription/route.ts` and new `route.test.ts`
- `packages/internal-api/src/meetings.ts` and new `meetings.test.ts`
- New shared constants/types in the narrowest existing meetings module if both
  packages can consume them without a dependency cycle
- `apps/meet/src/hooks/useTranscription.ts` only for presenting the typed 413/415
  failure; update both English/Vietnamese messages if new UI text is required

Out of scope: Gemini Files API, audio chunking, transcription queues, recording
storage, duration limits, model changes, and waveform UI.

## Git workflow

- Branch: `fix/meeting-transcription-input-bounds` in an isolated worktree.
- Conventional Commit: `fix(ai): bound meeting transcription input`.
- Do not push/open a PR unless instructed. Claim the Git commit window before
  staging/committing; never stage coordination notes.

## Steps

### Step 1: Define the server contract

Define `MAX_INLINE_TRANSCRIPTION_AUDIO_BYTES = 18 * 1024 * 1024`. Allow the
actual recorder families: `audio/webm`, `audio/mp4`, `audio/ogg`, and
`audio/mpeg`, accepting optional codec parameters only after parsing the base
MIME type. Require a real `File`, nonzero size, and one allowed media type.

**Verify:** pure validation tests cover boundary-1, exact boundary, boundary+1,
empty/non-File entries, each allowed base type with/without codecs, and
unsupported/non-audio types.

### Step 2: Reject grossly oversized requests before multipart parsing

After authentication, inspect a valid numeric `Content-Length`. If it exceeds
`MAX_INLINE_TRANSCRIPTION_AUDIO_BYTES + 1 MiB` multipart headroom, return 413
before `req.formData()`. Treat missing/invalid/chunked length as unknown and
continue to the authoritative File check; never trust a small declared length.

**Verify:** an oversized declared request returns 413 with zero `formData`,
`arrayBuffer`, memory wrapper, model, or provider calls.

### Step 3: Recheck File size/type before allocation

After parsing, validate the File and return 400 for missing/empty, 413 for over
18 MiB, and 415 for unsupported type. Only then call `arrayBuffer()`. Pass the
validated base MIME type to the AI file part instead of hard-coding MPEG. Create
AI memory/model dependencies only after validation.

**Verify:** focused tests prove every rejection makes zero buffer and
`generateObject` calls; valid WebM/MP4/Ogg/MPEG inputs pass their true base type.

### Step 4: Mirror the boundary in the shared client

Before constructing/sending FormData, reject empty, oversized, and unsupported
Blobs with a typed internal-client error that Meet can distinguish. Preserve the
Blob type and choose a filename extension matching its base MIME type rather
than always `recording.mp3`. The server remains authoritative.

**Verify:** client tests assert no fetch for invalid blobs and correct
FormData filename/type for every allowed family.

### Step 5: Surface actionable failure and run gates

If the existing hook reduces all errors to one generic toast, distinguish the
size/type cases with localized guidance that the recording cannot yet be
transcribed inline. Do not imply the stored recording was lost. Run `bun
i18n:sort` if message bundles change, then every command in the table.

## Done criteria

- [ ] Requests over the declared gross limit are rejected before multipart
  parsing when `Content-Length` is usable.
- [ ] File size and media type are validated before `arrayBuffer` or AI setup.
- [ ] The provider receives the actual validated audio media type.
- [ ] The shared client rejects the same invalid inputs before network work.
- [ ] Focused tests, typechecks, `bun check`, and whitespace pass.

## STOP conditions

Stop if production recordings routinely exceed 18 MiB, the provider transport
has switched away from inline bytes, multipart overhead can exceed 1 MiB, or a
normal supported browser produces a different MIME family. In the first case,
write a separate Files API/chunked-transcription plan rather than increasing the
inline limit beyond the provider contract.

## Maintenance notes

The 18 MiB cap is intentionally below the provider's 20 MB total request limit.
Reviewers should verify server-side enforcement remains authoritative and that
future recorder MIME additions update both client and server tests.
