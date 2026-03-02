'use client';

import { dashboardBaseCoreComponents } from './base-core-components';
import { blogDashboardComponents } from './blog-components';

export const dashboardBaseComponents = {
  ...dashboardBaseCoreComponents,
  ...blogDashboardComponents,
};
