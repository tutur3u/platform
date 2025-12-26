'use client';

import { Info, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'personal-workspace-collaboration-banner-dismissed';

export function PersonalWorkspaceCollaborationBanner() {
  const t = useTranslations('common');
  const [isDismissed, setIsDismissed] = useState(true); // Default to true to avoid flash

  useEffect(() => {
    const dismissed = localStorage.getItem(STORAGE_KEY);
    setIsDismissed(dismissed === 'true');
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setIsDismissed(true);
  };

  if (isDismissed) return null;

  return (
    <div className="mb-4 flex items-start gap-3 rounded-lg border border-dynamic-blue/20 bg-dynamic-blue/5 p-2 text-sm md:p-4">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-dynamic-blue" />
      <p className="flex-1 text-foreground/80">
        {t('personal_workspace_collaboration_note')}
      </p>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0 text-foreground/60 hover:text-foreground"
        onClick={handleDismiss}
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
