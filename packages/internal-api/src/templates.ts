import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

export interface InternalApiTemplateTask {
  name: string;
  description: string | null;
  priority: 'low' | 'normal' | 'high' | 'critical' | null;
  completed: boolean;
  start_date?: string | null;
  end_date?: string | null;
}

export interface InternalApiTemplateList {
  name: string;
  status: string;
  tasks: InternalApiTemplateTask[];
}

export interface InternalApiTemplateContent {
  lists?: InternalApiTemplateList[];
  labels?: Array<{ name: string; color: string }>;
  settings?: {
    estimation_type?: string | null;
    allow_zero_estimates?: boolean | null;
    extended_estimation?: boolean | null;
  };
}

export interface InternalApiWorkspaceTemplate {
  id: string;
  wsId: string;
  createdBy: string | null;
  sourceBoardId: string | null;
  name: string;
  description: string | null;
  visibility: 'private' | 'workspace' | 'public';
  content: InternalApiTemplateContent;
  createdAt: string;
  updatedAt: string;
  isOwner: boolean;
  stats: {
    lists: number;
    tasks: number;
    labels: number;
  };
  backgroundPath?: string | null;
}

interface TemplateBackgroundUrlResponse {
  signedUrl: string | null;
}

export async function getWorkspaceTemplate(
  workspaceId: string,
  templateId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const payload = await client.json<{ template: InternalApiWorkspaceTemplate }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/templates/${encodePathSegment(templateId)}`,
    {
      cache: 'no-store',
    }
  );

  return payload.template;
}

export async function getWorkspaceTemplateBackgroundUrl(
  workspaceId: string,
  templateId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const payload = await client.json<TemplateBackgroundUrlResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/templates/${encodePathSegment(templateId)}/background-url`,
    {
      cache: 'no-store',
    }
  );

  return payload.signedUrl ?? null;
}
