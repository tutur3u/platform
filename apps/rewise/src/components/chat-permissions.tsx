import { Copy, QrCode } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Label } from '@tuturuuu/ui/label';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import { QRCodeCanvas } from 'qrcode.react';
import { useState } from 'react';
import { TTR_URL } from '@/constants/common';

interface ChatPermissionsProps {
  chatId: string;
  isPublic: boolean;
  creatorId: string;
  currentUserId?: string;

  onUpdateVisibility: (isPublic: boolean) => void;
}

export function ChatPermissions({
  chatId,
  isPublic,
  creatorId,
  currentUserId,
  onUpdateVisibility,
}: ChatPermissionsProps) {
  const t = useTranslations('ai_chat');
  const [showQR, setShowQR] = useState(false);

  const isOwner = currentUserId === creatorId;
  const chatUrl = `${TTR_URL}/ai/chats/${chatId}`;

  const copyLink = async () => {
    await navigator.clipboard.writeText(chatUrl);
    toast({
      title: t('copy_public_link'),
      description: chatUrl,
    });
  };

  if (!isOwner) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label htmlFor="public" className="font-medium">
          {t('chat_visibility')}
        </Label>
        <Switch
          id="public"
          checked={isPublic}
          onCheckedChange={onUpdateVisibility}
        />
      </div>

      {isPublic && (
        <div className="flex items-center gap-2">
          <Button variant="outline" className="flex-1" onClick={copyLink}>
            <Copy className="mr-2 h-4 w-4" />
            {t('copy_public_link')}
          </Button>
          <Button variant="outline" size="icon" onClick={() => setShowQR(true)}>
            <QrCode className="h-4 w-4" />
          </Button>
        </div>
      )}

      <Dialog open={showQR} onOpenChange={setShowQR}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('chat_visibility')}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4">
            <QRCodeCanvas
              value={chatUrl}
              size={256}
              marginSize={2}
              className="rounded-lg"
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
