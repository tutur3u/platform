'use client';

import { Button, Divider } from '@mantine/core';
import { useEffect } from 'react';
import LoadingIndicator from '../common/LoadingIndicator';
import { useWorkspaces } from '../../hooks/useWorkspaces';
import WorkspaceInviteSnippet from '../notifications/WorkspaceInviteSnippet';
import { useUser } from '../../hooks/useUser';
import useTranslation from 'next-translate/useTranslation';
import LanguageSelector from '../selectors/LanguageSelector';
import { mutate } from 'swr';

const OnboardingForm = () => {
  useEffect(() => {
    mutate('/api/user');
    mutate('/api/workspaces/current');
    mutate('/api/workspaces/invites');
  }, []);

  return <></>;
};

export default OnboardingForm;
