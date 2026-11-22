'use client';

import { useCallback, useMemo, useState } from 'react';
import { browsableTools } from '../tools/use-meet-tools';
import { allowedToolIds, isActivityAvailable } from './availability';

/**
 * Which activities may be on the stage right now. Browsable tools follow the
 * person's current role and room settings; tools a host opened for them are
 * kept for this session only and never saved.
 */
export function useStageAvailability({
  live,
  collaboration,
  classroom,
  tools,
}: {
  live: boolean;
  collaboration: boolean;
  classroom: boolean;
  tools: { available: boolean; activitiesOnly: boolean };
}) {
  const [summoned, setSummoned] = useState<readonly string[]>([]);
  const browsable = browsableTools({
    available: tools.available,
    enabled: live,
    activitiesOnly: tools.activitiesOnly,
  })
    .map((tool) => tool.id)
    .join('|');
  const toolIds = useMemo(
    () => allowedToolIds(browsable ? browsable.split('|') : [], summoned),
    [browsable, summoned]
  );
  const isAvailable = useCallback(
    (activityId: string) =>
      isActivityAvailable(activityId, {
        live,
        collaboration,
        classroom,
        toolIds,
      }),
    [live, collaboration, classroom, toolIds]
  );
  const summon = useCallback(
    (activityId: string) =>
      setSummoned((current) =>
        current.includes(activityId) ? current : [...current, activityId]
      ),
    []
  );
  return { isAvailable, summon };
}
