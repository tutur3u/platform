'use client';

import { useUserConfig } from '@tuturuuu/ui/hooks/use-user-config';
import {
  DEFAULT_REQUIRE_ATTENTION_COLOR,
  getRequireAttentionTextClass,
  parseRequireAttentionColor,
  REQUIRE_ATTENTION_COLOR_CONFIG_ID,
} from '@tuturuuu/users-core/lib/user-feedbacks';
import { useMemo } from 'react';

export function useRequireAttentionColor() {
  const { data, isLoading } = useUserConfig(
    REQUIRE_ATTENTION_COLOR_CONFIG_ID,
    DEFAULT_REQUIRE_ATTENTION_COLOR
  );

  const color = useMemo(() => parseRequireAttentionColor(data), [data]);
  const textClassName = useMemo(
    () => getRequireAttentionTextClass(color),
    [color]
  );

  return {
    color,
    textClassName,
    isLoading,
  };
}
