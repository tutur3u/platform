'use client';

import { Eye, EyeOff, Lock } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Switch } from '@tuturuuu/ui/switch';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface PasswordManagementDialogProps {
  linkId: string;
  isPasswordProtected: boolean;
  passwordHint: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PasswordManagementDialog({
  linkId,
  isPasswordProtected: initialIsProtected,
  passwordHint: initialPasswordHint,
  open,
  onOpenChange,
}: PasswordManagementDialogProps) {
  const router = useRouter();
  const t = useTranslations();
  const [loading, setLoading] = useState(false);
  const [isPasswordProtected, setIsPasswordProtected] = useState(initialIsProtected);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordHint, setPasswordHint] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  const handleSave = async () => {
    setLoading(true);

    try {
      if (!isPasswordProtected) {
        // Remove password protection
        const response = await fetch(`/api/v1/link-shortener/${linkId}/password`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            currentPassword: initialIsProtected ? currentPassword : undefined,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || t('link-shortener.password_removed'));
        }

        toast({
          title: t('common.success'),
          description: t('link-shortener.password_removed'),
        });
      } else {
        // Set or update password
        if (!newPassword || newPassword.length < 4) {
          toast({
            title: t('common.error'),
            description: 'Password must be at least 4 characters',
            variant: 'destructive',
          });
          return;
        }

        const response = await fetch(`/api/v1/link-shortener/${linkId}/password`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            currentPassword: initialIsProtected ? currentPassword : undefined,
            newPassword,
            passwordHint: passwordHint.trim() || undefined,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || t('link-shortener.password_updated'));
        }

        toast({
          title: t('common.success'),
          description: t('link-shortener.password_updated'),
        });
      }

      router.refresh();
      onOpenChange(false);
      
      // Reset form
      setCurrentPassword('');
      setNewPassword('');
      setPasswordHint('');
    } catch (error) {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      // Reset form when closing
      setIsPasswordProtected(initialIsProtected);
      setCurrentPassword('');
      setNewPassword('');
      setPasswordHint('');
      setShowCurrentPassword(false);
      setShowNewPassword(false);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            {t('link-shortener.manage_password')}
          </DialogTitle>
          <DialogDescription>
            {initialIsProtected
              ? 'Update or remove password protection for this link'
              : 'Add password protection to this link'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="password-toggle" className="font-semibold text-sm">
              {t('link-shortener.password_protection')}
            </Label>
            <Switch
              id="password-toggle"
              checked={isPasswordProtected}
              onCheckedChange={setIsPasswordProtected}
              disabled={loading}
            />
          </div>

          {isPasswordProtected && (
            <div className="space-y-4 rounded-lg border border-border/40 bg-muted/30 p-4">
              {initialIsProtected && initialPasswordHint && (
                <div className="rounded-md bg-blue-50 p-3 dark:bg-blue-950/30">
                  <p className="text-blue-700 text-sm dark:text-blue-300">
                    <span className="font-medium">Current hint:</span> {initialPasswordHint}
                  </p>
                </div>
              )}

              {initialIsProtected && (
                <div className="space-y-2">
                  <Label htmlFor="current-password" className="text-sm">
                    {t('link-shortener.current_password')} *
                  </Label>
                  <div className="relative">
                    <Input
                      id="current-password"
                      type={showCurrentPassword ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password"
                      disabled={loading}
                      required
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute inset-y-0 right-0 flex h-full items-center px-3 text-muted-foreground hover:text-foreground"
                      tabIndex={-1}
                    >
                      {showCurrentPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="new-password" className="text-sm">
                  {initialIsProtected ? t('link-shortener.new_password') : t('link-shortener.password')} *
                </Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={t('link-shortener.enter_password')}
                    disabled={loading}
                    required
                    minLength={4}
                    maxLength={100}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute inset-y-0 right-0 flex h-full items-center px-3 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showNewPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password-hint" className="text-sm">
                  {t('link-shortener.password_hint_optional')}
                </Label>
                <Input
                  id="password-hint"
                  type="text"
                  value={passwordHint}
                  onChange={(e) => setPasswordHint(e.target.value)}
                  placeholder={t('link-shortener.password_hint_description')}
                  disabled={loading}
                  maxLength={200}
                />
              </div>
            </div>
          )}

          {!isPasswordProtected && initialIsProtected && (
            <div className="space-y-2 rounded-lg border border-border/40 bg-muted/30 p-4">
              <Label htmlFor="remove-password" className="text-sm">
                {t('link-shortener.current_password')} *
              </Label>
              <div className="relative">
                <Input
                  id="remove-password"
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password to remove protection"
                  disabled={loading}
                  required
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute inset-y-0 right-0 flex h-full items-center px-3 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showCurrentPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={loading}
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={loading || (isPasswordProtected && !newPassword) || (initialIsProtected && !currentPassword)}
          >
            {loading ? t('common.saving') : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
