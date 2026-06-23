import type { Json, WorkspaceCourseModule } from '@tuturuuu/types';
import type {
  WorkspaceCourseBuilderModule,
  WorkspaceCourseModuleGroup,
} from '@tuturuuu/types/db';
import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

export interface UpsertWorkspaceCoursePayload {
  id?: string;
  name: string;
  archived?: boolean;
  description?: string;
  cert_template?: string;
  ending_date?: string | null;
  is_course_published?: boolean;
  starting_date?: string | null;
}

export interface WorkspaceCourseListItem {
  archived: boolean;
  cert_template: string | null;
  created_at: string | null;
  description: string | null;
  ending_date: string | null;
  id: string;
  is_course_published: boolean;
  members_count: number;
  modules_count: number;
  name: string;
  starting_date: string | null;
}

export interface ListWorkspaceCoursesParams {
  page?: number;
  pageSize?: number;
  q?: string;
  status?: 'active' | 'all' | 'archived';
}

export interface ListWorkspaceCoursesResponse {
  count: number;
  data: WorkspaceCourseListItem[];
  page: number;
  pageSize: number;
}

export interface UpsertWorkspaceCourseModulePayload {
  id?: string;
  name: string;
  module_group_id: string;
  content?: unknown;
  extra_content?: unknown;
  is_public?: boolean;
  is_published?: boolean;
  youtube_links?: string[];
}

export async function listWorkspaceCourseModules(
  workspaceId: string,
  groupId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceCourseModule[]>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/user-groups/${encodePathSegment(groupId)}/modules`,
    { cache: 'no-store' }
  );
}

export async function listWorkspaceCourseModuleGroupModules(
  workspaceId: string,
  groupId: string,
  moduleGroupId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceCourseBuilderModule[]>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/user-groups/${encodePathSegment(groupId)}/module-groups/${encodePathSegment(moduleGroupId)}/modules`,
    { cache: 'no-store' }
  );
}

export interface UpsertWorkspaceCourseModuleGroupPayload {
  id?: string;
  title: string;
  icon?: string | null;
  color?: string;
}

export interface UpsertWorkspaceQuizPayload {
  id?: string;
  question: string;
  quiz_options?: Array<{
    id?: string;
    value: string;
    is_correct: boolean;
    explanation?: string | null;
  }>;
  type?: string;
  content?: Json;
  answer?: Json;
}

export interface CreateWorkspaceQuizPayload {
  moduleId?: string;
  quizzes: UpsertWorkspaceQuizPayload[];
  setId?: string;
}

export interface UpsertWorkspaceQuizSetPayload {
  id?: string;
  moduleId?: string;
  name: string;
}

export interface UpsertWorkspaceFlashcardPayload {
  id?: string;
  moduleId?: string;
  front: string;
  back: string;
}

export interface WorkspaceEducationAttemptListQuery {
  dateFrom?: string;
  dateTo?: string;
  learnerId?: string;
  page?: number;
  pageSize?: number;
  setId?: string;
  sortBy?: 'duration' | 'newest' | 'score';
  sortDirection?: 'asc' | 'desc';
  status?: 'all' | 'completed' | 'incomplete';
}

export type ValseaClassroomOutputType =
  | 'action_items'
  | 'email_summary'
  | 'interview_notes'
  | 'key_quotes'
  | 'meeting_minutes'
  | 'service_log'
  | 'subtitles';

export type ValseaPronunciationAssessorModel =
  | 'local-wav2vec2'
  | 'local-whisper-base'
  | 'local-whisper-large-v3'
  | 'local-whisper-large-v3-turbo'
  | 'local-whisper-medium'
  | 'local-whisper-small'
  | 'local-whisper-tiny';

export interface ValseaClassroomPayload {
  apiKey?: string;
  audioFileName?: string;
  audioStoragePath?: string;
  file?: File;
  language: string;
  outputType: ValseaClassroomOutputType;
  pronunciationModel?: ValseaPronunciationAssessorModel;
  targetLanguage: string;
  transcript?: string;
}

