'use client';

import { Lock } from '@tuturuuu/icons';
import useSearchParams from '@tuturuuu/ui/hooks/useSearchParams';
import { Label } from '@tuturuuu/ui/label';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useState } from 'react';

interface ConfidentialToggleProps {
  hasPermission: boolean;
}

export default function ConfidentialToggle({
  hasPermission,
}: ConfidentialToggleProps) {
  const t = useTranslations('finance-overview');
  const { getSingle, set, remove } = useSearchParams();
  const includeConfidential = getSingle('includeConfidential') !== 'false'; // Default to true
  const id = useId();
  const switchId = `${id}-switch`;
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (loading) setLoading(false);
  }, [loading]);

  const handleToggle = (checked: boolean) => {
    if (!hasPermission) return;

    setLoading(true);

    if (checked) {
      // Include confidential (default behavior)
      remove('includeConfidential');
    } else {
      // Exclude confidential
      set({ includeConfidential: 'false' }, false);
    }
  };

  // Don't show toggle if user doesn't have permission
  if (!hasPermission) return null;

  // A settings-style row: the explanation is visible text (not a hover-only
  // tooltip), so keyboard and touch users get it and the switch announces it.
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-lg border border-dynamic-orange/20 bg-dynamic-orange/5 p-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-dynamic-orange/10 text-dynamic-orange">
          <Lock className="size-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 space-y-0.5">
          <p id={titleId} className="font-medium text-foreground text-sm">
            {t('confidential-mode')}
          </p>
          <p id={descriptionId} className="text-muted-foreground text-xs">
            {t('confidential-mode-tooltip')}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2">
        <Label htmlFor={switchId} className="text-muted-foreground">
          {includeConfidential
            ? t('include-confidential')
            : t('exclude-confidential')}
        </Label>
        <Switch
          id={switchId}
          checked={includeConfidential}
          onCheckedChange={handleToggle}
          disabled={loading}
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
        />
      </div>
    </div>
  );
}
