'use client';

import { useMutation } from '@tanstack/react-query';
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
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
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
  const [isPasswordProtected, setIsPasswordProtected] =
    useState(initialIsProtected);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordHint, setPasswordHint] = useState(initialPasswordHint || '');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  const resetForm = () => {
    setCurrentPassword('');
    setNewPassword('');
    setPasswordHint('');
  };

  const removePasswordMutation = useMutation({
    mutationFn: async (currentPassword?: string) => {
      const response = await fetch(
        `/api/v1/link-shortener/${linkId}/password`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            currentPassword: initialIsProtected ? currentPassword : undefined,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || t('link-shortener.password_removed'));
      }

      return data;
    },
    onSuccess: () => {
      toast.success(t('link-shortener.password_removed'));

      router.refresh();
      onOpenChange(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast.error(error.message || t('link-shortener.error_occurred'));
    },
  });

  const updatePasswordMutation = useMutation({
    mutationFn: async (requestBody: {
      currentPassword?: string;
      newPassword?: string;
      passwordHint?: string;
    }) => {
      const response = await fetch(
        `/api/v1/link-shortener/${linkId}/password`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || t('link-shortener.error_occurred'));
      }

      return data;
    },
    onSuccess: () => {
      toast.success(t('link-shortener.password_updated'));
      router.refresh();
      onOpenChange(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast.error(error.message || t('link-shortener.error_occurred'));
    },
  });

  const handleSave = () => {
    if (!isPasswordProtected) {
      // Remove password protection
      removePasswordMutation.mutate(currentPassword);
    } else {
      // Set or update password/hint
      // Build request body dynamically - only include fields that are being updated
      const requestBody: {
        currentPassword?: string;
        newPassword?: string;
        passwordHint?: string;
      } = {};

      // Include current password if link is already protected
      if (initialIsProtected) {
        requestBody.currentPassword = currentPassword;
      }

      // Include new password if provided
      if (newPassword) {
        if (newPassword.length < 4) {
          toast.error(t('link-shortener.password_min_length'));
          return;
        }
        requestBody.newPassword = newPassword;
      }

      // Include password hint if it has been modified (including clearing it)
      if (passwordHint !== initialPasswordHint) {
        requestBody.passwordHint = passwordHint.trim();
      }

      // For new password protection, password is required
      if (!initialIsProtected && !newPassword) {
        toast.error(t('link-shortener.password_required_for_protection'));
        return;
      }

      // For updates, ensure at least one field is being changed
      if (
        initialIsProtected &&
        !requestBody.newPassword &&
        requestBody.passwordHint === undefined
      ) {
        toast.error(t('link-shortener.no_changes_to_save'));
        return;
      }

      updatePasswordMutation.mutate(requestBody);
    }
  };

  const loading =
    removePasswordMutation.isPending || updatePasswordMutation.isPending;

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
              ? t('link-shortener.update_or_remove_password_description')
              : t('link-shortener.add_password_description')}
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
                <div className="rounded-md bg-dynamic-blue/50 p-3 dark:bg-dynamic-blue/30">
                  <p className="text-dynamic-blue/70 text-sm">
                    <span className="font-medium">
                      {t('link-shortener.current_hint')}:
                    </span>{' '}
                    {initialPasswordHint}
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
                      placeholder={t('link-shortener.enter_current_password')}
                      disabled={loading}
                      required
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setShowCurrentPassword(!showCurrentPassword)
                      }
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
                  {initialIsProtected
                    ? t('link-shortener.new_password')
                    : t('link-shortener.password')}
                  {!initialIsProtected && ' *'}
                </Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={
                      initialIsProtected
                        ? t('link-shortener.leave_blank_keep_password')
                        : t('link-shortener.enter_password')
                    }
                    disabled={loading}
                    required={!initialIsProtected}
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
                  placeholder={t(
                    'link-shortener.enter_current_password_to_remove'
                  )}
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
            disabled={
              loading ||
              (!isPasswordProtected &&
                initialIsProtected &&
                !currentPassword) ||
              (isPasswordProtected && !initialIsProtected && !newPassword) ||
              (isPasswordProtected && initialIsProtected && !currentPassword)
            }
          >
            {loading ? t('common.saving') : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
