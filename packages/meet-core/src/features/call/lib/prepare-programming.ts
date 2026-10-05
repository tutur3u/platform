import {
  createMeetPlayground,
  getMeetProgramming,
  selectMeetProgramming,
} from '@tuturuuu/internal-api/meet-call';
export const prepareProgrammingApi = {
  read: getMeetProgramming,
  create: createMeetPlayground,
  select: selectMeetProgramming,
};
/** An explicit host action starts one blank project; an existing room resource is reused. */
export async function prepareMeetingProgramming(
  meetingId: string,
  name: string,
  api = prepareProgrammingApi,
  isCurrent: () => boolean = () => true
) {
  if ((await api.read(meetingId)).selection) return;
  if (!isCurrent()) throw new Error('programming_actor_changed');
  const project = await api.create(meetingId, {
    name,
    language: 'python',
    empty: true,
  });
  if (!isCurrent()) throw new Error('programming_actor_changed');
  await api.select(meetingId, {
    kind: 'playground',
    id: project.id,
    language: 'python',
  });
}
