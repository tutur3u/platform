import { MantineThemeOverride } from '@mantine/core';

export const theme: MantineThemeOverride = {
  colorScheme: 'dark',
  fontSizes: {
    xs: 16,
    sm: 16,
    md: 16,
    lg: 16,
    xl: 16,
  },
  focusRingStyles: {
    resetStyles: () => ({ outline: 'none' }),
    styles: () => ({ outline: 'none' }),
    inputStyles: () => ({ outline: 'none' }),
  },
};
