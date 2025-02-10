'use client';

import { aiPromptsColumns } from './columns';
import { AIPromptForm } from './form';
import { CustomDataTable } from '@/components/custom-data-table';
import { AIPrompt } from '@tutur3u/types/db';
import { Dialog } from '@tutur3u/ui/components/ui/dialog';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

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
        columnGenerator={(t: any, namespace: string | undefined) =>
          aiPromptsColumns(t, namespace, setPrompt)
        }
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
