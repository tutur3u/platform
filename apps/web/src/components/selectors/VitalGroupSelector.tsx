import { Select } from '@mantine/core';
import { VitalGroup } from '../../types/primitives/VitalGroup';
import useSWR from 'swr';
import { useEffect } from 'react';
import { useWorkspaces } from '../../hooks/useWorkspaces';

interface Props {
  groupId: string;
  setGroupId: (groupId: string) => void;

  blacklist?: string[];

  className?: string;
  required?: boolean;
}

const VitalGroupSelector = ({
  groupId,
  setGroupId,

  blacklist = [],

  className,
  required = false,
}: Props) => {
  const { ws } = useWorkspaces();

  const apiPath = `/api/workspaces/${ws?.id}/healthcare/vital-groups`;
  const { data: vitals } = useSWR<VitalGroup[]>(ws?.id ? apiPath : null);

  const data = [
    ...(vitals?.map((vital) => ({
      label: vital.name,
      value: vital.id,
      disabled: blacklist.includes(vital.id),
    })) || []),
  ];

  useEffect(() => {
    if (!groupId && vitals?.length === 1) setGroupId(vitals[0].id);
  }, [groupId, vitals, setGroupId]);

  return (
    <Select
      label="Nhóm chỉ số"
      placeholder="Chọn nhóm chỉ số"
      data={data}
      value={groupId}
      onChange={setGroupId}
      className={className}
      classNames={{
        input:
          'bg-[#3f3a3a]/30 border-zinc-300/20 focus:border-zinc-300/20 border-zinc-300/20 font-semibold',
        dropdown: 'bg-[#323030]',
      }}
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
      disabled={!vitals}
      searchable
      required={required}
    />
  );
};

export default VitalGroupSelector;
