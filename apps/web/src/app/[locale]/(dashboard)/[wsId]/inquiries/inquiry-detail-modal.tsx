'use client';

import { createDynamicClient } from '@tuturuuu/supabase/next/client';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { format } from 'date-fns';
import {
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  ExternalLinkIcon,
  ImageIcon,
  MailIcon,
  MessageSquareIcon,
  TagIcon,
  ZoomInIcon,
} from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import type { ExtendedSupportInquiry } from './page';

// Custom hook for generating signed URLs
function useSignedImageUrls(
  inquiryId: string,
  images: string[] | null
): {
  imageUrls: Record<string, string>;
  isLoading: boolean;
} {
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const supabase = createDynamicClient();

  const generateSignedUrls = useCallback(async () => {
    if (!images || images.length === 0) {
      setImageUrls({});
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const urls: Record<string, string> = {};

    for (const imagePath of images) {
      try {
        const { data, error } = await supabase.storage
          .from('support_inquiries')
          .createSignedUrl(`${inquiryId}/${imagePath}`, 300); // 5 minutes = 300 seconds

        if (data?.signedUrl && !error) {
          urls[imagePath] = data.signedUrl;
        }
      } catch (error) {
        console.error(
          'Error generating signed URL for image:',
          imagePath,
          error
        );
      }
    }

    setImageUrls(urls);
    setIsLoading(false);
  }, [images, supabase, inquiryId]);

  // Generate URLs when images change
  useEffect(() => {
    generateSignedUrls();
  }, [generateSignedUrls]);

  return { imageUrls, isLoading };
}

interface InquiryDetailModalProps {
  inquiry: ExtendedSupportInquiry;
  isOpen: boolean;
  onClose: () => void;
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
  bug: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800',
  'feature-request':
    'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
  support:
    'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800',
  'job-application':
    'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800',
};

export function InquiryDetailModal({
  inquiry,
  isOpen,
  onClose,
}: InquiryDetailModalProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const inquiryId = inquiry.id;
  const { imageUrls, isLoading } = useSignedImageUrls(
    inquiryId,
    inquiry.images
  );

  const handleImageClick = (imagePath: string) => {
    const signedUrl = imageUrls[imagePath];
    if (signedUrl) {
      setSelectedImage(signedUrl);
    }
  };

  const closeImageViewer = () => {
    setSelectedImage(null);
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-h-[95vh] max-w-5xl overflow-hidden p-0">
          <div className="border-b bg-gradient-to-r from-slate-50 to-slate-100 px-8 py-6 dark:from-slate-900 dark:to-slate-800">
            <DialogHeader className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-3">
                  <DialogTitle className="font-bold text-2xl text-slate-900 leading-tight dark:text-slate-100">
                    {inquiry.subject}
                  </DialogTitle>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      className={`${SUPPORT_TYPE_COLORS[inquiry.type]} font-medium`}
                    >
                      <TagIcon className="mr-1.5 h-3.5 w-3.5" />
                      {SUPPORT_TYPE_LABELS[inquiry.type]}
                    </Badge>
                    <Badge variant="outline" className="font-medium">
                      {PRODUCT_LABELS[inquiry.product]}
                    </Badge>
                    {!inquiry.is_read && (
                      <Badge className="border-amber-200 bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                        New
                      </Badge>
                    )}
                    {inquiry.is_resolved ? (
                      <Badge className="border-emerald-200 bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
                        <CheckCircleIcon className="mr-1.5 h-3.5 w-3.5" />
                        Resolved
                      </Badge>
                    ) : (
                      <Badge className="border-orange-200 bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
                        <ClockIcon className="mr-1.5 h-3.5 w-3.5" />
                        Open
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </DialogHeader>
          </div>

          <ScrollArea className="max-h-[calc(95vh-140px)] flex-1">
            <div className="space-y-8 p-8">
              <div className="flex items-start gap-6 rounded-xl border bg-slate-50 p-6 dark:bg-slate-900/50">
                {inquiry.users ? (
                  <>
                    <Avatar className="h-16 w-16 ring-2 ring-slate-200 dark:ring-slate-700">
                      <AvatarImage src={inquiry.users.avatar_url || ''} />
                      <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 font-semibold text-white text-xl">
                        {inquiry.users.display_name?.[0] ||
                          inquiry.users.user_private_details.email?.[0] ||
                          'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 space-y-3">
                      <div>
                        <h3 className="font-semibold text-slate-900 text-xl dark:text-slate-100">
                          {inquiry.users.display_name || 'Unknown User'}
                        </h3>
                        <div className="mt-1 flex items-center gap-2 text-slate-600 dark:text-slate-400">
                          <MailIcon className="h-4 w-4" />
                          <span className="text-sm">
                            {inquiry.users.user_private_details.email}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-slate-500 text-sm dark:text-slate-400">
                        <CalendarIcon className="h-4 w-4" />
                        <span>
                          Submitted{' '}
                          {format(
                            new Date(inquiry.created_at),
                            "MMM d, yyyy 'at' h:mm a"
                          )}
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <Avatar className="h-16 w-16 ring-2 ring-slate-200 dark:ring-slate-700">
                      <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 font-semibold text-white text-xl">
                        {inquiry.name[0] || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 space-y-3">
                      <div>
                        <h3 className="font-semibold text-slate-900 text-xl dark:text-slate-100">
                          {inquiry.name}
                        </h3>
                        <div className="mt-1 flex items-center gap-2 text-slate-600 dark:text-slate-400">
                          <MailIcon className="h-4 w-4" />
                          <span className="text-sm">{inquiry.email}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-slate-500 text-sm dark:text-slate-400">
                        <CalendarIcon className="h-4 w-4" />
                        <span>
                          Submitted{' '}
                          {format(
                            new Date(inquiry.created_at),
                            "MMM d, yyyy 'at' h:mm a"
                          )}
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-3 font-semibold text-lg">
                    <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-900">
                      <MessageSquareIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    Message
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-slate dark:prose-invert max-w-none">
                    <div className="whitespace-pre-wrap text-slate-700 leading-relaxed dark:text-slate-300">
                      {inquiry.message}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {inquiry.images && inquiry.images.length > 0 && (
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-3 font-semibold text-lg">
                      <div className="rounded-lg bg-green-100 p-2 dark:bg-green-900">
                        <ImageIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
                      </div>
                      Attachments
                      <Badge variant="secondary" className="ml-2">
                        {inquiry.images.length}
                      </Badge>
                    </CardTitle>
                    <CardDescription className="text-slate-600 dark:text-slate-400">
                      Click any image to view in full size
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {isLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="text-center">
                          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600 dark:border-slate-600 dark:border-t-slate-300"></div>
                          <p className="text-slate-600 text-sm dark:text-slate-400">
                            Loading images...
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                        {inquiry.images.map((imagePath, index) => {
                          const imageUrl = imageUrls[imagePath];
                          if (!imageUrl) return null;
                          return (
                            <button
                              key={`${inquiry.id}-image-${index}`}
                              type="button"
                              className="group relative aspect-square overflow-hidden rounded-xl border-2 border-slate-200 transition-all duration-200 hover:border-blue-400 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-slate-700"
                              onClick={() => handleImageClick(imagePath)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  handleImageClick(imagePath);
                                }
                              }}
                            >
                              <Image
                                src={
                                  imageUrl ||
                                  '/placeholder.svg?height=300&width=300'
                                }
                                alt={`Attachment ${index + 1}`}
                                className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                                width={300}
                                height={300}
                              />
                              <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/20">
                                <ZoomInIcon className="h-8 w-8 text-white opacity-0 drop-shadow-lg transition-opacity group-hover:opacity-100" />
                              </div>
                              <div className="absolute bottom-2 left-2 rounded-md bg-black/80 px-2 py-1 font-medium text-white text-xs">
                                {index + 1}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {selectedImage && (
        <Dialog open={!!selectedImage} onOpenChange={closeImageViewer}>
          <DialogContent className="max-h-[95vh] max-w-[95vw] overflow-hidden bg-black/95 p-4">
            <DialogHeader className="sr-only">
              <DialogTitle>Image Viewer</DialogTitle>
            </DialogHeader>
            <div className="relative flex h-full items-center justify-center">
              <Image
                src={selectedImage || '/placeholder.svg'}
                alt="Full size attachment"
                className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
                width={1200}
                height={1200}
              />
              <Button
                variant="secondary"
                size="sm"
                className="absolute top-4 right-4 bg-white/90 text-slate-900 shadow-lg hover:bg-white"
                onClick={() => {
                  window.open(selectedImage, '_blank');
                }}
              >
                <ExternalLinkIcon className="mr-2 h-4 w-4" />
                Open in New Tab
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
