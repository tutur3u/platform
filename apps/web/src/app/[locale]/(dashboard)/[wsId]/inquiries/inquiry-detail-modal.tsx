'use client';

import { createDynamicClient } from '@tuturuuu/supabase/next/client';
import type { Product, SupportType } from '@tuturuuu/types/db';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { format } from 'date-fns';
import {
  CheckCircleIcon,
  ClockIcon,
  ExternalLinkIcon,
  Loader2,
  XIcon,
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
  bug: 'bg-dynamic-red/10 text-dynamic-red border-dynamic-red/20',
  'feature-request':
    'bg-dynamic-blue/10 text-dynamic-blue border-dynamic-blue/20',
  support: 'bg-dynamic-green/10 text-dynamic-green border-dynamic-green/20',
  'job-application':
    'bg-dynamic-purple/10 text-dynamic-purple border-dynamic-purple/20',
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
      <Dialog open={isOpen} onOpenChange={onClose} modal={true}>
        <DialogContent
          showCloseButton={false}
          className="!inset-0 !left-0 !top-0 !max-w-none !translate-x-0 !translate-y-0 !rounded-none data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-bottom-2 data-[state=open]:slide-in-from-bottom-2 flex h-screen max-h-screen w-screen gap-0 border-0 p-0"
        >
          {/* Main content area */}
          <div className="flex min-w-0 flex-1 flex-col bg-background">
            {/* Minimalist Header */}
            <div className="flex items-center justify-between border-b px-4 py-3 md:px-8">
              <DialogTitle className="font-semibold text-foreground text-lg md:text-xl">
                Support Inquiry
              </DialogTitle>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={onClose}
                title="Close (Esc)"
              >
                <XIcon className="h-4 w-4" />
              </Button>
            </div>

            {/* Main scrollable area */}
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              <div className="mx-auto flex h-full min-h-full w-full max-w-4xl flex-col gap-8 p-6 md:p-12">
                {/* Subject - Clean and focused */}
                <div className="space-y-3">
                  <h1 className="font-bold text-2xl text-foreground leading-tight md:text-3xl">
                    {inquiry.subject}
                  </h1>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={`${SUPPORT_TYPE_COLORS[inquiry.type]} border`}
                    >
                      {SUPPORT_TYPE_LABELS[inquiry.type]}
                    </Badge>
                    <Badge variant="outline" className="border-border/60">
                      {PRODUCT_LABELS[inquiry.product]}
                    </Badge>
                    <span className="text-muted-foreground text-sm">•</span>
                    {inquiry.is_resolved ? (
                      <span className="flex items-center gap-1.5 text-dynamic-green text-sm">
                        <CheckCircleIcon className="h-4 w-4" />
                        Resolved
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-dynamic-orange text-sm">
                        <ClockIcon className="h-4 w-4" />
                        Open
                      </span>
                    )}
                    {!inquiry.is_read && (
                      <>
                        <span className="text-muted-foreground text-sm">•</span>
                        <span className="flex items-center gap-1.5 font-medium text-dynamic-red text-sm">
                          Unread
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Submitter Info - Minimal card */}
                <div className="flex items-start gap-4 rounded-lg border bg-muted/20 p-4">
                  {inquiry.users ? (
                    <>
                      <Avatar className="h-12 w-12 shrink-0">
                        <AvatarImage src={inquiry.users.avatar_url || ''} />
                        <AvatarFallback className="bg-gradient-to-br from-dynamic-blue to-dynamic-purple font-semibold text-white">
                          {inquiry.users.display_name?.[0] ||
                            inquiry.users.user_private_details.email?.[0] ||
                            'U'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="font-medium text-foreground">
                          {inquiry.users.display_name || 'Unknown User'}
                        </p>
                        <p className="text-muted-foreground text-sm">
                          {inquiry.users.user_private_details.email}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {format(
                            new Date(inquiry.created_at),
                            'MMM d, yyyy · h:mm a'
                          )}
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <Avatar className="h-12 w-12 shrink-0">
                        <AvatarFallback className="bg-gradient-to-br from-dynamic-blue to-dynamic-purple font-semibold text-white">
                          {inquiry.name[0] || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="font-medium text-foreground">
                          {inquiry.name}
                        </p>
                        <p className="text-muted-foreground text-sm">
                          {inquiry.email}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {format(
                            new Date(inquiry.created_at),
                            'MMM d, yyyy · h:mm a'
                          )}
                        </p>
                      </div>
                    </>
                  )}
                </div>

                {/* Message - Clean display */}
                <div className="space-y-3">
                  <h2 className="font-semibold text-foreground text-sm uppercase tracking-wide">
                    Message
                  </h2>
                  <div className="rounded-lg border bg-background p-4 md:p-6">
                    <p className="whitespace-pre-wrap text-foreground leading-relaxed">
                      {inquiry.message}
                    </p>
                  </div>
                </div>

                {/* Attachments - Functional display */}
                {inquiry.images && inquiry.images.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 className="font-semibold text-foreground text-sm uppercase tracking-wide">
                        Attachments ({inquiry.images.length})
                      </h2>
                    </div>
                    {isLoading ? (
                      <div className="flex items-center justify-center gap-2 rounded-lg border bg-muted/20 py-8">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        <p className="text-muted-foreground text-sm">
                          Loading images...
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                        {inquiry.images.map((imagePath, index) => {
                          const imageUrl = imageUrls[imagePath];
                          if (!imageUrl) return null;
                          return (
                            <button
                              key={`${inquiry.id}-image-${index}`}
                              type="button"
                              className="group relative aspect-square overflow-hidden rounded-lg border bg-muted/50 transition-all hover:border-foreground/20 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-foreground/20"
                              onClick={() => handleImageClick(imagePath)}
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
                              <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/40">
                                <ZoomInIcon className="h-8 w-8 text-white opacity-0 transition-opacity group-hover:opacity-100" />
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Image Viewer Dialog - Enhanced */}
      {selectedImage && (
        <Dialog open={!!selectedImage} onOpenChange={closeImageViewer}>
          <DialogContent className="max-h-[95vh] max-w-[95vw] overflow-hidden bg-black/95 p-4 backdrop-blur-xl">
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
                className="absolute top-4 right-4 bg-dynamic-orange text-white shadow-lg hover:bg-dynamic-orange/90"
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
