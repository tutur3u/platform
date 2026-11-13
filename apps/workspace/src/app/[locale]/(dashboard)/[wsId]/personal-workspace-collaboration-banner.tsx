'use client';

import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

const STORAGE_KEY = 'personal-workspace-collaboration-banner-dismissed';
const TOAST_ID = 'personal-workspace-collaboration-notice';

function persistDismissal() {
  localStorage.setItem(STORAGE_KEY, 'true');
}

export function PersonalWorkspaceCollaborationBanner() {
  const t = useTranslations('common');

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) === 'true') return;

    toast.info(t('personal_workspace_collaboration_note'), {
      closeButton: true,
      dismissible: true,
      duration: Number.POSITIVE_INFINITY,
      id: TOAST_ID,
      onDismiss: persistDismissal,
    });
  }, [t]);

  return null;
}
