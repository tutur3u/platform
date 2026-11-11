'use client';

import { defineRegistry } from '@json-render/react';
import { dashboardCatalog } from '@tuturuuu/ai/tools/json-render-catalog';
import { dashboardActions } from './dashboard-registry/actions';
import { dashboardBaseComponents } from './dashboard-registry/components/base-components';
import { dashboardFormComponents } from './dashboard-registry/components/form-components';
import { dashboardTaskComponents } from './dashboard-registry/components/task-components';
import { dashboardLearningComponents } from './dashboard-registry/learning-components';

export const { registry, handlers, executeAction } = defineRegistry(
  dashboardCatalog,
  {
    components: {
      ...dashboardBaseComponents,
      ...dashboardTaskComponents,
      ...dashboardFormComponents,
      ...dashboardLearningComponents,
    },
    actions: dashboardActions,
  }
);
