import { Select } from '@mantine/core';
import { Diagnosis } from '../../types/primitives/Diagnosis';
import useSWR from 'swr';
import { useEffect } from 'react';
import { useWorkspaces } from '../../hooks/useWorkspaces';

interface Props {
  diagnosis: Diagnosis | null;
  setDiagnosis: (diagnosis: Diagnosis | null) => void;

  className?: string;
  required?: boolean;
}

const DiagnosisSelector = ({
  diagnosis,
  setDiagnosis,

  className,
  required = false,
}: Props) => {
  const { ws } = useWorkspaces();

  const apiPath = `/api/workspaces/${ws?.id}/healthcare/diagnoses`;
  const { data: diagnoses } = useSWR<Diagnosis[]>(ws?.id ? apiPath : null);

  const data = [
    ...(diagnoses?.map((diagnosis) => ({
      label: diagnosis.name,
      value: diagnosis.id,
    })) || []),
  ];

  useEffect(() => {
    if (!diagnoses) return;

    if (diagnosis) {
      const found = diagnoses.find((p) => p.id === diagnosis.id);
      if (!found) setDiagnosis(null);
    }
  }, [diagnosis, diagnoses, setDiagnosis]);

  return (
    <Select
      label="Chẩn đoán"
      placeholder="Chọn chẩn đoán"
      data={data}
      value={diagnosis?.id}
      onChange={(id) => {
        setDiagnosis(diagnoses?.find((p) => p.id === id) || null);
      }}
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
      disabled={!diagnoses}
      searchable
      clearable
      required={required}
    />
  );
};

export default DiagnosisSelector;