export interface ValseaClassroomScenarioPayload {
  mode?:
    | 'parent_update'
    | 'pronunciation_lab'
    | 'regional_classroom'
    | 'sentiment_lab'
    | 'surprise';
  prompt?: string;
  seed?: string;
}

export interface ValseaClassroomSentimentHypothesis {
  emotions: string[];
  intent: string;
  mood: string;
  risk: string;
}

export interface ValseaClassroomVoicePreset {
  engine: 'piper';
  language: string;
  pace: number;
  speakerId?: number;
  voiceId: string;
}

export interface ValseaClassroomScenarioResponse {
  classroomContext: string;
  expectedConfusions: string[];
  learnerLine: string;
  learnerPersona: string;
  outputType: ValseaClassroomOutputType;
  referencePhrase: string;
  researchQuestion: string;
  rubric: string[];
  scenarioTags: string[];
  sentimentHypothesis: ValseaClassroomSentimentHypothesis;
  sourceLanguage: string;
  targetLanguage: string;
  teacherGoal: string;
  title: string;
  voice: ValseaClassroomVoicePreset;
}

export interface ValseaClassroomSemanticTag {
  meaning?: string;
  phrase?: string;
  tag?: string;
}

export type ValseaVoiceGradeLevel = 'amber' | 'green' | 'orange' | 'red';
export type ValseaVoiceGradeStatus =
  | 'graded'
  | 'insufficient_speech'
  | 'reference_mismatch';

export interface ValseaVoiceGradeCharacter {
  character: string;
  heard?: string;
  hint?: string;
  level: ValseaVoiceGradeLevel;
  score: number;
  status?: 'matched' | 'missing' | 'substituted' | 'uncertain';
}

export interface ValseaVoiceGradeWord {
  characters: ValseaVoiceGradeCharacter[];
  expected: string;
  heard: string;
  level: ValseaVoiceGradeLevel;
  nativeScore: number;
  score: number;
}

export interface ValseaVoiceGradeResult {
  assessorModel?: string;
  heardText: string;
  nativeSimilarity: number;
  overallScore: number;
  provider: 'local-model' | 'valsea-heuristic';
  raw?: unknown;
  referenceCoverage?: number;
  referenceText: string;
  status: ValseaVoiceGradeStatus;
  summary: string;
  words: ValseaVoiceGradeWord[];
}

export interface ValseaSentimentEvidenceSpan {
  end?: number;
  label: string;
  quote: string;
  start?: number;
}

export interface ValseaSentimentLayer {
  arousal?: number;
  confusion?: number;
  confidence?: number;
  emotions?: string[];
  engagement?: number;
  evidenceSpans?: ValseaSentimentEvidenceSpan[];
  intent?: string;
  parentSafeSummary?: string;
  politeness?: number;
  provider: 'mira' | 'valsea';
  raw?: unknown;
  risk?: string;
  sentiment?: string;
  teacherMove?: string;
  urgency?: number;
  valence?: number;
}

export interface ValseaObservabilityStage {
  durationMs?: number;
  id: string;
  inputSummary?: string;
  label: string;
  model?: string;
  outputSummary?: string;
  provider: string;
  raw?: unknown;
  status: 'error' | 'skipped' | 'success';
}

export interface ValseaClassroomArtifactResponse {
  annotations: {
    accentCorrections: unknown[];
    annotatedText?: string;
    raw: unknown;
    semanticTags: ValseaClassroomSemanticTag[];
  };
  artifact: {
    output: string;
    outputType: ValseaClassroomOutputType;
    raw: unknown;
  };
  clarification: {
    explanations: unknown[];
    raw: unknown;
    text: string;
  };
  sentiment: {
    confidence?: number;
    consensus?: string;
    emotions: string[];
    layers?: {
      mira?: ValseaSentimentLayer;
      valsea?: ValseaSentimentLayer;
    };
    raw: unknown;
    reasoning?: string;
    sentiment?: string;
  };
  observability?: {
    stages: ValseaObservabilityStage[];
  };
  source: {
    audioStoragePath?: string;
    detectedLanguages: unknown[];
    rawTranscript: string;
    referenceTranscript?: string;
    spokenTranscript?: string;
    transcript: string;
  };
  pronunciation: ValseaVoiceGradeResult | null;
  translation: {
    raw: unknown;
    sourceLanguage?: string;
    targetLanguage: string;
    text: string;
  };
}

