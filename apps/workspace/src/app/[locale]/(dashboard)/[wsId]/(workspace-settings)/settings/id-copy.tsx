'use client';

import { CheckCheck, Copy } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
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
    <SettingItemTab
      controlWidth="xl"
      title={<Label htmlFor="workspace-id">{t('id')}</Label>}
    >
      <div className="flex items-center gap-2">
        <Input
          className="text-xs md:text-xs"
          id="workspace-id"
          value={wsId}
          disabled
        />

        <Button
          onClick={copyId}
          size="icon"
          variant="outline"
          className="shrink-0"
          disabled={!showCopy}
        >
          {showCopy ? (
            <Copy className="h-4 w-4" />
          ) : (
            <CheckCheck className="h-4 w-4" />
          )}
        </Button>
      </div>
    </SettingItemTab>
  );
}
