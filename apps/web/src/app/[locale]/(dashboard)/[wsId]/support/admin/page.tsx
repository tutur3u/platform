import { getAdminInquiryColumns } from '../columns';
import { AdminInquiryFilters } from '../filters';
import { CustomDataTable } from '@/components/custom-data-table';
import { createClient } from '@tuturuuu/supabase/next/server';
import { Database } from '@tuturuuu/types/supabase';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

type SupportInquiry = Database['public']['Tables']['support_inquiries']['Row'];

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
  searchParams: Promise<{
    q?: string;
    page?: string;
    pageSize?: string;
    status?: 'all' | 'unread' | 'read' | 'resolved' | 'unresolved';
    priority?: 'all' | 'high' | 'medium' | 'low';
    dateRange?: string;
  }>;
}

async function getData(
  _wsId: string,
  searchParams: {
    q?: string;
    page?: string;
    pageSize?: string;
    status?: 'all' | 'unread' | 'read' | 'resolved' | 'unresolved';
    priority?: 'all' | 'high' | 'medium' | 'low';
    dateRange?: string;
  }
) {
  const supabase = await createClient();

  let query = supabase
    .from('support_inquiries')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  // Filter by status
  if (searchParams.status && searchParams.status !== 'all') {
    switch (searchParams.status) {
      case 'unread':
        query = query.eq('is_read', false);
        break;
      case 'read':
        query = query.eq('is_read', true);
        break;
      case 'resolved':
        query = query.eq('is_resolved', true);
        break;
      case 'unresolved':
        query = query.eq('is_resolved', false);
        break;
    }
  }

  // Search functionality
  if (searchParams.q) {
    query = query.or(
      `name.ilike.%${searchParams.q}%,email.ilike.%${searchParams.q}%,subject.ilike.%${searchParams.q}%,message.ilike.%${searchParams.q}%`
    );
  }

  // Date range filter
  if (searchParams.dateRange) {
    const today = new Date();
    let startDate: Date;
    
    switch (searchParams.dateRange) {
      case 'today':
        startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        break;
      case 'week':
        startDate = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        break;
      case 'quarter':
        const quarter = Math.floor(today.getMonth() / 3);
        startDate = new Date(today.getFullYear(), quarter * 3, 1);
        break;
      default:
        startDate = new Date(0); // All time
    }
    
    if (searchParams.dateRange !== 'all') {
      query = query.gte('created_at', startDate.toISOString());
    }
  }

  // Pagination
  const page = parseInt(searchParams.page || '1');
  const pageSize = parseInt(searchParams.pageSize || '10');
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  query = query.range(from, to);

  const { data, error, count } = await query;

  if (error) {
    console.error('Error fetching support inquiries:', error);
    return { data: [], count: 0 };
  }

  return { data: data || [], count: count || 0 };
}

export default async function AdminSupportPage({
  params,
  searchParams,
}: Props) {
  const t = await getTranslations();
  const { locale, wsId } = await params;

  // Check permissions
  const { containsPermission } = await getPermissions({ wsId });
  
  if (!containsPermission('manage_workspace_members')) {
    redirect(`/${wsId}/support`);
  }

  const { data, count } = await getData(wsId, await searchParams);

  const inquiries: (SupportInquiry & { href?: string })[] = data.map((inquiry) => ({
    ...inquiry,
    href: `/${wsId}/support/${inquiry.id}`,
  }));

  return (
    <>
      <FeatureSummary
        pluralTitle={t('sidebar_tabs.all_inquiries')}
        singularTitle={t('sidebar_tabs.inquiries')}
        description={t('support.admin_description')}
      />
      <Separator className="my-4" />
      <CustomDataTable
        data={inquiries}
        namespace="support-inquiry-data-table"
        columnGenerator={getAdminInquiryColumns}
        extraData={{ locale, wsId }}
        count={count}
        defaultVisibility={{
          id: false,
          created_at: true,
          is_read: true,
          is_resolved: true,
        }}
        filters={
          <AdminInquiryFilters
            wsId={wsId}
            searchParams={await searchParams}
          />
        }
      />
    </>
  );
} 