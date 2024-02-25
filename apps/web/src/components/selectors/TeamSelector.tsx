import { Squares2X2Icon } from '@heroicons/react/24/solid';
import { Select } from '@mantine/core';
import useSWR from 'swr';
import { Team } from '@/types/primitives/Team';
import { useEffect } from 'react';
import { useWorkspaces } from '@/hooks/useWorkspaces';

interface Props {
  teamId: string;
  setTeamId: (teamId: string) => void;
  className?: string;

  required?: boolean;
  disabled?: boolean;
}

const TeamSelector = ({
  teamId,
  setTeamId,
  className,
  required = false,
  disabled = false,
}: Props) => {
  const { ws } = useWorkspaces();

  const apiPath = `/api/workspaces/${ws?.id}/teams`;
  const { data: teams } = useSWR<Team[]>(ws?.id ? apiPath : null);

  const data = [
    ...(teams?.map((team) => ({
      label: team.name,
      value: team.id,
    })) || []),
  ];

  useEffect(() => {
    if (!teams) return;

    if (teams.length === 1) setTeamId(teams[0].id);
    else if (teamId && !teams?.find((p) => p.id === teamId)) setTeamId('');
  }, [teamId, teams, setTeamId]);

  return (
    <Select
      label="Nhóm thành viên"
      placeholder="Chọn nhóm thành viên"
      icon={<Squares2X2Icon className="h-5" />}
      data={data}
      value={teamId}
      onChange={setTeamId}
      className={className}
      styles={{
        item: {
          // applies styles to selected item
          '&[data-selected]': {
            '&, &:hover': {
              backgroundColor: '#6b686b',
              color: '#fff',
              fontWeight: 600,
            },
          },

          // applies styles to hovered item
          '&:hover': {
            backgroundColor: '#454345',
            color: '#fff',
          },
        },
      }}
      disabled={!teams || disabled}
      searchable
      required={required}
    />
  );
};

export default TeamSelector;
