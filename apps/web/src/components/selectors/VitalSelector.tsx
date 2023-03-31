import { Select } from '@mantine/core';
import { Vital } from '../../types/primitives/Vital';
import useSWR from 'swr';
import { useEffect } from 'react';
import { useWorkspaces } from '../../hooks/useWorkspaces';

interface Props {
  vital: Vital;
  setVital: (vital: Vital | null) => void;

  blacklist?: string[];

  softDisabled?: boolean;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}

const VitalSelector = ({
  vital,
  setVital,

  blacklist = [],

  className,

  disabled = false,
  required = false,
}: Props) => {
  const { ws } = useWorkspaces();

  const apiPath = `/api/workspaces/${
    ws?.id
  }/healthcare/vitals?blacklist=${blacklist
    .filter((id) => id !== vital?.id && id !== '')
    .join(',')}`;

  const { data: vitals } = useSWR<Vital[]>(ws?.id ? apiPath : null);

  const data = [
    ...(vitals?.map((vital) => ({
      label: vital.name,
      value: vital.id,
      disabled: blacklist.includes(vital.id),
    })) || []),
  ];

  useEffect(() => {
    if (!vitals || !setVital) return;

    if (vitals.length === 1 && !vital?.id) setVital(vitals[0]);
    else if (vital?.id && !vitals?.find((p) => p.id === vital.id))
      setVital(null);
  }, [vital, vitals, setVital]);

  return (
    <Select
      label="Chỉ số"
      placeholder="Chọn chỉ số"
      data={data}
      value={vital?.id}
      onChange={(id) => setVital(vitals?.find((v) => v.id === id) || null)}
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
      disabled={!vitals || disabled}
      required={required}
      searchable
    />
  );
};

export default VitalSelector;
