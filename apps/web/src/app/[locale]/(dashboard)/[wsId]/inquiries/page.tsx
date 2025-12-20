import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { Product, SupportInquiry, SupportType } from '@tuturuuu/types';
import { isValidTuturuuuEmail } from '@tuturuuu/utils/email/client';
import type { Metadata } from 'next';
import WorkspaceWrapper from '@/components/workspace-wrapper';
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
    status?: 'all' | 'unread' | 'read' | 'open' | 'resolved';
    page?: string;
    limit?: string;
  }>;
}

export default async function InquiriesPage({
  params,
  searchParams,
}: PageProps) {
  return (
    <WorkspaceWrapper params={params}>
      {async () => {
        const { type, product, status, page, limit } = await searchParams;

        const currentPage = Number.parseInt(page || '1', 10);
        const pageLimit = Number.parseInt(limit || '10', 10);
        const offset = (currentPage - 1) * pageLimit;

        const supabase = await createClient();

        // Verify user has valid Tuturuuu email
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!isValidTuturuuuEmail(user?.email)) {
          return (
            <div className="container mx-auto py-6">
              <div className="text-destructive">
                Access denied. Only valid tuturuuu.com accounts can view
                inquiries.
              </div>
            </div>
          );
        }

        const sbAdmin = await createAdminClient();

        // Build count query with optional filters
        let countQuery = sbAdmin
          .from('support_inquiries')
          .select('*', { count: 'exact', head: true });

        if (type) {
          countQuery = countQuery.eq('type', type);
        }

        if (product) {
          countQuery = countQuery.eq('product', product);
        }

        // Apply status filters (default to 'open' if not specified)
        const statusFilter = status || 'open';

        if (statusFilter !== 'all') {
          if (statusFilter === 'unread') {
            countQuery = countQuery.eq('is_read', false);
          } else if (statusFilter === 'read') {
            countQuery = countQuery.eq('is_read', true);
          } else if (statusFilter === 'open') {
            countQuery = countQuery.eq('is_resolved', false);
          } else if (statusFilter === 'resolved') {
            countQuery = countQuery.eq('is_resolved', true);
          }
        }
        // 'all' status shows everything, no filter applied

        const { count: totalCount } = await countQuery;

        // Build data query with optional filters and pagination
        let query = sbAdmin
          .from('support_inquiries')
          .select(`
            *,
            users(
              id,
              display_name,
              avatar_url,
              user_private_details(
                email
              )
            )
          `)
          .order('created_at', { ascending: false })
          .range(offset, offset + pageLimit - 1);

        if (type) {
          query = query.eq('type', type);
        }

        if (product) {
          query = query.eq('product', product);
        }

        // Apply status filters (using the same statusFilter variable)
        if (statusFilter !== 'all') {
          if (statusFilter === 'unread') {
            query = query.eq('is_read', false);
          } else if (statusFilter === 'read') {
            query = query.eq('is_read', true);
          } else if (statusFilter === 'open') {
            query = query.eq('is_resolved', false);
          } else if (statusFilter === 'resolved') {
            query = query.eq('is_resolved', true);
          }
        }
        // 'all' status shows everything, no filter applied

        const { data: inquiries, error } = await query;

        if (error) {
          console.error('Error fetching inquiries:', error);
          return <div>Error loading inquiries</div>;
        }

        // Get available filter options
        const { data: supportTypes } = await sbAdmin
          .from('support_inquiries')
          .select('type')
          .not('type', 'is', null);

        const { data: products } = await sbAdmin
          .from('support_inquiries')
          .select('product')
          .not('product', 'is', null);

        const uniqueTypes = [
          ...new Set(supportTypes?.map((item) => item.type) || []),
        ];

        const uniqueProducts = [
          ...new Set(products?.map((item) => item.product) || []),
        ];

        const totalPages = Math.ceil((totalCount || 0) / pageLimit);

        return (
          <div className="container mx-auto px-4 py-6 md:px-8">
            {/* Enhanced Header with gradient */}
            <div className="mb-6 rounded-lg border bg-linear-to-r from-dynamic-orange/5 via-background to-background p-6 backdrop-blur-sm md:mb-8 md:p-8">
              <div className="flex items-center gap-3 md:gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-dynamic-orange/10 ring-1 ring-dynamic-orange/20 md:h-14 md:w-14">
                  <svg
                    className="h-6 w-6 text-dynamic-orange md:h-7 md:w-7"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-label="Support Inquiries"
                  >
                    <title>Support Inquiries</title>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                    />
                  </svg>
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                  <h1 className="truncate font-bold text-2xl tracking-tight md:text-3xl">
                    Support Inquiries
                  </h1>
                  <p className="text-muted-foreground text-sm md:text-base">
                    Manage and review support inquiries from users.
                  </p>
                </div>
              </div>
            </div>

            <InquiriesClient
              inquiries={inquiries as ExtendedSupportInquiry[]}
              availableTypes={uniqueTypes}
              availableProducts={uniqueProducts}
              currentFilters={{ type, product, status }}
              pagination={{
                currentPage,
                pageLimit,
                totalCount: totalCount || 0,
                totalPages,
              }}
            />
          </div>
        );
      }}
    </WorkspaceWrapper>
  );
}
