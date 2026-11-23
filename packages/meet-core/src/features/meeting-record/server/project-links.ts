import 'server-only';
import { z } from 'zod';
import {
  type MeetingRecordAccess,
  MeetingRecordError,
  type MeetingRecordParams,
  meetingRecordAccess,
} from './access';

export type MeetingProject = {
  id: string;
  name: string;
  status: string | null;
  ticketKey: string | null;
};

export type MeetingProjectLinks = {
  linked: MeetingProject[];
  /** Projects the caller may link; empty when they cannot link. */
  available: MeetingProject[];
  canLink: boolean;
};

const linkBodySchema = z.object({ projectId: z.uuid() });

type ProjectRow = {
  id: string;
  name: string;
  status: string | null;
  ticket_key: string | null;
};

const toProject = (row: ProjectRow): MeetingProject => ({
  id: row.id,
  name: row.name,
  status: row.status,
  ticketKey: row.ticket_key,
});

export async function listLinkedProjects(
  access: Pick<MeetingRecordAccess, 'db' | 'wsId' | 'meeting'>
) {
  const links = await access.db
    .schema('private')
    .from('task_project_links')
    .select('project_id')
    .eq('ws_id', access.wsId)
    .eq('entity_kind', 'meeting')
    .eq('entity_id', access.meeting.id)
    .order('created_at', { ascending: true })
    .limit(100);
  if (links.error)
    throw new MeetingRecordError(500, 'Project links unavailable');
  const ids = (links.data ?? []).map(
    (link: { project_id: string }) => link.project_id
  );
  if (!ids.length) return [];
  // Links live in private; projects are read separately in their workspace.
  const projects = await access.db
    .from('task_projects')
    .select('id, name, status, ticket_key')
    .eq('ws_id', access.wsId)
    .in('id', ids)
    .not('archived', 'is', true)
    .not('deleted', 'is', true);
  if (projects.error) throw new MeetingRecordError(500, 'Projects unavailable');
  const byId = new Map(
    (projects.data ?? []).map((project: ProjectRow) => [project.id, project])
  );
  return ids.flatMap((id: string) => {
    const project = byId.get(id);
    return project ? [toProject(project)] : [];
  });
}

export async function readMeetingProjects(
  request: Request,
  params: MeetingRecordParams
): Promise<MeetingProjectLinks> {
  const access = await meetingRecordAccess(request, params);
  const linked = await listLinkedProjects(access);
  if (!access.canLinkProjects) return { linked, available: [], canLink: false };
  const { data, error } = await access.db
    .from('task_projects')
    .select('id, name, status, ticket_key')
    .eq('ws_id', access.wsId)
    .not('archived', 'is', true)
    .not('deleted', 'is', true)
    .order('name', { ascending: true })
    .limit(500);
  if (error) throw new MeetingRecordError(500, 'Projects unavailable');
  return {
    linked,
    available: (data ?? []).map(toProject),
    canLink: true,
  };
}

async function readLinkBody(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new MeetingRecordError(400, 'Invalid request body');
  }
  const parsed = linkBodySchema.safeParse(body);
  if (!parsed.success) throw new MeetingRecordError(400, 'Invalid project');
  return parsed.data.projectId;
}

async function mutationAccess(request: Request, params: MeetingRecordParams) {
  const access = await meetingRecordAccess(request, params, true);
  if (!access.canLinkProjects)
    throw new MeetingRecordError(
      403,
      'Linking a project needs project management and meeting edit rights'
    );
  return access;
}

export async function linkMeetingProject(
  request: Request,
  params: MeetingRecordParams
) {
  const access = await mutationAccess(request, params);
  const projectId = await readLinkBody(request);
  const { data: project, error: projectError } = await access.db
    .from('task_projects')
    .select('id')
    .eq('id', projectId)
    .eq('ws_id', access.wsId)
    .not('archived', 'is', true)
    .not('deleted', 'is', true)
    .maybeSingle();
  if (projectError) throw new MeetingRecordError(500, 'Project lookup failed');
  if (!project) throw new MeetingRecordError(404, 'Project not found');
  const { error } = await access.db
    .schema('private')
    .from('task_project_links')
    .insert({
      project_id: projectId,
      ws_id: access.wsId,
      entity_kind: 'meeting',
      entity_id: access.meeting.id,
      created_by: access.user.id,
    });
  // A repeated link is already in the requested state. A meeting deleted
  // since the access check fails the workspace check.
  if (error?.code === '23503')
    throw new MeetingRecordError(404, 'Meeting not found');
  if (error && error.code !== '23505')
    throw new MeetingRecordError(500, 'Project link failed');
  return { linked: await listLinkedProjects(access) };
}

export async function unlinkMeetingProject(
  request: Request,
  params: MeetingRecordParams
) {
  const access = await mutationAccess(request, params);
  const projectId = await readLinkBody(request);
  const { error } = await access.db
    .schema('private')
    .from('task_project_links')
    .delete()
    .eq('project_id', projectId)
    .eq('ws_id', access.wsId)
    .eq('entity_kind', 'meeting')
    .eq('entity_id', access.meeting.id);
  if (error) throw new MeetingRecordError(500, 'Project unlink failed');
  return { linked: await listLinkedProjects(access) };
}
