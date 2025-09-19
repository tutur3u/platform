import { createClient } from '@tuturuuu/supabase/next/server';
import type { Product, SupportInquiry, SupportType } from '@tuturuuu/types/db';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { InquiriesClient } from './inquiries-client';

export const metadata: Metadata = {
  title: 'Inquiries',
  description: 'Manage Inquiries in your Tuturuuu workspace.',
};

export interface ExtendedSupportInquiry extends SupportInquiry {
  users: {
    id: string;
    display_name: string;
    avatar_url: string;
    user_private_details: {
      email: string;
    };
  };
}

interface PageProps {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
  searchParams: Promise<{
    type?: SupportType;
    product?: Product;
  }>;
}

export default async function InquiriesPage({
  params,
  searchParams,
}: PageProps) {
  const { wsId } = await params;
  const { type, product } = await searchParams;

  const supabase = await createClient();

  // Check if user is authenticated and has access
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Check if user has access to this workspace (root workspace only)
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id, name')
    .eq('id', wsId)
    .single();

  if (!workspace) redirect('/');

  // Build query with optional filters
  let query = supabase
    .from('support_inquiries')
    .select(`
      *,
      users!fk_support_inquiries_creator_id(
        id,
        display_name,
        avatar_url,
        user_private_details(
          email
        )
      )
    `)
    .order('created_at', { ascending: false });

  // Apply filters if provided
  if (type) {
    query = query.eq('type', type);
  }
  if (product) {
    query = query.eq('product', product);
  }

  const { data: inquiries, error } = await query;

  if (error) {
    console.error('Error fetching inquiries:', error);
    return <div>Error loading inquiries</div>;
  }

  // Get available filter options
  const { data: supportTypes } = await supabase
    .from('support_inquiries')
    .select('type')
    .not('type', 'is', null);

  const { data: products } = await supabase
    .from('support_inquiries')
    .select('product')
    .not('product', 'is', null);

  const uniqueTypes = [
    ...new Set(supportTypes?.map((item) => item.type) || []),
  ];
  const uniqueProducts = [
    ...new Set(products?.map((item) => item.product) || []),
  ];

  return (
    <div className="container mx-auto py-6">
      <div className="mb-6">
        <h1 className="font-bold text-3xl">Support Inquiries</h1>
        <p className="text-muted-foreground">
          Manage and review support inquiries from users.
        </p>
      </div>

      <InquiriesClient
        inquiries={inquiries as ExtendedSupportInquiry[]}
        availableTypes={uniqueTypes}
        availableProducts={uniqueProducts}
        currentFilters={{ type, product }}
      />
    </div>
  );
}