export interface ValseaClassroomConfigResponse {
  hasServerKey: boolean;
  pronunciationDefaultModel: ValseaPronunciationAssessorModel;
  pronunciationModels: ValseaPronunciationAssessorModel[];
}

export interface ValseaClassroomKeyValidationResponse {
  ok: boolean;
}

export interface ValseaClassroomAudioUploadResult {
  contentType: string;
  fileName: string;
  fileSize: number;
  fullPath: string | null;
  path: string;
}

export interface ValseaClassroomSpeechPayload {
  language: string;
  pace?: number;
  speakerId?: number;
  text: string;
  voiceId: string;
}

export interface ValseaClassroomSpeechResponse {
  audioFileName: string;
  audioStoragePath: string;
  contentType: string;
  engine: 'piper';
  fileSize: number;
  previewDataUrl: string;
  trace: {
    durationMs?: number;
    engine: 'piper';
    endpoint?: string;
    model?: string;
    provider: 'local-model';
    voiceId: string;
  };
  voiceId: string;
}

interface ValseaClassroomAudioUploadUrlResponse {
  fullPath?: string;
  headers?: Record<string, string>;
  path?: string;
  signedUrl?: string;
  token?: string;
}

export async function createWorkspaceCourse(
  workspaceId: string,
  payload: UpsertWorkspaceCoursePayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ id: string; message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/courses`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function listWorkspaceCourses(
  workspaceId: string,
  params: ListWorkspaceCoursesParams = {},
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<ListWorkspaceCoursesResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/courses`,
    {
      cache: 'no-store',
      query: {
        page: params.page,
        pageSize: params.pageSize,
        q: params.q,
        status: params.status,
      },
    }
  );
}

