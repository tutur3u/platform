'use client';

import { QrCode } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { useTranslations } from 'next-intl';
import { QRCodeCanvas } from 'qrcode.react';
import CopyLinkButton, { generateTumeetMeUrl } from './copy-link-button';

export default function ShowQRButton({ url }: { url: string }) {
  const t = useTranslations();
  const tumeetMeUrl = generateTumeetMeUrl(url);

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
          <QRCodeCanvas
            value={tumeetMeUrl}
            size={256}
            marginSize={2}
            className="rounded-lg"
          />
        </div>

        <DialogFooter>
          <CopyLinkButton url={tumeetMeUrl} className="md:w-full" />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
