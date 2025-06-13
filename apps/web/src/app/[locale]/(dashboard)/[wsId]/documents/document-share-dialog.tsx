import { BASE_URL } from '@/constants/common';
import { Button } from '@ncthub/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@ncthub/ui/dialog';
import {
  Check,
  CheckCheck,
  ExternalLink,
  Globe,
  LinkIcon,
  Lock,
} from '@ncthub/ui/icons';
import { Separator } from '@ncthub/ui/separator';
import { QRCodeCanvas } from 'qrcode.react';
import React, { useState } from 'react';

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
                <QRCodeCanvas
                  value={publicLink}
                  size={256}
                  marginSize={2}
                  className="rounded-lg"
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
