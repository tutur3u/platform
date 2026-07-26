'use client';

import { Eye, EyeOff, RefreshCw } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { generateSecureTemporaryPassword } from './password-generator';

interface Props {
  id: string;
  minLength: number;
  onChange: (value: string) => void;
  value: string;
}

export function TemporaryPasswordField({
  id,
  minLength,
  onChange,
  value,
}: Props) {
  const t = useTranslations('internal-accounts.dialog');
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{t('new_password')}</Label>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Input
            autoComplete="new-password"
            className="pr-10 font-mono"
            id={id}
            minLength={minLength}
            onChange={(event) => onChange(event.target.value)}
            type={showPassword ? 'text' : 'password'}
            value={value}
          />
          <Button
            aria-label={showPassword ? t('hide_password') : t('show_password')}
            className="absolute top-1/2 right-1 size-8 -translate-y-1/2"
            onClick={() => setShowPassword((current) => !current)}
            size="icon"
            type="button"
            variant="ghost"
          >
            {showPassword ? (
              <EyeOff className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
          </Button>
        </div>
        <Button
          aria-label={t('generate_password')}
          onClick={() => {
            onChange(generateSecureTemporaryPassword());
            setShowPassword(true);
          }}
          size="icon"
          type="button"
          variant="outline"
        >
          <RefreshCw className="size-4" />
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        {t('password_help', { count: minLength })}
      </p>
    </div>
  );
}
