import { Squares2X2Icon } from '@heroicons/react/24/solid';
import { MultiSelect } from '@mantine/core';
import { useWorkspaces } from '@/hooks/useWorkspaces';

interface Props {
  teamIds: string[];
  setTeamIds: (teamIds: string[]) => void;
  className?: string;
}

const TeamMultiSelector = ({ teamIds, setTeamIds, className }: Props) => {
  const { teams } = useWorkspaces();

  const data = [
    {
      label: 'Tất cả',
      value: '',
      group: 'Chung',
    },
    ...(teams?.map((team) => ({
      label: team.name,
      value: team.id,
      group: 'Nhóm thành viên',
    })) || []),
  ];

  const handleIdsChange = (ids: string[]) => {
    if (ids.length === 0) return setTeamIds(['']);

    // Only allow either all, or multiple teams to be selected
    if (ids[0] === '') {
      if (ids.length === 1) {
        // "All" is selected, so clear all other selections
        setTeamIds(ids);
        return;
      }

      // "All" is not selected, so remove it from the list
      setTeamIds(ids.filter((id) => id !== ''));
    } else if (ids.length > 1 && ids.includes('')) {
      // Since "All" is selected, remove all other selections
      setTeamIds(['']);
    } else {
      setTeamIds(ids);
    }
  };

  return (
    <MultiSelect
      label="Nhóm thành viên"
      placeholder="Chọn nhóm thành viên"
      icon={<Squares2X2Icon className="h-5" />}
      data={data}
      value={teamIds}
      onChange={handleIdsChange}
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
      disabled={!teams}
      searchable
    />
  );
};

export default TeamMultiSelector;
