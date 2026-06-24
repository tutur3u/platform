'use client';

import { Eye, EyeOff } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';

export function MobileDeploymentSecretValueField({
  isSecret,
  onShowValueChange,
  onValueChange,
  options,
  pending,
  showValue,
  value,
}: {
  isSecret: boolean;
  onShowValueChange: (value: boolean) => void;
  onValueChange: (value: string) => void;
  options?: readonly string[];
  pending: boolean;
  showValue: boolean;
  value: string;
}) {
  const t = useTranslations('mobile-deployment-settings');

  if (options?.length) {
    return (
      <Select disabled={pending} onValueChange={onValueChange} value={value}>
        <SelectTrigger id="mobile-deployment-secret-value">
          <SelectValue placeholder={t('selectValue')} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <div className="relative">
      <Input
        autoComplete="off"
        className="pr-10"
        disabled={pending}
        id="mobile-deployment-secret-value"
        onChange={(event) => onValueChange(event.target.value)}
        placeholder={t('secretValuePlaceholder')}
        type={showValue || !isSecret ? 'text' : 'password'}
        value={value}
      />
      <Button
        aria-label={showValue ? t('hideSecretValue') : t('showSecretValue')}
        aria-pressed={showValue}
        className="absolute top-0 right-0 h-full px-3"
        disabled={pending}
        onClick={() => onShowValueChange(!showValue)}
        size="icon"
        type="button"
        variant="ghost"
      >
        {showValue ? (
          <EyeOff className="h-4 w-4 text-muted-foreground" />
        ) : (
          <Eye className="h-4 w-4 text-muted-foreground" />
        )}
      </Button>
    </div>
  );
}
