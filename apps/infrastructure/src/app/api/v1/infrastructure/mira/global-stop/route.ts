import { miraOperatorRoute } from '@/lib/mira-channels/http';

export const GET = miraOperatorRoute('global_stop_get');
export const POST = miraOperatorRoute('global_stop_set');
