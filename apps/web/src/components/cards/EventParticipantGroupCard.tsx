import EventParticipantCard from './EventParticipantCard';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { EventParticipant } from '@/types/primitives/EventParticipant';
import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import { Accordion, Button, Divider, Loader } from '@mantine/core';
import useTranslation from 'next-translate/useTranslation';
import { useState } from 'react';
import useSWR, { mutate } from 'swr';

interface Props {
  wsId: string;
  participant: EventParticipant;
  className?: string;
  mutatePaths?: string[] | null;
  selected?: boolean;
}

const EventParticipantGroupCard = ({
  wsId,
  participant,
  className,
  mutatePaths,
  selected = false,
}: Props) => {
  const { ws } = useWorkspaces();
  const { t } = useTranslation('calendar-event-configs');

  const [loading, setLoading] = useState(false);

  const apiPath =
    selected && wsId && participant
      ? `/api/workspaces/${wsId}/calendar/events/${participant.event_id}/participants/${participant.participant_id}?type=${participant.type}`
      : null;

  const countApiPath =
    wsId && participant
      ? `/api/workspaces/${wsId}/users/groups/${participant.participant_id}/amount`
      : null;

  const deleteParticipant = async () => {
    if (!apiPath || !mutatePaths) return;

    setLoading(true);

    const res = await fetch(apiPath, {
      method: 'DELETE',
    });

    // wait for 200ms to prevent flickering
    await new Promise((resolve) => setTimeout(resolve, 200));
    if (mutatePaths && res.ok) mutatePaths.forEach((path) => mutate(path));
    else setLoading(false);
  };

  const usersApiPath =
    selected && ws?.id
      ? `/api/workspaces/${ws?.id}/users?page=${1}&itemsPerPage=${10}&groupId=${participant.participant_id}`
      : null;

  const { data, error } = useSWR<{ data: WorkspaceUser[]; count: number }>(
    usersApiPath
  );

  const { data: countData } = useSWR<{ count: number }>(countApiPath);

  const isLoading = !data && !error;

  const users = data?.data;

  return (
    <Accordion.Item value={participant.participant_id}>
      <Accordion.Control>
        <div className="flex items-center justify-between gap-2">
          <div className="line-clamp-1 font-semibold">
            {participant.display_name || participant.handle} (
            {countData?.count ?? 0})
          </div>
        </div>
      </Accordion.Control>
      <Accordion.Panel>
        {isLoading ? (
          <div className="mt-2 flex justify-center">
            <Loader color="gray" />
          </div>
        ) : (
          <div className="mt-2 grid gap-2">
            {(users?.length || 0) > 0 ? (
              users?.map((u) => (
                <EventParticipantCard
                  key={`${participant.event_id}-${participant.participant_id}-${u.id}-virtual_user`}
                  wsId={wsId as string}
                  participant={{
                    event_id: participant.event_id,
                    participant_id: u.id,
                    display_name: u?.display_name ?? u?.name,
                    handle: u.email,
                    type: 'virtual_user',
                  }}
                  className={className}
                  mutatePaths={
                    usersApiPath ? [...(mutatePaths || []), usersApiPath] : null
                  }
                />
              ))
            ) : (
              <div className="text-gray-500 dark:text-gray-400">
                {t('no-users-in-current-group')}
              </div>
            )}

            <Divider variant="dashed" />

            <Button
              color="red"
              className="w-full bg-red-500/10 text-red-600 hover:bg-red-500/20 dark:bg-red-300/10 dark:text-red-300 dark:hover:bg-red-300/20"
              loading={loading}
              disabled={loading}
              onClick={deleteParticipant}
            >
              {t('remove-group-from-event')}
            </Button>
          </div>
        )}
      </Accordion.Panel>
    </Accordion.Item>
  );
};

export default EventParticipantGroupCard;
