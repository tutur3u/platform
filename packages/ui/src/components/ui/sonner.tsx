'use client';

import {
  CircleCheck,
  CircleX,
  Info,
  LoaderCircle,
  TriangleAlert,
  X,
} from '@tuturuuu/icons/lucide-static';
import { useTheme } from 'next-themes';
import type { CSSProperties } from 'react';
import { Toaster as Sonner, type ToasterProps, toast } from 'sonner';

/*
  Surface, radius, shadow, type, semantic colours and buttons come from the
  app tokens in ../../floating-surface.css. Sonner injects unlayered CSS that
  beats Tailwind utilities, so the skin lives there instead of in classNames.
  Icons are lucide so toasts match every other surface.
*/
const TOAST_ICONS: ToasterProps['icons'] = {
  success: <CircleCheck aria-hidden className="size-4" />,
  error: <CircleX aria-hidden className="size-4" />,
  warning: <TriangleAlert aria-hidden className="size-4" />,
  info: <Info aria-hidden className="size-4" />,
  loading: <LoaderCircle aria-hidden className="size-4 animate-spin" />,
  close: <X aria-hidden className="size-3" />,
};

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group"
      position="bottom-right"
      offset="1rem"
      style={{ '--width': '356px' } as CSSProperties}
      gap={8}
      closeButton
      icons={TOAST_ICONS}
      {...props}
    />
  );
};

export { Toaster, toast };
