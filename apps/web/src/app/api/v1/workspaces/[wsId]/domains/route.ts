import { workspaceDomainsRoute } from '@/lib/workspace-domains/http';

export const GET = workspaceDomainsRoute('list');
export const POST = workspaceDomainsRoute('add');
