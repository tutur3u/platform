import { BASE_URL } from '@/constants/common';
import { Button } from '@tutur3u/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tutur3u/ui/components/ui/dialog';
import { Separator } from '@tutur3u/ui/components/ui/separator';
import {
  Check,
  CheckCheck,
  ExternalLink,
  Globe,
  LinkIcon,
  Lock,
} from 'lucide-react';
import React, { useState } from 'react';
import { QRCode } from 'react-qrcode-logo';

interface DocumentShareDialogProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: string;
  isPublic: boolean;
  onUpdateVisibility: (isPublic: boolean) => Promise<void>;
}

const DocumentShareDialog: React.FC<DocumentShareDialogProps> = ({
  isOpen,
  onClose,
  documentId,
  isPublic,
  onUpdateVisibility,
}) => {
  const [updating, setUpdating] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const handleVisibilityChange = async (newIsPublic: boolean) => {
    setUpdating(true);
    await onUpdateVisibility(newIsPublic);
    setCopiedLink(false);
    setUpdating(false);
  };

  const publicLink = `${BASE_URL}/documents/${documentId}`;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <div className="text-center">
          <DialogHeader className="mb-4">
            <DialogTitle>Share document</DialogTitle>
            <DialogDescription></DialogDescription>
          </DialogHeader>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => handleVisibilityChange(true)}
              disabled={isPublic}
            >
              {isPublic ? (
                <Check className="mr-2 h-4 w-4" />
              ) : updating ? (
                <span className="mr-2 h-4 w-4 animate-spin">⏳</span>
              ) : (
                <Globe className="mr-2 h-4 w-4" />
              )}
              <div className="line-clamp-1">Public</div>
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => handleVisibilityChange(false)}
              disabled={!isPublic}
            >
              {!isPublic ? (
                <Check className="mr-2 h-4 w-4" />
              ) : updating ? (
                <span className="mr-2 h-4 w-4 animate-spin">⏳</span>
              ) : (
                <Lock className="mr-2 h-4 w-4" />
              )}
              <div className="line-clamp-1">Only me</div>
            </Button>
          </div>

          {isPublic && (
            <>
              <Separator className="my-4" />
              <div className="flex items-center justify-center">
                <QRCode
                  value={publicLink}
                  size={256}
                  style={{
                    borderRadius: '0.5rem',
                  }}
                />
              </div>
            </>
          )}

          <Separator className="my-4" />

          <div className="grid w-full gap-2">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => {
                navigator.clipboard.writeText(publicLink);
                setCopiedLink(true);
                setTimeout(() => setCopiedLink(false), 2000);
              }}
              disabled={!isPublic || copiedLink}
            >
              {copiedLink ? (
                <CheckCheck className="mr-2 h-4 w-4" />
              ) : (
                <LinkIcon className="mr-2 h-4 w-4" />
              )}
              Copy public link
            </Button>
            <Button
              type="button"
              className="w-full"
              onClick={() => window.open(publicLink)}
              disabled={!isPublic}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Open public link
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DocumentShareDialog;
