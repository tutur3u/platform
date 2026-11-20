import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';
import { type SignedUploadPayload, uploadFileWithSignedUrl } from './storage';

/** Meet's Cloudflare-local refresh also supports invited guests outside a workspace. */
export function createMeetCallRealtimeToken(
  meetingId: string,
  options?: InternalApiClientOptions,
  device?: { deviceId: string; joinMode?: 'switch' | 'additional' },
  signal?: AbortSignal
) {
  return getInternalApiClient(options).json<
    | {
        requiresDeviceChoice: true;
        otherDeviceCount: number;
        token?: never;
        realtimeUrl?: never;
      }
    | { requiresDeviceChoice?: false; token: string; realtimeUrl: string }
  >(`/api/meet-call/${encodePathSegment(meetingId)}/token`, {
    method: 'POST',
    signal,
    body: device ? JSON.stringify(device) : undefined,
  });
}

/** Anonymous guest join: the server verifies Turnstile and sets a signed cookie. */
export function joinMeetCallAsGuest(
  meetingId: string,
  input: { displayName: string; turnstileToken?: string }
) {
  return getInternalApiClient().json<{ ok: true }>(
    `/api/meet-call/${encodePathSegment(meetingId)}/guest`,
    { method: 'POST', body: JSON.stringify(input) }
  );
}

/** Forgets this browser's guest identity for the meeting. */
export function forgetMeetCallGuest(meetingId: string) {
  return getInternalApiClient().json<{ ok: true }>(
    `/api/meet-call/${encodePathSegment(meetingId)}/guest`,
    { method: 'DELETE' }
  );
}

/** Persist only the title; leave meeting time and calendar metadata intact. */
export function updateMeetCallTitle(meetingId: string, name: string) {
  return getInternalApiClient().json<{ name: string }>(
    `/api/meet-call/${encodePathSegment(meetingId)}/title`,
    {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }
  );
}

export function getMeetCallRoomState(
  meetingId: string,
  options?: { signal?: AbortSignal }
) {
  return getInternalApiClient().json<{
    ended: boolean;
    canReadNotes: boolean;
    lifecycleVersion: number;
  }>(`/api/meet-call/${encodePathSegment(meetingId)}/state`, {
    cache: 'no-store',
    signal: options?.signal,
  });
}

export function restoreMeetCallRoom(
  meetingId: string,
  expectedVersion: number,
  expectedActorId: string
) {
  return getInternalApiClient().json<{
    ended: false;
    lifecycleVersion: number;
  }>(`/api/meet-call/${encodePathSegment(meetingId)}/state`, {
    method: 'POST',
    body: JSON.stringify({ expectedVersion, expectedActorId }),
  });
}

export function askMeetAssistant(
  meetingId: string,
  messageId: string,
  timezone?: string,
  workspaceId?: string
) {
  return getInternalApiClient().json<{ ok: boolean; reviewId?: string }>(
    `/api/meet-call/${encodePathSegment(meetingId)}/assistant`,
    {
      method: 'POST',
      body: JSON.stringify({ messageId, timezone, workspaceId }),
    }
  );
}
export function uploadMeetChatFile(meetingId: string, file: File) {
  const form = new FormData();
  form.set('file', file);
  return getInternalApiClient().json<{
    id: string;
    name: string;
    size: number;
    contentType: string;
  }>(`/api/meet-call/${encodePathSegment(meetingId)}/files`, {
    method: 'POST',
    body: form,
  });
}
export function readMeetChatFile(meetingId: string, id: string) {
  return getInternalApiClient().json<{
    url: string;
    name: string;
    size: number;
    contentType: string;
  }>(
    `/api/meet-call/${encodePathSegment(meetingId)}/files?id=${encodeURIComponent(id)}`,
    { cache: 'no-store' }
  );
}
export async function uploadMeetRoomRecording(
  meetingId: string,
  sessionId: string,
  blob: Blob
) {
  const contentType = blob.type.split(';')[0] || 'video/webm';
  const body = JSON.stringify({ sessionId, size: blob.size, contentType });
  const endpoint = `/api/meet-call/${encodePathSegment(meetingId)}/recording`;
  const target = await getInternalApiClient().json<{
    upload?: SignedUploadPayload;
    alreadyUploaded?: boolean;
    alreadySaved?: boolean;
  }>(endpoint, { method: 'POST', body });
  if (target.alreadySaved) return { ok: true };
  if (target.upload) {
    const file = new File(
      [blob],
      `recording.${contentType.includes('mp4') ? 'mp4' : 'webm'}`,
      { type: contentType }
    );
    await uploadFileWithSignedUrl(file, target.upload, fetch);
  } else if (!target.alreadyUploaded)
    throw new Error('Recording upload is unavailable');
  return getInternalApiClient().json<{ ok: boolean }>(endpoint, {
    method: 'PUT',
    body,
  });
}
export function readMeetRecordings(meetingId: string) {
  return getInternalApiClient().json<{
    recordings: Array<{
      sessionId: string;
      startedAt: string;
      endedAt?: string;
      status: string;
    }>;
  }>(`/api/meet-call/${encodePathSegment(meetingId)}/recording`, {
    cache: 'no-store',
  });
}
export function readMeetRecording(meetingId: string, sessionId: string) {
  return getInternalApiClient().json<{ url: string }>(
    `/api/meet-call/${encodePathSegment(meetingId)}/recording?sessionId=${encodeURIComponent(sessionId)}`,
    { cache: 'no-store' }
  );
}

