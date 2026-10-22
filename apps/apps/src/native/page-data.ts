import { createServerFn } from '@tanstack/react-start';

export const loadGateway = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { loadGatewayData } = await import('./page-data.server');
    return loadGatewayData();
  }
);
