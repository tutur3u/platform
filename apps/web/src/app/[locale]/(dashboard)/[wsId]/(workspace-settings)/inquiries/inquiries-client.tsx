'use client';

import {
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  FilterIcon,
  MessageCircleIcon,
  PackageIcon,
  Paperclip,
  UserIcon,
  XIcon,
} from '@tuturuuu/icons';
import type { Product, SupportType } from '@tuturuuu/types';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { cn } from '@tuturuuu/utils/format';
import { format } from 'date-fns';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { InquiryDetailModal } from './inquiry-detail-modal';
import type { ExtendedSupportInquiry } from './page';

interface InquiriesClientProps {
  inquiries: ExtendedSupportInquiry[];
  availableTypes: SupportType[];
  availableProducts: Product[];
  currentFilters: {
    type?: SupportType;
    product?: Product;
    status?: 'all' | 'unread' | 'read' | 'open' | 'resolved';
  };
  pagination: {
    currentPage: number;
    pageLimit: number;
    totalCount: number;
    totalPages: number;
  };
}

const SUPPORT_TYPE_LABELS: Record<SupportType, string> = {
  bug: 'Bug Report',
  'feature-request': 'Feature Request',
  support: 'Support',
  'job-application': 'Job Application',
};

const PRODUCT_LABELS: Record<Product, string> = {
  web: 'Web Platform',
  nova: 'Nova',
  rewise: 'Rewise',
  calendar: 'Calendar',
  finance: 'Finance',
  tudo: 'Tuturuuu Tasks',
  tumeet: 'Tuturuuu Meet',
  shortener: 'Link Shortener',
  qr: 'QR Generator',
  drive: 'Drive',
  mail: 'Mail',
  other: 'Other',
};

const SUPPORT_TYPE_COLORS: Record<SupportType, string> = {
  bug: 'bg-dynamic-red/10 text-dynamic-red border-dynamic-red/20',
  'feature-request':
    'bg-dynamic-blue/10 text-dynamic-blue border-dynamic-blue/20',
  support: 'bg-dynamic-green/10 text-dynamic-green border-dynamic-green/20',
  'job-application':
    'bg-dynamic-purple/10 text-dynamic-purple border-dynamic-purple/20',
};