export function getMeetRoomCosts(meetingId: string) {
  return getInternalApiClient().json<{
    budget?: {
      historicalUsageUnknown?: boolean;
      expiresAt: number;
      participantMilliseconds: number;
      maxPublishers: number;
      maxViewers: number;
    };
    cloudflare: null | {
      receivedBytes: number;
      devices: number;
      reportingDevices: number;
      limitedReports?: number;
      webSocketMessages: number;
      httpRequests: number;
      storageWrites: number;
      sfuEgressUsd: number;
      durableRequestsUsd: number;
      pricingDate: string;
    };
    live?: { sessions: number; costUsd: number; incomplete: number };
    miraRequests: number;
    miraCostUsd: number;
    miraUnpriced: number;
  }>(`/api/meet-call/${encodePathSegment(meetingId)}/costs`, {
    cache: 'no-store',
  });
}

export function discardMeetChatFile(meetingId: string, id: string) {
  return getInternalApiClient().json<{ ok: boolean }>(
    `/api/meet-call/${encodePathSegment(meetingId)}/files`,
    {
      method: 'DELETE',
      body: JSON.stringify({ id }),
    }
  );
}

export interface MeetAssistantReview {
  text: string;
  approvals: Array<{ id: string; toolName: string; input: unknown }>;
  workspaceId: string;
  workspaceName: string;
  timezone: string;
  status: 'ready' | 'executing' | 'interrupted' | 'shared' | 'discarded';
  revision: number;
}
export function listMeetAssistantReviews(meetingId: string) {
  return getInternalApiClient().json<Array<{ id: string; status: string }>>(
    `/api/meet-call/${encodePathSegment(meetingId)}/assistant/review`,
    { cache: 'no-store' }
  );
}
export function getMeetAssistantReview(meetingId: string, messageId: string) {
  return getInternalApiClient().json<MeetAssistantReview>(
    `/api/meet-call/${encodePathSegment(meetingId)}/assistant/review?messageId=${encodeURIComponent(messageId)}`,
    { cache: 'no-store' }
  );
}
export function respondMeetAssistantReview(
  meetingId: string,
  messageId: string,
  revision: number,
  action: 'approve' | 'deny' | 'share' | 'discard'
) {
  return getInternalApiClient().json<{ ok: boolean }>(
    `/api/meet-call/${encodePathSegment(meetingId)}/assistant/review`,
    { method: 'POST', body: JSON.stringify({ messageId, revision, action }) }
  );
}

