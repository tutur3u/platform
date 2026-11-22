/**
 * Facts the ended-meeting screen shows beside the title. Every input is data
 * the viewer's access-checked routes already returned: the meet-ai state for
 * note readers and the recordings list for viewers the room shares
 * recordings with. A missing input yields `null`, never a guessed value.
 */
export type EndedRecordingState = 'saved' | 'processing' | 'none';
export type EndedTranscriptState = 'ready' | 'processing' | 'none';

export interface EndedMeetingFacts {
  /** Span covered by captured sessions or recordings, in whole minutes. */
  minutes: number | null;
  /** Distinct transcript speakers; null when the transcript is unreadable. */
  speakers: number | null;
  recording: EndedRecordingState | null;
  transcript: EndedTranscriptState | null;
}

interface SessionInput {
  created_at: string;
  ended_at: string | null;
  notes_status: string;
}
interface ChunkInput {
  status: string;
  speaker?: { accountId: string } | { selector: string } | null | undefined;
  segments?: Array<{ erased: true } | { speaker: ChunkInput['speaker'] }>;
}
interface RecordingInput {
  startedAt: string;
  endedAt?: string;
  status: string;
}

const time = (value: string | undefined | null) => {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

function speakerKey(speaker: ChunkInput['speaker']) {
  if (!speaker) return null;
  return 'accountId' in speaker
    ? `a:${speaker.accountId}`
    : `s:${speaker.selector}`;
}

export function endedMeetingFacts({
  ai,
  recordings,
}: {
  ai?: { sessions: SessionInput[]; chunks: ChunkInput[] } | null;
  recordings?: RecordingInput[] | null;
}): EndedMeetingFacts {
  const spans: Array<[number, number]> = [];
  for (const session of ai?.sessions ?? []) {
    const start = time(session.created_at);
    const end = time(session.ended_at);
    if (start !== null && end !== null && end > start) spans.push([start, end]);
  }
  for (const record of recordings ?? []) {
    const start = time(record.startedAt);
    const end = time(record.endedAt);
    if (start !== null && end !== null && end > start) spans.push([start, end]);
  }
  const minutes = spans.length
    ? Math.max(
        1,
        Math.round(
          (Math.max(...spans.map(([, end]) => end)) -
            Math.min(...spans.map(([start]) => start))) /
            60_000
        )
      )
    : null;

  let speakers: number | null = null;
  if (ai) {
    const keys = new Set<string>();
    for (const chunk of ai.chunks) {
      const own = speakerKey(chunk.speaker);
      if (own) keys.add(own);
      for (const segment of chunk.segments ?? []) {
        if ('erased' in segment) continue;
        const key = speakerKey(segment.speaker);
        if (key) keys.add(key);
      }
    }
    speakers = keys.size || null;
  }

  const recording: EndedRecordingState | null = recordings
    ? recordings.some((record) => record.status === 'ready')
      ? 'saved'
      : recordings.some((record) => record.status !== 'failed')
        ? 'processing'
        : 'none'
    : null;

  const transcript: EndedTranscriptState | null = ai
    ? ai.sessions.some((session) => session.notes_status === 'processing') ||
      ai.chunks.some((chunk) => chunk.status === 'processing')
      ? 'processing'
      : ai.chunks.some((chunk) => chunk.status === 'completed')
        ? 'ready'
        : 'none'
    : null;

  return { minutes, speakers, recording, transcript };
}

/**
 * Which ended-meeting reader the viewer can open, decided only from the
 * access-checked meet-ai state. `loading` holds the space until the state
 * arrives; a refused or failed read, or a room with neither post-call notes
 * nor a readable transcript, is `none` so the page offers no empty reader.
 */
export type EndedNotesAvailability =
  | 'loading'
  | 'none'
  | 'notes'
  | 'transcript'
  | 'both';

interface AvailabilityChunk {
  status: string;
  erased?: boolean;
  transcript?: string | null;
  segments?: Array<{ erased: true } | { transcript?: string | null }>;
}

/**
 * A chunk is marked erased as soon as one speaker's segment is removed, while
 * the other speakers' segments stay readable. Only a chunk without segments
 * falls back to its combined text, and only when nothing was erased.
 */
function readableChunk(chunk: AvailabilityChunk) {
  if (chunk.status !== 'completed') return false;
  if (chunk.segments?.length)
    return chunk.segments.some(
      (segment) => !('erased' in segment) && !!segment.transcript?.trim()
    );
  return !chunk.erased && !!chunk.transcript?.trim();
}

export function endedNotesAvailability({
  data,
  error,
}: {
  data?: {
    sessions: Array<{ notes: unknown }>;
    chunks: AvailabilityChunk[];
  } | null;
  error?: unknown;
}): EndedNotesAvailability {
  if (!data) return error ? 'none' : 'loading';
  const notes = data.sessions.some((session) => session.notes != null);
  const transcript = data.chunks.some(readableChunk);
  if (notes) return transcript ? 'both' : 'notes';
  return transcript ? 'transcript' : 'none';
}
