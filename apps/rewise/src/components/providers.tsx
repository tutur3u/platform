import { ClientProviders } from './client-providers';
import { ThemeProvider } from 'next-themes';
import { ThemeProviderProps } from 'next-themes/dist/types';

export function Providers({ children, ...props }: ThemeProviderProps) {
  return (
    <ThemeProvider {...props}>
      <ClientProviders>{children}</ClientProviders>
    </ThemeProvider>
  );
}
