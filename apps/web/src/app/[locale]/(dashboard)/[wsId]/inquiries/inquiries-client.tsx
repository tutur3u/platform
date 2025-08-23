'use client';

import type { Product, SupportType } from '@tuturuuu/types/db';
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
import { format } from 'date-fns';
import { CalendarIcon, MessageCircleIcon, UserIcon, XIcon } from 'lucide-react';
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
  tudo: 'TuDo',
  tumeet: 'TuMeet',
  shortener: 'Link Shortener',
  qr: 'QR Generator',
  drive: 'Drive',
  mail: 'Mail',
  other: 'Other',
};

const SUPPORT_TYPE_COLORS: Record<SupportType, string> = {
  bug: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  'feature-request':
    'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  support: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  'job-application':
    'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
};

export function InquiriesClient({
  inquiries,
  availableTypes,
  availableProducts,
  currentFilters,
}: InquiriesClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedInquiry, setSelectedInquiry] =
    useState<ExtendedSupportInquiry | null>(null);

  const updateFilters = (
    key: 'type' | 'product',
    value: string | undefined
  ) => {
    const params = new URLSearchParams(searchParams.toString());

    if (value && value !== 'all') {
      params.set(key, value);
    } else {
      params.delete(key);
    }

    router.push(`?${params.toString()}`);
  };

  const clearFilters = () => {
    router.push(window.location.pathname);
  };

  const hasActiveFilters = currentFilters.type || currentFilters.product;

  return (
    <>
      <div className="space-y-6">
        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Filters</CardTitle>
            <CardDescription>
              Filter inquiries by support type and affected product
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-4">
              <div className="flex flex-col space-y-2">
                <span className="font-medium text-sm">Support Type</span>
                <Select
                  value={currentFilters.type || 'all'}
                  onValueChange={(value) => updateFilters('type', value)}
                >
                  <SelectTrigger className="w-48">
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

              <div className="flex flex-col space-y-2">
                <span className="font-medium text-sm">Affected Product</span>
                <Select
                  value={currentFilters.product || 'all'}
                  onValueChange={(value) => updateFilters('product', value)}
                >
                  <SelectTrigger className="w-48">
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

              {hasActiveFilters && (
                <div className="flex flex-col justify-end">
                  <Button variant="outline" onClick={clearFilters}>
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
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-xl">
              Inquiries ({inquiries.length})
            </h2>
          </div>

          {inquiries.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <MessageCircleIcon className="mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="mb-2 font-semibold text-lg">
                  No inquiries found
                </h3>
                <p className="text-center text-muted-foreground">
                  {hasActiveFilters
                    ? 'Try adjusting your filters to see more results.'
                    : 'No support inquiries have been submitted yet.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {inquiries.map((inquiry) => (
                <Card
                  key={inquiry.id}
                  className="cursor-pointer transition-shadow hover:shadow-md"
                  onClick={() => setSelectedInquiry(inquiry)}
                >
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 space-y-3">
                        <div className="flex items-center space-x-3">
                          <Badge className={SUPPORT_TYPE_COLORS[inquiry.type]}>
                            {SUPPORT_TYPE_LABELS[inquiry.type]}
                          </Badge>
                          <Badge variant="outline">
                            {PRODUCT_LABELS[inquiry.product]}
                          </Badge>
                          {!inquiry.is_read && (
                            <Badge variant="destructive">Unread</Badge>
                          )}
                          {inquiry.is_resolved && (
                            <Badge variant="secondary">Resolved</Badge>
                          )}
                        </div>

                        <div>
                          <h3 className="mb-1 font-semibold text-lg">
                            {inquiry.subject}
                          </h3>
                          <p className="line-clamp-2 text-muted-foreground">
                            {inquiry.message}
                          </p>
                        </div>

                        <div className="flex items-center space-x-4 text-muted-foreground text-sm">
                          <div className="flex items-center space-x-2">
                            {inquiry.users ? (
                              <>
                                <Avatar className="h-5 w-5">
                                  <AvatarImage
                                    src={inquiry.users.avatar_url || ''}
                                  />
                                  <AvatarFallback>
                                    {inquiry.users.display_name?.[0] ||
                                      inquiry.users.user_private_details
                                        .email?.[0] ||
                                      'U'}
                                  </AvatarFallback>
                                </Avatar>
                                <span>
                                  {inquiry.users.display_name ||
                                    inquiry.users.user_private_details.email ||
                                    'Unknown User'}
                                </span>
                              </>
                            ) : (
                              <>
                                <UserIcon className="h-4 w-4" />
                                <span>
                                  {inquiry.name} ({inquiry.email})
                                </span>
                              </>
                            )}
                          </div>

                          <div className="flex items-center space-x-1">
                            <CalendarIcon className="h-4 w-4" />
                            <span>
                              {format(
                                new Date(inquiry.created_at),
                                'MMM d, yyyy h:mm a'
                              )}
                            </span>
                          </div>

                          {inquiry.images && inquiry.images.length > 0 && (
                            <Badge variant="outline">
                              {inquiry.images.length} image
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
        </div>
      </div>

      {/* Detail Modal */}
      {selectedInquiry && (
        <InquiryDetailModal
          inquiry={selectedInquiry}
          isOpen={!!selectedInquiry}
          onClose={() => setSelectedInquiry(null)}
        />
      )}
    </>
  );
}