export async function getValseaClassroomConfig(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<ValseaClassroomConfigResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/education/valsea`,
    { cache: 'no-store' }
  );
}

export async function generateValseaClassroomScenario(
  workspaceId: string,
  payload: ValseaClassroomScenarioPayload = {},
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<ValseaClassroomScenarioResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/education/valsea/scenario`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

export interface GenerateQuizOptionExplanationPayload {
  question: string;
  option: unknown;
}

export interface GenerateQuizOptionExplanationResponse {
  explanation?: string;
}

/**
 * Generate an AI explanation for a single quiz option via
 * `POST /api/ai/objects/quizzes/explanation` (note: not under `/api/v1`; the
 * workspace id travels in the body as `wsId`). Forwards the caller's auth.
 */
export async function generateWorkspaceQuizOptionExplanation(
  workspaceId: string,
  payload: GenerateQuizOptionExplanationPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<GenerateQuizOptionExplanationResponse>(
    '/api/ai/objects/quizzes/explanation',
    {
      body: JSON.stringify({ wsId: workspaceId, ...payload }),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

export async function synthesizeValseaClassroomSpeech(
  workspaceId: string,
  payload: ValseaClassroomSpeechPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<ValseaClassroomSpeechResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/education/valsea/speech`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

export async function validateValseaClassroomApiKey(
  workspaceId: string,
  apiKey: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<ValseaClassroomKeyValidationResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/education/valsea/validate-key`,
    {
      cache: 'no-store',
      headers: { 'X-Valsea-Api-Key': apiKey },
      method: 'POST',
    }
  );
}

export async function uploadValseaClassroomAudioToDrive(
  workspaceId: string,
  file: File,
  options?: {
    onUploadProgress?: (progress: {
      loaded: number;
      percent: number;
      total: number;
    }) => void;
  },
  clientOptions?: InternalApiClientOptions
): Promise<ValseaClassroomAudioUploadResult> {
  const client = getInternalApiClient(clientOptions);
  const fetchImpl = clientOptions?.fetch ?? globalThis.fetch;
  const uploadPayload =
    await client.json<ValseaClassroomAudioUploadUrlResponse>(
      `/api/v1/workspaces/${encodePathSegment(workspaceId)}/education/valsea/audio/upload-url`,
      {
        body: JSON.stringify({
          contentType: file.type || 'application/octet-stream',
          filename: file.name,
          size: file.size,
        }),
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      }
    );

  if (!uploadPayload.signedUrl || !uploadPayload.path) {
    throw new Error('Missing Valsea audio upload URL payload');
  }

  const headers: Record<string, string> = {
    ...(uploadPayload.headers ?? {}),
  };
  if (!headers['Content-Type']) {
    headers['Content-Type'] = file.type || 'application/octet-stream';
  }
  if (uploadPayload.token) {
    headers.Authorization = `Bearer ${uploadPayload.token}`;
  }

  const uploadWithHeaders = async (requestHeaders: HeadersInit) =>
    fetchImpl(uploadPayload.signedUrl as string, {
      body: file,
      cache: 'no-store',
      headers: requestHeaders,
      method: 'PUT',
    });

  let uploadResponse = await uploadWithHeaders(headers);
  if (!uploadResponse.ok) {
    const fallbackHeaders = { ...headers };
    delete fallbackHeaders['Content-Type'];
    uploadResponse = await uploadWithHeaders(fallbackHeaders);
  }

  if (!uploadResponse.ok) {
    const message = await uploadResponse.text().catch(() => '');
    throw new Error(
      `Failed to upload classroom audio (${uploadResponse.status})${message ? `: ${message}` : ''}`
    );
  }

  options?.onUploadProgress?.({
    loaded: file.size,
    percent: 100,
    total: file.size,
  });

  return {
    contentType: file.type || 'application/octet-stream',
    fileName: file.name,
    fileSize: file.size,
    fullPath: uploadPayload.fullPath ?? null,
    path: uploadPayload.path,
  };
}

export async function generateValseaClassroomArtifact(
  workspaceId: string,
  payload: ValseaClassroomPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const path = `/api/v1/workspaces/${encodePathSegment(workspaceId)}/education/valsea`;
  const byokHeaders = payload.apiKey
    ? { 'X-Valsea-Api-Key': payload.apiKey }
    : undefined;

  if (payload.file) {
    const formData = new FormData();
    formData.set('file', payload.file);
    formData.set('language', payload.language);
    formData.set('outputType', payload.outputType);
    formData.set('targetLanguage', payload.targetLanguage);
    if (payload.pronunciationModel) {
      formData.set('pronunciationModel', payload.pronunciationModel);
    }
    if (payload.transcript) {
      formData.set('transcript', payload.transcript);
    }

    return client.json<ValseaClassroomArtifactResponse>(path, {
      body: formData,
      cache: 'no-store',
      headers: byokHeaders,
      method: 'POST',
    });
  }

  return client.json<ValseaClassroomArtifactResponse>(path, {
    body: JSON.stringify({
      audioFileName: payload.audioFileName,
      audioStoragePath: payload.audioStoragePath,
      language: payload.language,
      outputType: payload.outputType,
      pronunciationModel: payload.pronunciationModel,
      targetLanguage: payload.targetLanguage,
      transcript: payload.transcript,
    }),
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...byokHeaders,
    },
    method: 'POST',
  });
}

export async function updateWorkspaceCourse(
  workspaceId: string,
  courseId: string,
  payload: Partial<UpsertWorkspaceCoursePayload>,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/courses/${encodePathSegment(courseId)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export function archiveWorkspaceCourse(
  workspaceId: string,
  courseId: string,
  options?: InternalApiClientOptions
) {
  return updateWorkspaceCourse(
    workspaceId,
    courseId,
    { archived: true, is_course_published: false },
    options
  );
}

export function publishWorkspaceCourse(
  workspaceId: string,
  courseId: string,
  isPublished: boolean,
  options?: InternalApiClientOptions
) {
  return updateWorkspaceCourse(
    workspaceId,
    courseId,
    { is_course_published: isPublished },
    options
  );
}

export async function deleteWorkspaceCourse(
  workspaceId: string,
  courseId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/courses/${encodePathSegment(courseId)}`,
    {
      method: 'DELETE',
      cache: 'no-store',
    }
  );
}

export async function createWorkspaceCourseModule(
  workspaceId: string,
  groupId: string,
  payload: UpsertWorkspaceCourseModulePayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceCourseModule>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/user-groups/${encodePathSegment(groupId)}/modules`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function updateWorkspaceCourseModule(
  workspaceId: string,
  moduleId: string,
  payload: Record<string, unknown>,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/course-modules/${encodePathSegment(moduleId)}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

/**
 * @deprecated Prefer {@link reorderWorkspaceCourseModulesInModuleGroup} for
 * per-group reorder, or {@link reorderWorkspaceCourseModuleGroups} for group-level
 * reorder. This legacy wrapper calls the upgraded `reorder_workspace_course_modules`
 * RPC which preserves sort_key within each module_group.
 */
export async function reorderWorkspaceCourseModules(
  workspaceId: string,
  groupId: string,
  moduleIds: string[],
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/user-groups/${encodePathSegment(groupId)}/module-order`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moduleIds }),
      cache: 'no-store',
    }
  );
}

export async function deleteWorkspaceCourseModule(
  workspaceId: string,
  moduleId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/course-modules/${encodePathSegment(moduleId)}`,
    {
      method: 'DELETE',
      cache: 'no-store',
    }
  );
}

export async function listWorkspaceCourseModuleGroups(
  workspaceId: string,
  groupId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceCourseModuleGroup[]>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/user-groups/${encodePathSegment(groupId)}/module-groups`,
    { cache: 'no-store' }
  );
}

export async function createWorkspaceCourseModuleGroup(
  workspaceId: string,
  groupId: string,
  payload: UpsertWorkspaceCourseModuleGroupPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceCourseModuleGroup>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/user-groups/${encodePathSegment(groupId)}/module-groups`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function updateWorkspaceCourseModuleGroup(
  workspaceId: string,
  groupId: string,
  moduleGroupId: string,
  payload: Partial<UpsertWorkspaceCourseModuleGroupPayload>,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/user-groups/${encodePathSegment(groupId)}/module-groups/${encodePathSegment(moduleGroupId)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function deleteWorkspaceCourseModuleGroup(
  workspaceId: string,
  groupId: string,
  moduleGroupId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/user-groups/${encodePathSegment(groupId)}/module-groups/${encodePathSegment(moduleGroupId)}`,
    {
      method: 'DELETE',
      cache: 'no-store',
    }
  );
}

export async function reorderWorkspaceCourseModuleGroups(
  workspaceId: string,
  groupId: string,
  moduleGroupIds: string[],
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/user-groups/${encodePathSegment(groupId)}/module-groups/order`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moduleGroupIds }),
      cache: 'no-store',
    }
  );
}

export async function reorderWorkspaceCourseModulesInModuleGroup(
  workspaceId: string,
  groupId: string,
  moduleGroupId: string,
  moduleIds: string[],
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/user-groups/${encodePathSegment(groupId)}/module-groups/${encodePathSegment(moduleGroupId)}/module-order`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moduleIds }),
      cache: 'no-store',
    }
  );
}

export async function linkQuizSetModules(
  workspaceId: string,
  setId: string,
  moduleIds: string[],
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/quiz-sets/${encodePathSegment(setId)}/modules`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ moduleIds }),
      cache: 'no-store',
    }
  );
}

