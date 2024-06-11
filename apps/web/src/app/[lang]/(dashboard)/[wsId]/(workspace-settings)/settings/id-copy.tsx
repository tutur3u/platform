'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCheck, Copy } from 'lucide-react';
import useTranslation from 'next-translate/useTranslation';
import { useState } from 'react';

interface Props {
  wsId: string;
}

export default function WorkspaceIDCopy({ wsId }: Props) {
  const { t } = useTranslation('ws-settings');

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
      <div className="flex gap-2 items-center">
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
