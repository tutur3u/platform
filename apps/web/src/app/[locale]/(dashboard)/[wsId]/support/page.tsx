import { getUserInquiryColumns } from './columns';
import SupportInquiryForm from './form';
import { CustomDataTable } from '@/components/custom-data-table';
import { createClient } from '@tuturuuu/supabase/next/server';
import { Database } from '@tuturuuu/types/supabase';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { getTranslations } from 'next-intl/server';

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
  }>;
}

async function getData(
  _wsId: string,
  searchParams: {
    q?: string;
    page?: string;
    pageSize?: string;
    status?: 'all' | 'unread' | 'read' | 'resolved' | 'unresolved';
  }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return { data: [], count: 0 };
  }

  let query = supabase
    .from('support_inquiries')
    .select('*', { count: 'exact' })
    .eq('email', user.email || '')
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
      `subject.ilike.%${searchParams.q}%,message.ilike.%${searchParams.q}%`
    );
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

export default async function UserSupportPage({
  params,
  searchParams,
}: Props) {
  const t = await getTranslations();
  const { locale, wsId } = await params;
  const { data, count } = await getData(wsId, await searchParams);

  const inquiries: (SupportInquiry & { href?: string })[] = data.map((inquiry) => ({
    ...inquiry,
    href: `/${wsId}/support/${inquiry.id}`,
  }));

  return (
    <>
      <FeatureSummary
        pluralTitle={t('sidebar_tabs.my_inquiries')}
        singularTitle={t('sidebar_tabs.inquiries')}
        description={t('support.user_description')}
        createTitle={t('support.create_inquiry')}
        createDescription={t('support.create_inquiry_description')}
        form={<SupportInquiryForm />}
      />
      <Separator className="my-4" />
      <CustomDataTable
        data={inquiries}
        namespace="support-inquiry-data-table"
        columnGenerator={getUserInquiryColumns}
        extraData={{ locale, wsId }}
        count={count}
        defaultVisibility={{
          id: false,
          email: false,
          is_read: false,
          created_at: true,
        }}
      />
    </>
  );
} 