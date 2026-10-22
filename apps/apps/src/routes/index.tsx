import { createFileRoute } from '@tanstack/react-router';
import { AppsGatewayPage } from '../native/gateway-page';

export const Route = createFileRoute('/')({
  component: AppsGatewayPage,
});
