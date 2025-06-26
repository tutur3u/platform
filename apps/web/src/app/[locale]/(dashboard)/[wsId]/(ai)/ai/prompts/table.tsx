'use client';

import type { AIPrompt } from '@tuturuuu/types/db';
import { Dialog } from '@tuturuuu/ui/dialog';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { CustomDataTable } from '@/components/custom-data-table';
import { aiPromptsColumns } from './columns';
import { AIPromptForm } from './form';

interface Props {
  wsId: string;
  data: AIPrompt[];
  count: number;
}

export default function AIPromptsTable({ wsId, data, count }: Props) {
  const t = useTranslations('common');

  const [prompt, setPrompt] = useState<Partial<AIPrompt> | undefined>();

  const onComplete = () => {
    // setPrompt(undefined);
  };

  return (
    <Dialog
      open={!!prompt}
      onOpenChange={(open) => setPrompt(open ? prompt || {} : undefined)}
    >
      <CustomDataTable
        data={data}
        columnGenerator={(
          t: (key: string) => string,
          namespace: string | undefined
        ) => aiPromptsColumns(t, namespace, setPrompt)}
        namespace="ai-prompts-data-table"
        count={count}
        defaultVisibility={{
          id: false,
          description: false,
          type: false,
          currency: false,
          report_opt_in: false,
          created_at: false,
        }}
        editContent={
          <AIPromptForm
            wsId={wsId}
            data={prompt}
            onComplete={onComplete}
            submitLabel={prompt?.id ? t('edit') : t('create')}
          />
        }
      />
    </Dialog>
  );
}
