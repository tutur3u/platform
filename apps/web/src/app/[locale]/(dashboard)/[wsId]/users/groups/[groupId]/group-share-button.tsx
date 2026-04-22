'use client';

import { CheckCheck, LinkIcon, Share } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Separator } from '@tuturuuu/ui/separator';
import { useTranslations } from 'next-intl';
import { QRCodeCanvas } from 'qrcode.react';
import { useEffect, useState } from 'react';

interface Props {
  groupId: string;
}

export default function GroupShareButton({ groupId }: Props) {
  const t = useTranslations('ws-user-group-details');
  const [isOpen, setIsOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [shareUrl, setShareUrl] = useState('');

  useEffect(() => {
    setShareUrl(
      `${window.location.origin}/share/course/${encodeURIComponent(groupId)}`
    );
  }, [groupId]);

  const handleCopy = async () => {
    if (!shareUrl || copiedLink) return;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch (error) {
      console.error('Failed to copy group share link', error);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setIsOpen(true)}
        className="border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue hover:bg-dynamic-blue/20"
      >
        <Share className="mr-2 h-5 w-5" />
        {t('share')}
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <div className="text-center">
            <DialogHeader className="mb-4">
              <DialogTitle>{t('share')}</DialogTitle>
              <DialogDescription>{t('share_description')}</DialogDescription>
            </DialogHeader>

            {shareUrl && (
              <div className="flex items-center justify-center py-4">
                <QRCodeCanvas
                  value={shareUrl}
                  size={256}
                  marginSize={1}
                  className="rounded-lg border border-dynamic-border bg-background p-2"
                />
              </div>
            )}

            <Separator className="my-4" />

            <div className="grid w-full gap-2">
              <Button
                type="button"
                variant={copiedLink ? 'outline' : 'default'}
                className="w-full"
                onClick={handleCopy}
                disabled={!shareUrl || copiedLink}
              >
                {copiedLink ? (
                  <CheckCheck className="mr-2 h-4 w-4" />
                ) : (
                  <LinkIcon className="mr-2 h-4 w-4" />
                )}
                {copiedLink ? t('link_copied') : t('copy_link')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
