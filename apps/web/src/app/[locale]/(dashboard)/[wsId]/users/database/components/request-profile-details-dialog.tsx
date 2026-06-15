'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Info, Loader2 } from '@tuturuuu/icons';
import {
  createWorkspaceUserProfileLink,
  type WorkspaceUserProfileLinkField,
} from '@tuturuuu/internal-api/users';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

const FIELD_OPTIONS: WorkspaceUserProfileLinkField[] = [
  'display_name',
  'full_name',
  'birthday',
  'gender',
  'avatar_url',
  'email',
  'phone',
];

function HelpTooltip({ label }: { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex text-muted-foreground">
          <Info className="h-3.5 w-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p>{label}</p>
      </TooltipContent>
    </Tooltip>
  );
}

interface Props {
  wsId: string;
  mode: 'per_user' | 'generic';
  targetUserId?: string;
  targetUserLabel?: string | null;
  /** Current value of each requestable field, shown to the admin so they can
   * decide which details still need to be collected (per-user mode only). */
  currentValues?: Partial<
    Record<WorkspaceUserProfileLinkField, string | null | undefined>
  >;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RequestProfileDetailsDialog({
  wsId,
  mode,
  targetUserId,
  targetUserLabel,
  currentValues,
  open,
  onOpenChange,
}: Props) {
  const t = useTranslations('ws-user-profile-links');
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<WorkspaceUserProfileLinkField[]>([
    'display_name',
    'full_name',
  ]);
  const [prefillExistingValues, setPrefillExistingValues] = useState(true);
  const [expiresAt, setExpiresAt] = useState('');
  const [maxUses, setMaxUses] = useState('1');
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const toggleField = (
    field: WorkspaceUserProfileLinkField,
    checked: boolean
  ) =>
    setSelected((prev) =>
      checked ? [...prev, field] : prev.filter((f) => f !== field)
    );

  const reset = () => {
    setSelected(['display_name', 'full_name']);
    setPrefillExistingValues(true);
    setExpiresAt('');
    setMaxUses('1');
    setShareUrl(null);
    setCopied(false);
  };

  const createMutation = useMutation({
    mutationFn: () =>
      createWorkspaceUserProfileLink(wsId, {
        mode,
        target_user_id: mode === 'per_user' ? targetUserId : null,
        allowed_fields: selected,
        prefill_existing_values: prefillExistingValues,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        max_uses: maxUses ? Number.parseInt(maxUses, 10) : null,
      }),
    onSuccess: ({ code }) => {
      setShareUrl(`${window.location.origin}/shared/user-profile/${code}`);
      queryClient.invalidateQueries({
        queryKey: ['workspace-user-profile-links', wsId],
      });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('create_error')),
  });

  const showCurrentValues = mode === 'per_user' && !!currentValues;

  const formatCurrentValue = (
    field: WorkspaceUserProfileLinkField,
    value: string | null | undefined
  ): string | null => {
    if (value == null || value === '') return null;
    // Avatar values are long URLs; show a presence indicator instead.
    if (field === 'avatar_url') return t('current_value_image_set');
    return String(value);
  };

  const copyLink = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast.success(t('link_copied'));
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === 'generic' ? t('create_generic_title') : t('create_title')}
          </DialogTitle>
          <DialogDescription>{t('create_description')}</DialogDescription>
        </DialogHeader>

        {shareUrl ? (
          <div className="space-y-3">
            <p className="text-muted-foreground text-sm">
              {t('create_success_hint')}
            </p>
            <div className="flex items-center gap-2">
              <Input readOnly value={shareUrl} />
              <Button type="button" size="icon" onClick={copyLink}>
                {copied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {mode === 'per_user' && targetUserLabel ? (
              <div className="rounded-lg border bg-muted/30 px-3 py-2">
                <p className="text-muted-foreground text-xs">
                  {t('create_target_user_label')}
                </p>
                <p className="font-medium text-sm">{targetUserLabel}</p>
              </div>
            ) : null}

            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label>{t('create_fields_label')}</Label>
                <HelpTooltip label={t('create_fields_tooltip')} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {FIELD_OPTIONS.map((field) => {
                  const currentValue = showCurrentValues
                    ? formatCurrentValue(field, currentValues?.[field])
                    : null;
                  return (
                    <label
                      key={field}
                      className={cn(
                        'flex gap-2 text-sm',
                        showCurrentValues
                          ? 'items-start rounded-md border p-2'
                          : 'items-center'
                      )}
                    >
                      <Checkbox
                        className={showCurrentValues ? 'mt-0.5' : undefined}
                        checked={selected.includes(field)}
                        onCheckedChange={(checked) =>
                          toggleField(field, checked === true)
                        }
                      />
                      <span className="flex min-w-0 flex-col">
                        <span>{t(`field_${field}` as never)}</span>
                        {showCurrentValues ? (
                          <span
                            className={cn(
                              'truncate text-xs',
                              currentValue
                                ? 'text-muted-foreground'
                                : 'text-dynamic-orange/80'
                            )}
                            title={currentValue ?? undefined}
                          >
                            {currentValue ?? t('target_empty_value')}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  );
                })}
              </div>
              {selected.includes('email') ? (
                <p className="text-muted-foreground text-xs">
                  {t('create_email_hint')}
                </p>
              ) : null}
            </div>

            {mode === 'per_user' ? (
              <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="prefill_existing_values">
                      {t('create_prefill_existing_values')}
                    </Label>
                    <HelpTooltip
                      label={t('create_prefill_existing_values_tooltip')}
                    />
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {t('create_prefill_existing_values_description')}
                  </p>
                </div>
                <Switch
                  id="prefill_existing_values"
                  checked={prefillExistingValues}
                  onCheckedChange={setPrefillExistingValues}
                />
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="expires_at">{t('create_expires_at')}</Label>
                <Input
                  id="expires_at"
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="max_uses">{t('create_max_uses')}</Label>
                <Input
                  id="max_uses"
                  type="number"
                  min={1}
                  value={maxUses}
                  onChange={(e) => setMaxUses(e.target.value)}
                />
              </div>
            </div>

            <Button
              className="w-full"
              disabled={selected.length === 0 || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {t('create_submit')}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
