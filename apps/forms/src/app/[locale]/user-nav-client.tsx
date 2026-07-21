'use client';

import { createUserNavClient } from '@tuturuuu/satellite/create-user-nav-client';
import { SettingsDialog } from '@/components/settings/settings-dialog';
import { WEB_APP_URL } from '@/constants/common';

export default createUserNavClient({
  appName: 'Forms',
  SettingsDialog,
  ttrUrl: WEB_APP_URL,
});
