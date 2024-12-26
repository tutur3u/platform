'use client';

import CopyLinkButton from './copy-link-button';
import { Button } from '@repo/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@repo/ui/components/ui/dialog';
import { QrCode } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { QRCode } from 'react-qrcode-logo';

export default function ShowQRButton({ url }: { url: string }) {
  const t = useTranslations();

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="w-full md:w-auto" variant="outline" disabled={!url}>
          <QrCode className="mr-1 h-5 w-5" />
          {t('meet-together-plan-details.show_qr_code')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('common.qr_code')}</DialogTitle>
          <DialogDescription>
            {t('meet-together-plan-details.qr_code_description')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-center">
          <QRCode
            value={url}
            size={256}
            style={{
              borderRadius: '0.5rem',
            }}
          />
        </div>

        <DialogFooter>
          <CopyLinkButton url={url} className="md:w-full" />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
