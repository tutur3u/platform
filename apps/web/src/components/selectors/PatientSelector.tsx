import { Select } from '@mantine/core';
import { WorkspaceUser } from '../../types/primitives/WorkspaceUser';
import useSWR from 'swr';
import { useEffect } from 'react';
import { useWorkspaces } from '../../hooks/useWorkspaces';

interface Props {
  patientId: string;
  setPatientId: (patientId: string) => void;

  className?: string;
  notEmpty?: boolean;
  required?: boolean;
}

const PatientSelector = ({
  patientId,
  setPatientId,

  className,
  notEmpty = false,
  required = false,
}: Props) => {
  const { ws } = useWorkspaces();

  const apiPath = `/api/workspaces/${ws?.id}/users`;
  const { data: patients } = useSWR<WorkspaceUser[]>(ws?.id ? apiPath : null);

  const data = notEmpty
    ? [
        ...(patients?.map((patient) => ({
          label: patient.name,
          value: patient.id,
        })) || []),
      ]
    : [
        {
          label: 'Khách vãng lai',
          value: '',
        },
        ...(patients?.map((patient) => ({
          label: patient.name,
          value: patient.id,
        })) || []),
      ];

  useEffect(() => {
    if (!patients) return;

    if (patients.length === 1) setPatientId(patients[0].id);
    else if (patientId && !patients?.find((p) => p.id === patientId))
      setPatientId('');
  }, [patientId, patients, setPatientId]);

  return (
    <Select
      label="Bệnh nhân"
      placeholder="Chọn bệnh nhân"
      data={data}
      value={patientId || ''}
      onChange={setPatientId}
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
      disabled={!patients}
      searchable
      clearable
      required={required}
    />
  );
};

export default PatientSelector;
