'use client';

import { Loader2, Mail, Share2, UserPlus, Users, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useId, useState } from 'react';

interface TemplateShare {
  id: string;
  user_id: string | null;
  email: string | null;
  permission: string;
  created_at: string;
}

interface ShareTemplateDialogProps {
  wsId: string;
  templateId: string;
  isOwner: boolean;
  visibility: 'private' | 'workspace' | 'public';
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareTemplateDialog({
  wsId,
  templateId,
  isOwner,
  visibility,
  open,
  onOpenChange,
}: ShareTemplateDialogProps) {
  const t = useTranslations('ws-board-templates');

  const [shares, setShares] = useState<TemplateShare[]>([]);
  const [isLoadingShares, setIsLoadingShares] = useState(false);
  const [isAddingShare, setIsAddingShare] = useState(false);
  const [isDeletingShare, setIsDeletingShare] = useState<string | null>(null);
  const [shareEmail, setShareEmail] = useState('');

  const shareEmailId = useId();

  // Fetch shares when dialog opens (only for private templates owned by user)
  const fetchShares = useCallback(async () => {
    if (!isOwner || visibility !== 'private') return;

    setIsLoadingShares(true);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/templates/${templateId}/shares`
      );

      if (response.ok) {
        const data = await response.json();
        setShares(data.shares || []);
      }
    } catch (error) {
      console.error('Error fetching shares:', error);
    } finally {
      setIsLoadingShares(false);
    }
  }, [wsId, templateId, isOwner, visibility]);

  useEffect(() => {
    if (open) {
      fetchShares();
    }
  }, [open, fetchShares]);

  const handleAddShare = async () => {
    if (!shareEmail.trim()) {
      toast.error(t('share.email_required'));
      return;
    }

    // Basic email validation
    if (!shareEmail.includes('@')) {
      toast.error(t('share.invalid_email'));
      return;
    }

    setIsAddingShare(true);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/templates/${templateId}/shares`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: shareEmail.trim().toLowerCase() }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to share template');
      }

      toast.success(t('share.add_success'));
      setShareEmail('');
      fetchShares();
    } catch (error) {
      console.error('Error adding share:', error);
      toast.error(
        error instanceof Error ? error.message : t('share.add_error')
      );
    } finally {
      setIsAddingShare(false);
    }
  };

  const handleRemoveShare = async (shareId: string) => {
    setIsDeletingShare(shareId);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/templates/${templateId}/shares?shareId=${shareId}`,
        {
          method: 'DELETE',
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to remove share');
      }

      toast.success(t('share.remove_success'));
      setShares((prev) => prev.filter((s) => s.id !== shareId));
    } catch (error) {
      console.error('Error removing share:', error);
      toast.error(
        error instanceof Error ? error.message : t('share.remove_error')
      );
    } finally {
      setIsDeletingShare(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            {t('share.dialog_title')}
          </DialogTitle>
          <DialogDescription>{t('share.dialog_description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Add new share */}
          <div className="space-y-2">
            <Label htmlFor={shareEmailId}>{t('share.email_label')}</Label>
            <div className="flex gap-2">
              <Input
                id={shareEmailId}
                type="email"
                value={shareEmail}
                onChange={(e) => setShareEmail(e.target.value)}
                placeholder={t('share.email_placeholder')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddShare();
                  }
                }}
                disabled={isAddingShare}
              />
              <Button
                onClick={handleAddShare}
                disabled={isAddingShare || !shareEmail.trim()}
              >
                {isAddingShare ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              {t('share.email_hint')}
            </p>
          </div>

          <Separator />

          {/* Existing shares */}
          <div className="space-y-2">
            <Label>{t('share.shared_with')}</Label>
            {isLoadingShares ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : shares.length === 0 ? (
              <div className="rounded-md bg-muted/50 py-6 text-center">
                <Users className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
                <p className="text-muted-foreground text-sm">
                  {t('share.no_shares')}
                </p>
              </div>
            ) : (
              <div className="max-h-48 space-y-2 overflow-y-auto">
                {shares.map((share) => (
                  <div
                    key={share.id}
                    className="flex items-center justify-between rounded-md bg-muted/50 p-2"
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                        <Mail className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm">
                          {share.email || share.user_id}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {t('share.view_access')}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveShare(share.id)}
                      disabled={isDeletingShare === share.id}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-dynamic-red"
                    >
                      {isDeletingShare === share.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <X className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