export async function unlinkQuizSetModule(
  workspaceId: string,
  setId: string,
  moduleId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/quiz-sets/${encodePathSegment(setId)}/modules/${encodePathSegment(moduleId)}`,
    {
      method: 'DELETE',
      cache: 'no-store',
    }
  );
}

export async function createWorkspaceQuiz(
  workspaceId: string,
  payload: CreateWorkspaceQuizPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/quizzes`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function updateWorkspaceQuiz(
  workspaceId: string,
  quizId: string,
  payload: Partial<UpsertWorkspaceQuizPayload>,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/quizzes/${encodePathSegment(quizId)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function deleteWorkspaceQuiz(
  workspaceId: string,
  quizId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/quizzes/${encodePathSegment(quizId)}`,
    {
      method: 'DELETE',
      cache: 'no-store',
    }
  );
}

export interface ListWorkspaceQuizzesParams {
  page?: number;
  pageSize?: number;
  q?: string;
  moduleId?: string;
}

export interface ListWorkspaceQuizzesResponse {
  data: Array<{
    id: string;
    question: string;
    type?: string;
    content?: Json;
    answer?: Json;
    created_at?: string;
    quiz_options?: Array<{
      id: string;
      value: string;
      is_correct: boolean;
      explanation?: string | null;
    }>;
  }>;
  count: number;
  page: number;
  pageSize: number;
}

export async function getWorkspaceQuizzes(
  workspaceId: string,
  params?: ListWorkspaceQuizzesParams,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', params.page.toString());
  if (params?.pageSize)
    searchParams.set('pageSize', params.pageSize.toString());
  if (params?.q) searchParams.set('q', params.q);
  if (params?.moduleId) searchParams.set('moduleId', params.moduleId);

  const query = searchParams.toString();
  return client.json<ListWorkspaceQuizzesResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/quizzes${
      query ? `?${query}` : ''
    }`,
    {
      method: 'GET',
      cache: 'no-store',
    }
  );
}

export interface ListWorkspaceFlashcardsParams {
  page?: number;
  pageSize?: number;
  q?: string;
}

export interface ListWorkspaceFlashcardsResponse {
  data: Array<{
    id: string;
    front: string;
    back: string;
    created_at?: string;
  }>;
  count: number;
  page: number;
  pageSize: number;
}

/**
 * Paginated read of a workspace's flashcard library via
 * `GET /api/v1/workspaces/:wsId/flashcards`. Forwards the caller's auth.
 */
export async function getWorkspaceFlashcards(
  workspaceId: string,
  params?: ListWorkspaceFlashcardsParams,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', params.page.toString());
  if (params?.pageSize)
    searchParams.set('pageSize', params.pageSize.toString());
  if (params?.q) searchParams.set('q', params.q);

  const query = searchParams.toString();
  return client.json<ListWorkspaceFlashcardsResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/flashcards${
      query ? `?${query}` : ''
    }`,
    {
      method: 'GET',
      cache: 'no-store',
    }
  );
}

export interface ListCourseModuleQuizSetsParams {
  page?: number;
  pageSize?: number;
  q?: string;
}

export interface ListCourseModuleQuizSetsResponse {
  data: Array<{
    id: string;
    name: string;
    created_at?: string;
  }>;
  count: number;
  page: number;
  pageSize: number;
}

/**
 * Paginated read of the quiz sets linked to a single course module via
 * `GET /api/v1/workspaces/:wsId/course-modules/:moduleId/quiz-sets`.
 */
export async function getCourseModuleQuizSets(
  workspaceId: string,
  moduleId: string,
  params?: ListCourseModuleQuizSetsParams,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', params.page.toString());
  if (params?.pageSize)
    searchParams.set('pageSize', params.pageSize.toString());
  if (params?.q) searchParams.set('q', params.q);

  const query = searchParams.toString();
  return client.json<ListCourseModuleQuizSetsResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/course-modules/${encodePathSegment(moduleId)}/quiz-sets${
      query ? `?${query}` : ''
    }`,
    {
      method: 'GET',
      cache: 'no-store',
    }
  );
}

export interface ListWorkspaceQuizSetsParams {
  page?: number;
  pageSize?: number;
  q?: string;
}

export interface ListWorkspaceQuizSetsResponse {
  data: Array<{
    id: string;
    name: string;
    created_at?: string;
    course_module_quiz_sets?: Array<{ module_id: string }>;
  }>;
  count: number;
  page: number;
  pageSize: number;
}

/**
 * Paginated read of a workspace's quiz-set library via
 * `GET /api/v1/workspaces/:wsId/quiz-sets`. Forwards the caller's auth.
 */
export async function getWorkspaceQuizSets(
  workspaceId: string,
  params?: ListWorkspaceQuizSetsParams,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', params.page.toString());
  if (params?.pageSize)
    searchParams.set('pageSize', params.pageSize.toString());
  if (params?.q) searchParams.set('q', params.q);

  const query = searchParams.toString();
  return client.json<ListWorkspaceQuizSetsResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/quiz-sets${
      query ? `?${query}` : ''
    }`,
    {
      method: 'GET',
      cache: 'no-store',
    }
  );
}

export async function createWorkspaceQuizSet(
  workspaceId: string,
  payload: UpsertWorkspaceQuizSetPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/quiz-sets`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function updateWorkspaceQuizSet(
  workspaceId: string,
  setId: string,
  payload: Partial<UpsertWorkspaceQuizSetPayload>,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/quiz-sets/${encodePathSegment(setId)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function deleteWorkspaceQuizSet(
  workspaceId: string,
  setId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/quiz-sets/${encodePathSegment(setId)}`,
    {
      method: 'DELETE',
      cache: 'no-store',
    }
  );
}

export async function createWorkspaceFlashcard(
  workspaceId: string,
  payload: UpsertWorkspaceFlashcardPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/flashcards`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function updateWorkspaceFlashcard(
  workspaceId: string,
  flashcardId: string,
  payload: Partial<UpsertWorkspaceFlashcardPayload>,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/flashcards/${encodePathSegment(flashcardId)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function deleteWorkspaceFlashcard(
  workspaceId: string,
  flashcardId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/flashcards/${encodePathSegment(flashcardId)}`,
    {
      method: 'DELETE',
      cache: 'no-store',
    }
  );
}

export async function listWorkspaceEducationAttempts(
  workspaceId: string,
  query: WorkspaceEducationAttemptListQuery = {},
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const search = new URLSearchParams();

  if (query.page) search.set('page', `${query.page}`);
  if (query.pageSize) search.set('pageSize', `${query.pageSize}`);
  if (query.setId) search.set('setId', query.setId);
  if (query.learnerId) search.set('learnerId', query.learnerId);
  if (query.status) search.set('status', query.status);
  if (query.dateFrom) search.set('dateFrom', query.dateFrom);
  if (query.dateTo) search.set('dateTo', query.dateTo);
  if (query.sortBy) search.set('sortBy', query.sortBy);
  if (query.sortDirection) search.set('sortDirection', query.sortDirection);

  const suffix = search.size > 0 ? `?${search.toString()}` : '';
  return client.json<{
    attempts: Array<Record<string, unknown>>;
    count: number;
    page: number;
    pageSize: number;
  }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/education/attempts${suffix}`,
    { cache: 'no-store' }
  );
}

export async function getWorkspaceEducationAttemptDetail(
  workspaceId: string,
  attemptId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{
    attempt: Record<string, unknown>;
    learner: Record<string, unknown> | null;
    answers: Array<Record<string, unknown>>;
  }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/education/attempts/${encodePathSegment(attemptId)}`,
    {
      cache: 'no-store',
    }
  );
}

export async function deleteWorkspaceStorageObject(
  workspaceId: string,
  path: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ success: true }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/storage/object`,
    {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path }),
      cache: 'no-store',
    }
  );
}
