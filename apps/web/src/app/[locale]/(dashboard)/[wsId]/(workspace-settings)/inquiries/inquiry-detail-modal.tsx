'use client';

import {
  CheckCircleIcon,
  ClockIcon,
  ExternalLinkIcon,
  Loader2,
  PlayIcon,
  XIcon,
  ZoomInIcon,
} from '@tuturuuu/icons';
import { createDynamicClient } from '@tuturuuu/supabase/next/client';
import type { Product, SupportType } from '@tuturuuu/types';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';
import { format } from 'date-fns';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExtendedSupportInquiry } from './page';

// Helper function to determine if a file is a video based on extension
function isVideoFile(filename: string): boolean {
  const videoExtensions = ['.mp4', '.webm', '.mov'];
  return videoExtensions.some((ext) => filename.toLowerCase().endsWith(ext));
}

// Custom hook for generating signed URLs for media files (images and videos)
function useSignedMediaUrls(
  inquiryId: string,
  mediaFiles: string[] | null
): {
  mediaUrls: Record<string, string>;
  isLoading: boolean;
} {
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const supabase = createDynamicClient();

  const generateSignedUrls = useCallback(async () => {
    if (!mediaFiles || mediaFiles.length === 0) {
      setMediaUrls({});
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const urls: Record<string, string> = {};

    for (const mediaPath of mediaFiles) {
      try {
        const { data, error } = await supabase.storage
          .from('support_inquiries')
          .createSignedUrl(`${inquiryId}/${mediaPath}`, 300); // 5 minutes = 300 seconds

        if (data?.signedUrl && !error) {
          urls[mediaPath] = data.signedUrl;
        }
      } catch (error) {
        console.error(
          'Error generating signed URL for media:',
          mediaPath,
          error
        );
      }
    }

    setMediaUrls(urls);
    setIsLoading(false);
  }, [mediaFiles, supabase, inquiryId]);

  // Generate URLs when media files change
  useEffect(() => {
    generateSignedUrls();
  }, [generateSignedUrls]);

  return { mediaUrls, isLoading };
}

interface InquiryDetailModalProps {
  inquiry: ExtendedSupportInquiry;
  isOpen: boolean;
  onClose: () => void;
  onUpdate?: () => void;
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

export function InquiryDetailModal({
  inquiry,
  isOpen,
  onClose,
  onUpdate,
}: InquiryDetailModalProps) {
  const router = useRouter();
  const [selectedMedia, setSelectedMedia] = useState<{
    url: string;
    isVideo: boolean;
  } | null>(null);
  const [isResolvingUpdating, setIsResolvingUpdating] = useState(false);
  const hasMarkedAsRead = useRef(false);

  const inquiryId = inquiry.id;
  const { mediaUrls, isLoading } = useSignedMediaUrls(
    inquiryId,
    inquiry.images
  );

  const updateInquiry = useCallback(
    async (
      updates: { is_read?: boolean; is_resolved?: boolean },
      showToast = true
    ) => {
      const isResolvingUpdate = updates.is_resolved !== undefined;
      if (isResolvingUpdate) {
        setIsResolvingUpdating(true);
      }

      try {
        const response = await fetch(`/api/v1/inquiries/${inquiry.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        });

        if (!response.ok) {
          throw new Error('Failed to update inquiry');
        }

        if (showToast) {
          toast.success('Inquiry updated successfully');
        }
        onUpdate?.();
        router.refresh();
      } catch (error) {
        console.error('Error updating inquiry:', error);
        if (showToast) {
          toast.error('Failed to update inquiry');
        }
      } finally {
        if (isResolvingUpdate) {
          setIsResolvingUpdating(false);
        }
      }
    },
    [inquiry.id, onUpdate, router]
  );

  // Mark as read when modal opens (only once)
  useEffect(() => {
    if (isOpen && !inquiry.is_read && !hasMarkedAsRead.current) {
      hasMarkedAsRead.current = true;
      updateInquiry({ is_read: true }, false); // Don't show toast for auto-read
    }

    // Reset the ref when modal closes
    if (!isOpen) {
      hasMarkedAsRead.current = false;
    }
  }, [isOpen, inquiry.is_read, updateInquiry]);

  const handleResolve = async () => {
    await updateInquiry({ is_resolved: true });
    onClose();
  };

  const handleReopen = () => {
    updateInquiry({ is_resolved: false });
  };

  const handleMediaClick = (mediaPath: string) => {
    const signedUrl = mediaUrls[mediaPath];
    if (signedUrl) {
      setSelectedMedia({
        url: signedUrl,
        isVideo: isVideoFile(mediaPath),
      });
    }
  };

  const closeMediaViewer = () => {
    setSelectedMedia(null);
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose} modal={true}>
        <DialogContent
          showCloseButton={false}
          className="data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-bottom-2 data-[state=open]:slide-in-from-bottom-2 inset-0! top-0! left-0! flex h-screen max-h-screen w-screen max-w-none! translate-x-0! translate-y-0! gap-0 rounded-none! border-0 p-0"
        >
          {/* Main content area */}
          <div className="flex min-w-0 flex-1 flex-col bg-background">
            {/* Header with Actions */}
            <div className="flex items-center justify-between gap-4 border-b px-4 py-3 md:px-8">
              <DialogTitle className="font-semibold text-foreground text-lg md:text-xl">
                Support Inquiry
              </DialogTitle>
              <div className="flex items-center gap-2">
                {inquiry.is_resolved ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleReopen}
                    disabled={isResolvingUpdating}
                    className="transition-all hover:border-dynamic-orange/50 hover:bg-dynamic-orange/5"
                  >
                    {isResolvingUpdating ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <ClockIcon className="mr-2 h-4 w-4" />
                    )}
                    Reopen
                  </Button>
                ) : (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleResolve}
                    disabled={isResolvingUpdating}
                  >
                    {isResolvingUpdating ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircleIcon className="mr-2 h-4 w-4" />
                    )}
                    Mark as Resolved
                  </Button>
                )}
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
                        <AvatarFallback className="bg-linear-to-br from-dynamic-blue to-dynamic-purple font-semibold text-white">
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
                        <AvatarFallback className="bg-linear-to-br from-dynamic-blue to-dynamic-purple font-semibold text-white">
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
                          Loading media...
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                        {inquiry.images.map((mediaPath, index) => {
                          const mediaUrl = mediaUrls[mediaPath];
                          if (!mediaUrl) return null;

                          const isVideo = isVideoFile(mediaPath);

                          return (
                            <button
                              key={`${inquiry.id}-media-${index}`}
                              type="button"
                              className="group relative aspect-square overflow-hidden rounded-lg border bg-muted/50 transition-all hover:border-foreground/20 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-dynamic-blue/50"
                              onClick={() => handleMediaClick(mediaPath)}
                            >
                              {isVideo ? (
                                <>
                                  <video
                                    src={mediaUrl}
                                    className="h-full w-full object-cover"
                                    muted
                                    playsInline
                                  />
                                  {/* Video indicator badge */}
                                  <div className="absolute top-2 right-2 rounded bg-black/70 px-2 py-1 backdrop-blur-sm">
                                    <span className="font-medium text-white text-xs">
                                      VIDEO
                                    </span>
                                  </div>
                                </>
                              ) : (
                                <Image
                                  src={
                                    mediaUrl ||
                                    '/placeholder.svg?height=300&width=300'
                                  }
                                  alt={`Attachment ${index + 1}`}
                                  className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                                  width={300}
                                  height={300}
                                />
                              )}
                              {/* Hover overlay with icon */}
                              <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/50">
                                {isVideo ? (
                                  <div className="flex flex-col items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90">
                                      <PlayIcon className="ml-0.5 h-6 w-6 text-black" />
                                    </div>
                                    <span className="font-medium text-white text-xs">
                                      Play Video
                                    </span>
                                  </div>
                                ) : (
                                  <ZoomInIcon className="h-8 w-8 text-white opacity-0 transition-opacity group-hover:opacity-100" />
                                )}
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

      {/* Media Viewer Dialog - Enhanced */}
      {selectedMedia && (
        <Dialog open={!!selectedMedia} onOpenChange={closeMediaViewer}>
          <DialogContent className="h-screen max-h-screen w-screen max-w-none overflow-hidden border-0 bg-black/98 p-0 backdrop-blur-xl">
            <DialogHeader className="sr-only">
              <DialogTitle>Media Viewer</DialogTitle>
            </DialogHeader>

            {/* Close button */}
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-4 right-4 z-50 h-10 w-10 rounded-full bg-white/10 text-white backdrop-blur-md transition-all hover:bg-white/20 hover:text-white"
              onClick={closeMediaViewer}
            >
              <XIcon className="h-5 w-5" />
            </Button>

            {/* Open in new tab button */}
            <Button
              variant="secondary"
              size="sm"
              className="absolute top-4 left-4 z-50 bg-white/10 text-white shadow-lg backdrop-blur-md hover:bg-white/20"
              onClick={() => {
                window.open(selectedMedia.url, '_blank');
              }}
            >
              <ExternalLinkIcon className="mr-2 h-4 w-4" />
              Open in New Tab
            </Button>

            <div className="relative flex h-full w-full items-center justify-center p-4 md:p-8">
              {selectedMedia.isVideo ? (
                <div className="relative w-full max-w-7xl">
                  {/* Video badge */}
                  <div className="mb-4 flex items-center gap-2">
                    <div className="rounded-full bg-dynamic-red/20 px-3 py-1 backdrop-blur-sm">
                      <span className="flex items-center gap-1.5 font-medium text-dynamic-red text-sm">
                        <PlayIcon className="h-4 w-4" />
                        Video Attachment
                      </span>
                    </div>
                  </div>

                  {/* Video player */}
                  <video
                    src={selectedMedia.url}
                    className="w-full rounded-lg shadow-2xl ring-1 ring-white/10"
                    controls
                    autoPlay
                    playsInline
                    controlsList="nodownload"
                    style={{
                      maxHeight: 'calc(100vh - 180px)',
                    }}
                  >
                    <track
                      kind="captions"
                      srcLang="en"
                      label="English captions"
                    />
                  </video>

                  {/* Video info */}
                  <div className="mt-4 rounded-lg bg-white/5 p-4 backdrop-blur-sm">
                    <p className="text-center text-muted-foreground text-sm">
                      Use the video controls to play, pause, adjust volume, or
                      view fullscreen
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex max-h-full max-w-full flex-col items-center gap-4">
                  <Image
                    src={selectedMedia.url || '/placeholder.svg'}
                    alt="Full size attachment"
                    className="max-h-[calc(100vh-120px)] max-w-full rounded-lg object-contain shadow-2xl ring-1 ring-white/10"
                    width={1920}
                    height={1080}
                  />
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
