'use client';

import { createUserNavClient } from '@tuturuuu/satellite/create-user-nav-client';
import { SettingsDialog } from '@/components/settings/settings-dialog';
import { TTR_URL } from '@/constants/common';

export default createUserNavClient({
  appName: 'Calendar',
  ttrUrl: TTR_URL,
  SettingsDialog,
});
