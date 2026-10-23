import { Providers as SatelliteProviders } from '@tuturuuu/satellite/providers';
import type { ComponentProps } from 'react';
import { MeetThemeProvider } from '../../runtime/theme-provider';

export function Providers(props: ComponentProps<typeof SatelliteProviders>) {
  return <SatelliteProviders {...props} themeProvider={MeetThemeProvider} />;
}
