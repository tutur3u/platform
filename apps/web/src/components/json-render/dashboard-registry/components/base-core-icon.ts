'use client';

import { getIconComponentByKey } from '@tuturuuu/ui/custom/icon-picker';
import type { ComponentType } from 'react';
import type { IconProps } from '../shared';

export type IconComponent = ComponentType<IconProps>;

export function resolveRegistryIcon(name?: string): IconComponent | null {
  if (!name) return null;
  return getIconComponentByKey(name) ?? null;
}
