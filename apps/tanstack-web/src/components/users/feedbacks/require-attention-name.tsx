'use client';

import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import { useUserConfig } from '@tuturuuu/ui/hooks/use-user-config';
import { cn } from '@tuturuuu/utils/format';
import { useMemo } from 'react';

const REQUIRE_ATTENTION_COLOR_CONFIG_ID =
  'USER_FEEDBACK_REQUIRE_ATTENTION_COLOR';

const DEFAULT_REQUIRE_ATTENTION_COLOR: SupportedColor = 'ORANGE';

const REQUIRE_ATTENTION_TEXT_CLASS_BY_COLOR: Record<SupportedColor, string> = {
  RED: 'text-dynamic-red',
  ORANGE: 'text-dynamic-orange',
  YELLOW: 'text-dynamic-yellow',
  GREEN: 'text-dynamic-green',
  BLUE: 'text-dynamic-blue',
  PURPLE: 'text-dynamic-purple',
  PINK: 'text-dynamic-pink',
  INDIGO: 'text-dynamic-indigo',
  CYAN: 'text-dynamic-cyan',
  GRAY: 'text-dynamic-gray',
};

const SUPPORTED_FEEDBACK_COLORS = new Set<SupportedColor>(
  Object.keys(REQUIRE_ATTENTION_TEXT_CLASS_BY_COLOR) as SupportedColor[]
);

function parseRequireAttentionColor(
  value: string | null | undefined
): SupportedColor {
  if (!value) {
    return DEFAULT_REQUIRE_ATTENTION_COLOR;
  }

  return SUPPORTED_FEEDBACK_COLORS.has(value as SupportedColor)
    ? (value as SupportedColor)
    : DEFAULT_REQUIRE_ATTENTION_COLOR;
}

function getRequireAttentionTextClass(color: string | null | undefined) {
  return REQUIRE_ATTENTION_TEXT_CLASS_BY_COLOR[
    parseRequireAttentionColor(color)
  ];
}

function useRequireAttentionColor() {
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

interface RequireAttentionNameProps {
  name: string;
  requireAttention: boolean;
  className?: string;
}

export function RequireAttentionName({
  name,
  requireAttention,
  className,
}: RequireAttentionNameProps) {
  const { textClassName } = useRequireAttentionColor();

  return (
    <span className={cn(className, requireAttention && textClassName)}>
      {name}
    </span>
  );
}
