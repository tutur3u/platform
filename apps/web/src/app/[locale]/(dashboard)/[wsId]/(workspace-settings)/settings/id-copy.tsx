'use client';

import { Button } from '@ncthub/ui/button';
import { CheckCheck, Copy } from '@ncthub/ui/icons';
import { Input } from '@ncthub/ui/input';
import { Label } from '@ncthub/ui/label';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface Props {
  wsId: string;
}

export default function WorkspaceIDCopy({ wsId }: Props) {
  const t = useTranslations('ws-settings');

  const [showCopy, setShowCopy] = useState(true);

  const copyId = () => {
    navigator.clipboard.writeText(wsId);
    setShowCopy(false);

    setTimeout(() => {
      setShowCopy(true);
    }, 2000);
  };

  return (
    <div className="grid gap-2">
      <Label htmlFor="workspace-id">{t('id')}</Label>
      <div className="flex items-center gap-2">
        <Input id="workspace-id" value={wsId} disabled />

        <Button onClick={copyId} size="icon" disabled={!showCopy}>
          {showCopy ? (
            <Copy className="h-5 w-5" />
          ) : (
            <CheckCheck className="h-5 w-5" />
          )}
        </Button>
      </div>
    </div>
  );
}
