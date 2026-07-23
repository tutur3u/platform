'use client';

import { Loader2 } from '@tuturuuu/icons';
import type { InternalApiEnhancedWorkspaceMember } from '@tuturuuu/types';
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
import { MAX_NAME_LENGTH } from '@tuturuuu/utils/constants';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';

type Props = {
  isSubmitting: boolean;
  member: InternalApiEnhancedWorkspaceMember;
  onOpenChange: (open: boolean) => void;
  onSubmit: (displayName: string | null) => void;
  open: boolean;
};

export function WorkspaceAccessMemberProfileDialog({
  isSubmitting,
  member,
  onOpenChange,
  onSubmit,
  open,
}: Props) {
  const t = useTranslations();
  const [displayName, setDisplayName] = useState(
    member.workspace_profile_display_name ?? member.display_name ?? ''
  );

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(displayName.trim() || null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('ws-members.profile_display_name')}</DialogTitle>
          <DialogDescription>
            {t('ws-members.profile_display_name_description')}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="workspace-member-profile-display-name">
              {t('ws-members.profile_display_name')}
            </Label>
            <Input
              id="workspace-member-profile-display-name"
              autoComplete="off"
              autoFocus
              disabled={isSubmitting}
              maxLength={MAX_NAME_LENGTH}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder={t('ws-members.profile_display_name_placeholder')}
              value={displayName}
            />
          </div>

          <DialogFooter>
            <Button
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              {t('common.cancel')}
            </Button>
            <Button disabled={isSubmitting} type="submit">
              {isSubmitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              {t('ws-members.save_profile_display_name')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
