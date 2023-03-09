import { MantineThemeOverride } from '@mantine/core';

export const theme: MantineThemeOverride = {
  colorScheme: 'dark',
  focusRingStyles: {
    resetStyles: () => ({ outline: 'none' }),
    styles: () => ({ outline: 'none' }),
    inputStyles: () => ({ outline: 'none' }),
  },
};