export function askPersonalMeetAssistant(
  meetingId: string,
  input: {
    requestId: string;
    startedAt: number;
    question: string;
    timezone: string;
    history: Array<{ body: string; assistant: boolean }>;
  }
) {
  return getInternalApiClient().json<{ text: string }>(
    `/api/meet-call/${encodePathSegment(meetingId)}/assistant/personal`,
    {
      method: 'POST',
      body: JSON.stringify(input),
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

export function getMeetPublicInfoSettings(meetingId: string) {
  return getInternalApiClient().json<{
    publicLinkPreview: boolean;
    title: string;
  }>(`/api/meet-call/${encodePathSegment(meetingId)}/public-info`, {
    cache: 'no-store',
  });
}
export function updateMeetPublicInfoSettings(
  meetingId: string,
  publicLinkPreview: boolean
) {
  return getInternalApiClient().json<{
    publicLinkPreview: boolean;
    title: string;
  }>(`/api/meet-call/${encodePathSegment(meetingId)}/public-info`, {
    method: 'PATCH',
    body: JSON.stringify({ publicLinkPreview }),
  });
}

/** The caller's private post-call rating, 1–5, or null before rating. */
export function readMeetCallRating(meetingId: string) {
  return getInternalApiClient().json<{ rating: number | null }>(
    `/api/meet-call/${encodePathSegment(meetingId)}/rating`,
    { cache: 'no-store' }
  );
}
export function updateMeetCallRating(meetingId: string, value: number) {
  return getInternalApiClient().json<{ rating: number }>(
    `/api/meet-call/${encodePathSegment(meetingId)}/rating`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    }
  );
}

export type MeetingProgrammingSelection = {
  kind: 'playground' | 'problem';
  id: string;
  language: import('@tuturuuu/types/primitives/playgrounds').PlaygroundLanguage;
};
export type MeetingProgrammingJoin =
  import('./playgrounds').ProgrammingCollaborationJoin & {
    selection: MeetingProgrammingSelection;
    problem?: import('@tuturuuu/types/primitives/programming').ProgrammingProblem;
  };
const programmingCallPath = (id: string) =>
  `/api/meet-call/${encodePathSegment(id)}/programming`;
export function getMeetProgramming(id: string) {
  return getInternalApiClient().json<
    MeetingProgrammingJoin | { selection: null }
  >(programmingCallPath(id), { cache: 'no-store' });
}
export function selectMeetProgramming(
  id: string,
  selection: MeetingProgrammingSelection | null
) {
  return getInternalApiClient().json<{
    selection: MeetingProgrammingSelection | null;
  }>(programmingCallPath(id), {
    method: 'PUT',
    body: JSON.stringify(selection),
    headers: { 'Content-Type': 'application/json' },
  });
}
export function testMeetProgramming(id: string, source: string) {
  return getInternalApiClient().json<{ id: string }>(programmingCallPath(id), {
    method: 'POST',
    body: JSON.stringify({ source }),
    headers: { 'Content-Type': 'application/json' },
  });
}
export type MeetProgrammingTestCase = {
  index: number;
  passed: boolean;
  reason: string;
  output?: string;
  stderr?: string;
};

export function getMeetProgrammingTest(id: string, test: string) {
  return getInternalApiClient().json<{
    status: string;
    output: string | null;
    cases?: MeetProgrammingTestCase[];
  }>(`${programmingCallPath(id)}?test=${encodePathSegment(test)}`, {
    cache: 'no-store',
  });
}

export function checkpointMeetProgramming(id: string) {
  return getInternalApiClient().json<MeetingProgrammingJoin>(
    `${programmingCallPath(id)}?checkpoint`,
    { method: 'POST', cache: 'no-store' }
  );
}
export function createMeetPlayground(
  id: string,
  payload: {
    name: string;
    empty?: boolean;
    language: import('@tuturuuu/types/primitives/playgrounds').PlaygroundLanguage;
  }
) {
  return getInternalApiClient().json<{ id: string }>(
    `${programmingCallPath(id)}?create`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
export function runMeetPlayground(
  id: string,
  payload: { operation: 'run' | 'stop'; requestId: string; stdin?: string }
) {
  return getInternalApiClient().json<{ runId: string }>(
    `${programmingCallPath(id)}?run`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
export function getMeetPlaygroundRun(id: string, run: string) {
  return getInternalApiClient().json<
    import('@tuturuuu/types/primitives/playgrounds').PlaygroundExecutionResult
  >(`${programmingCallPath(id)}?run=${encodePathSegment(run)}`, {
    cache: 'no-store',
  });
}

export interface MeetingDocumentJoin {
  documentId: string;
  /** Omitted by clients that only know the primary meeting document. */
  tabId?: string;
  revision: number;
  state: number[];
  endpoint: string;
  token: string;
  role: 'editor';
  user: { id: string; user_metadata: { display_name: string } };
}
export interface MeetAttendanceRow {
  name: string;
  firstJoin: string;
  totalMinutes: number;
  kind: 'member' | 'guest';
}

export function commandMeetClassTimer(
  meetingId: string,
  command: {
    action: 'start' | 'pause' | 'resume' | 'stop';
    durationMs?: number;
  },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ ok: true }>(
    `/api/meet-call/${encodePathSegment(meetingId)}/class-timer`,
    { method: 'POST', body: JSON.stringify(command) }
  );
}

export function getMeetAttendance(
  meetingId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ rows: MeetAttendanceRow[] }>(
    `/api/meet-call/${encodePathSegment(meetingId)}/attendance`
  );
}

export function getMeetDocument(
  meetingId: string,
  options?: InternalApiClientOptions,
  tabId?: string
) {
  const tab =
    tabId && tabId !== 'primary' ? `?tab=${encodeURIComponent(tabId)}` : '';
  return getInternalApiClient(options).json<MeetingDocumentJoin>(
    `/api/meet-call/${encodePathSegment(meetingId)}/document${tab}`
  );
}

export type MeetProgrammingMiraAction =
  | {
      action: 'analyze';
      source: 'chat' | 'live';
      intent: 'explain' | 'fix';
      range: { filePath: string; startLine: number; endLine: number };
      failure?: { submissionId: string; index: number };
    }
  | { action: 'publish' | 'cancel'; id: string }
  | { action: 'resolve'; id: string; decision: 'accepted' | 'dismissed' };

export function getMeetProgrammingMira(id: string) {
  return getInternalApiClient().json<{
    selection: MeetingProgrammingSelection | null;
    miraPresence:
      | import('@tuturuuu/realtime/meet').ProgrammingMiraPresence
      | null;
    voiceDraft: {
      id: string;
      answer: { explanation: string; replacement: string | null } | null;
    } | null;
  }>(`${programmingCallPath(id)}?mira`, { cache: 'no-store' });
}

export function updateMeetProgrammingMira(
  id: string,
  selection: MeetingProgrammingSelection,
  action: MeetProgrammingMiraAction
) {
  return getInternalApiClient().json<{ ok: true }>(
    `${programmingCallPath(id)}?mira`,
    {
      method: 'POST',
      body: JSON.stringify({ ...action, selection }),
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

export type MeetingDocumentKind = 'doc' | 'notes' | 'rubric' | 'summary';
export type MeetingDocumentSource = 'chat' | 'live';
export interface MeetingDocumentTab {
  id: string;
  kind: MeetingDocumentKind;
  title?: string;
  createdBy?: string;
  createdAt: number;
  updatedAt: number;
}
export interface MeetingDocumentMiraPresence {
  requestId?: string;
  activeTabId: string;
  source: MeetingDocumentSource;
  status: 'editing' | 'reviewing';
  section?: string;
  askedBy: string;
  updatedAt: number;
  expiresAt: number;
}
export interface MeetingDocumentMiraEdit {
  id: string;
  tabId: string;
  source: MeetingDocumentSource;
  action: 'draft' | 'refine' | 'summarize';
  askedBy: string;
  askedByName?: string;
  before: string;
  after: string;
  createdAt: number;
  review: 'pending' | 'accepted' | 'reverted';
}
export interface MeetingDocuments {
  tabs: MeetingDocumentTab[];
  mira: MeetingDocumentMiraPresence | null;
  edits: MeetingDocumentMiraEdit[];
}
export type MeetingDocumentCommand =
  | { action: 'create'; kind: MeetingDocumentKind; title?: string }
  | { action: 'rename'; tabId: string; title: string | null }
  | { action: 'close'; tabId: string }
  | {
      action: 'review';
      editId: string;
      decision: 'accepted' | 'reverted';
    };
export interface MeetingDocumentAssistInput {
  requestId: string;
  startedAt: number;
  tabId: string;
  mode: 'draft' | 'refine' | 'summarize';
  instruction?: string;
  text: string;
  section?: string;
  cursor?: { anchor: Record<string, unknown>; head: Record<string, unknown> };
  timezone: string;
}

function documentPath(meetingId: string) {
  return `/api/meet-call/${encodePathSegment(meetingId)}/document`;
}
export function listMeetDocuments(
  meetingId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<MeetingDocuments>(
    `${documentPath(meetingId)}?view=tabs`,
    { cache: 'no-store' }
  );
}
export function updateMeetDocuments(
  meetingId: string,
  command: MeetingDocumentCommand,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<MeetingDocuments>(
    documentPath(meetingId),
    {
      method: 'POST',
      body: JSON.stringify(command),
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

export function assistMeetDocument(
  meetingId: string,
  input: MeetingDocumentAssistInput,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{
    editId: string;
    source: MeetingDocumentSource;
    text: string;
  }>(documentPath(meetingId), {
    method: 'POST',
    body: JSON.stringify({ action: 'assist', ...input }),
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Room Mira notice state for the caller; counts only, never identities. */
export type RoomMiraConsent =
  | { available: false }
  | {
      available: true;
      version: string;
      choice: 'continue' | 'mute' | null;
      fence: { ready: boolean; pending: number; admitted: number };
    };

export function readRoomMiraConsent(meetingId: string) {
  return getInternalApiClient().json<RoomMiraConsent>(
    `/api/meet-call/${encodePathSegment(meetingId)}/mira-room`,
    { cache: 'no-store' }
  );
}

export function setRoomMiraChoice(
  meetingId: string,
  choice: 'continue' | 'mute',
  version: string
) {
  return getInternalApiClient().json<RoomMiraConsent>(
    `/api/meet-call/${encodePathSegment(meetingId)}/mira-room`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ choice, version }),
    }
  );
}
