'use client';

import { useTheme } from 'next-themes';
import { Toaster as Sonner, type ToasterProps, toast } from 'sonner';

/*
  Surface, radius, shadow, type, semantic colours and buttons come from the
  app tokens in ../../floating-surface.css. Sonner injects unlayered CSS that
  beats Tailwind utilities, so the skin lives there instead of in classNames.
*/
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group"
      position="bottom-right"
      offset="1rem"
      closeButton
      {...props}
    />
  );
};

export { Toaster, toast };
