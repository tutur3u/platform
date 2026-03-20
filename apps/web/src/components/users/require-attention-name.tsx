'use client';

import { cn } from '@tuturuuu/utils/format';
import { useRequireAttentionColor } from '@/hooks/use-require-attention-color';

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