export function InquiriesClient({
  inquiries,
  availableTypes,
  availableProducts,
  currentFilters,
  pagination,
}: InquiriesClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedInquiry, setSelectedInquiry] =
    useState<ExtendedSupportInquiry | null>(null);

  const updateFilters = (
    key: 'type' | 'product' | 'status',
    value: string | undefined
  ) => {
    const params = new URLSearchParams(searchParams.toString());

    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }

    // Reset to page 1 when filters change
    params.set('page', '1');

    router.push(`?${params.toString()}`);
  };

  const updatePage = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', page.toString());
    router.push(`?${params.toString()}`);
  };

  const updateLimit = (limit: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('limit', limit.toString());
    params.set('page', '1'); // Reset to page 1 when limit changes
    router.push(`?${params.toString()}`);
  };

  const clearFilters = () => {
    router.push(window.location.pathname);
  };

  const hasActiveFilters =
    currentFilters.type || currentFilters.product || currentFilters.status;

  const { currentPage, pageLimit, totalCount, totalPages } = pagination;

  const startIndex = (currentPage - 1) * pageLimit + 1;
  const endIndex = Math.min(currentPage * pageLimit, totalCount);

  return (
    <>
      <div className="space-y-4 md:space-y-6">
        {/* Filters - Enhanced styling */}
        <Card className="border-border/60 bg-linear-to-br from-muted/30 to-muted/10 shadow-sm transition-shadow hover:shadow-md">
          <CardHeader className="border-border/50 border-b bg-linear-to-b from-background/95 to-background/80 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-dynamic-orange/10">
                <FilterIcon className="h-4 w-4 text-dynamic-orange" />
              </div>
              <div>
                <CardTitle className="text-base leading-none tracking-tight md:text-lg">
                  Filters
                </CardTitle>
                <CardDescription className="mt-1 text-xs">
                  Filter inquiries by support type and affected product
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-4 md:p-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2.5">
                <label className="flex items-center gap-2 font-semibold text-foreground text-sm">
                  <div className="flex h-5 w-5 items-center justify-center rounded-md bg-dynamic-orange/15">
                    <FilterIcon className="h-3.5 w-3.5 text-dynamic-orange" />
                  </div>
                  Support Type
                </label>
                <Select
                  value={currentFilters.type || 'all'}
                  onValueChange={(value) => updateFilters('type', value)}
                >
                  <SelectTrigger className="h-9 transition-all hover:border-dynamic-orange/50 hover:bg-dynamic-orange/5">
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    {availableTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {SUPPORT_TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2.5">
                <label className="flex items-center gap-2 font-semibold text-foreground text-sm">
                  <div className="flex h-5 w-5 items-center justify-center rounded-md bg-dynamic-orange/15">
                    <PackageIcon className="h-3.5 w-3.5 text-dynamic-orange" />
                  </div>
                  Affected Product
                </label>
                <Select
                  value={currentFilters.product || 'all'}
                  onValueChange={(value) => updateFilters('product', value)}
                >
                  <SelectTrigger className="h-9 transition-all hover:border-dynamic-orange/50 hover:bg-dynamic-orange/5">
                    <SelectValue placeholder="All products" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All products</SelectItem>
                    {availableProducts.map((product) => (
                      <SelectItem key={product} value={product}>
                        {PRODUCT_LABELS[product]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2.5">
                <label className="flex items-center gap-2 font-semibold text-foreground text-sm">
                  <div className="flex h-5 w-5 items-center justify-center rounded-md bg-dynamic-orange/15">
                    <FilterIcon className="h-3.5 w-3.5 text-dynamic-orange" />
                  </div>
                  Status
                </label>
                <Select
                  value={currentFilters.status || 'open'}
                  onValueChange={(value) => updateFilters('status', value)}
                >
                  <SelectTrigger className="h-9 transition-all hover:border-dynamic-orange/50 hover:bg-dynamic-orange/5">
                    <SelectValue placeholder="Open (unresolved)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="unread">Unread</SelectItem>
                    <SelectItem value="read">Read</SelectItem>
                    <SelectItem value="open">Open (unresolved)</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {hasActiveFilters && (
                <div className="flex flex-col justify-end">
                  <Button
                    variant="outline"
                    onClick={clearFilters}
                    className="h-9 transition-all hover:border-dynamic-red/50 hover:bg-dynamic-red/5 hover:text-dynamic-red"
                  >
                    <XIcon className="mr-2 h-4 w-4" />
                    Clear filters
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Inquiries List */}
        <div className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <h2 className="font-semibold text-xl">Inquiries</h2>
              {totalCount > 0 && (
                <p className="text-muted-foreground text-sm">
                  Showing {startIndex} to {endIndex} of {totalCount} inquiries
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-sm">
                Items per page:
              </span>
              <Select
                value={pageLimit.toString()}
                onValueChange={(value) =>
                  updateLimit(Number.parseInt(value, 10))
                }
              >
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5</SelectItem>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {inquiries.length === 0 ? (
            <Card className="border-border/60 bg-linear-to-br from-muted/30 to-muted/10">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-dynamic-orange/10 ring-1 ring-dynamic-orange/20">
                  <MessageCircleIcon className="h-8 w-8 text-dynamic-orange" />
                </div>
                <h3 className="mt-4 font-semibold text-foreground text-lg">
                  No inquiries found
                </h3>
                <p className="mt-2 text-center text-muted-foreground text-sm">
                  {hasActiveFilters
                    ? 'Try adjusting your filters to see more results.'
                    : 'No support inquiries have been submitted yet.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 md:gap-4">
              {inquiries.map((inquiry) => (
                <Card
                  key={inquiry.id}
                  className="group cursor-pointer border-border/60 bg-linear-to-br from-background to-muted/5 shadow-sm transition-all hover:shadow-md hover:ring-2 hover:ring-dynamic-orange/20"
                  onClick={() => setSelectedInquiry(inquiry)}
                >
                  <CardContent className="p-4 md:p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            className={`${SUPPORT_TYPE_COLORS[inquiry.type]} border shadow-sm`}
                          >
                            {SUPPORT_TYPE_LABELS[inquiry.type]}
                          </Badge>
                          <Badge
                            variant="outline"
                            className="border-border/60 bg-background/50"
                          >
                            {PRODUCT_LABELS[inquiry.product]}
                          </Badge>
                          {!inquiry.is_read && (
                            <Badge
                              variant="destructive"
                              className="animate-pulse shadow-sm"
                            >
                              Unread
                            </Badge>
                          )}
                          {inquiry.is_resolved && (
                            <Badge
                              variant="secondary"
                              className="bg-dynamic-green/10 text-dynamic-green"
                            >
                              ✓ Resolved
                            </Badge>
                          )}
                        </div>

                        <div className="space-y-1.5">
                          <h3 className="font-semibold text-foreground text-lg tracking-tight group-hover:text-dynamic-orange">
                            {inquiry.subject}
                          </h3>
                          <p className="line-clamp-2 text-muted-foreground text-sm leading-relaxed">
                            {inquiry.message}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-muted-foreground text-xs">
                          <div className="flex items-center gap-2">
                            {inquiry.users ? (
                              <>
                                <Avatar className="h-5 w-5 ring-1 ring-border/50">
                                  <AvatarImage
                                    src={inquiry.users.avatar_url || ''}
                                  />
                                  <AvatarFallback className="bg-dynamic-orange/10 font-semibold text-[10px] text-dynamic-orange">
                                    {inquiry.users.display_name?.[0] ||
                                      inquiry.users.user_private_details
                                        .email?.[0] ||
                                      'U'}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="font-medium">
                                  {inquiry.users.display_name ||
                                    inquiry.users.user_private_details.email ||
                                    'Unknown User'}
                                </span>
                              </>
                            ) : (
                              <>
                                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted ring-1 ring-border/50">
                                  <UserIcon className="h-3 w-3" />
                                </div>
                                <span className="font-medium">
                                  {inquiry.name}{' '}
                                  <span className="font-normal text-muted-foreground/70">
                                    ({inquiry.email})
                                  </span>
                                </span>
                              </>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            <CalendarIcon className="h-3.5 w-3.5" />
                            <span>
                              {format(
                                new Date(inquiry.created_at),
                                'MMM d, yyyy h:mm a'
                              )}
                            </span>
                          </div>

                          {inquiry.images && inquiry.images.length > 0 && (
                            <Badge
                              variant="outline"
                              className="border-border/60 bg-background/50 text-[10px]"
                            >
                              <Paperclip /> {inquiry.images.length} image
                              {inquiry.images.length !== 1 ? 's' : ''}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Pagination Controls - Enhanced styling */}
          {totalPages > 1 && (
            <Card className="border-border/60 bg-linear-to-br from-muted/20 to-muted/5 shadow-sm">
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4 md:flex-nowrap md:p-5">
                {/* First/Previous buttons */}
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updatePage(1)}
                    disabled={currentPage === 1}
                    className="h-8 w-8 p-0 transition-all hover:border-dynamic-orange/50 hover:bg-dynamic-orange/5 disabled:opacity-40"
                    title="First page"
                  >
                    <ChevronsLeftIcon className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updatePage(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="h-8 w-8 p-0 transition-all hover:border-dynamic-orange/50 hover:bg-dynamic-orange/5 disabled:opacity-40"
                    title="Previous page"
                  >
                    <ChevronLeftIcon className="h-4 w-4" />
                  </Button>
                </div>

                {/* Page numbers */}
                <div className="flex flex-1 items-center justify-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((page) => {
                      // Show first, last, current, and adjacent pages
                      if (page === 1 || page === totalPages) return true;
                      if (Math.abs(page - currentPage) <= 1) return true;
                      return false;
                    })
                    .map((page, index, array) => {
                      // Add ellipsis
                      const showEllipsisBefore =
                        index > 0 && page - array[index - 1]! > 1;

                      return (
                        <div key={page} className="flex items-center">
                          {showEllipsisBefore && (
                            <span className="px-2 text-muted-foreground text-sm">
                              …
                            </span>
                          )}
                          <Button
                            variant={
                              currentPage === page ? 'default' : 'outline'
                            }
                            size="sm"
                            onClick={() => updatePage(page)}
                            className={cn(
                              'h-8 min-w-10 text-sm transition-all',
                              currentPage === page
                                ? 'bg-dynamic-orange text-white shadow-sm hover:bg-dynamic-orange/90'
                                : 'hover:border-dynamic-orange/50 hover:bg-dynamic-orange/5'
                            )}
                          >
                            {page}
                          </Button>
                        </div>
                      );
                    })}
                </div>

                {/* Next/Last buttons */}
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updatePage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="h-8 w-8 p-0 transition-all hover:border-dynamic-orange/50 hover:bg-dynamic-orange/5 disabled:opacity-40"
                    title="Next page"
                  >
                    <ChevronRightIcon className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updatePage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="h-8 w-8 p-0 transition-all hover:border-dynamic-orange/50 hover:bg-dynamic-orange/5 disabled:opacity-40"
                    title="Last page"
                  >
                    <ChevronsRightIcon className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {selectedInquiry && (
        <InquiryDetailModal
          inquiry={selectedInquiry}
          isOpen={!!selectedInquiry}
          onClose={() => setSelectedInquiry(null)}
          onUpdate={() => {
            // Optionally close the modal after update, or keep it open
            // setSelectedInquiry(null);
          }}
        />
      )}
    </>
  );
}
