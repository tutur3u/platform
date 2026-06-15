'use client';

import { createUserNavClient } from '@tuturuuu/satellite/create-user-nav-client';
import { TTR_URL } from '@/constants/common';

export default createUserNavClient({
  appName: 'Storefront',
  ttrUrl: TTR_URL,
});
