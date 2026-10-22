'use client';

import { Copy, Eye, EyeOff, RefreshCw } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { useTranslations } from 'next-intl';
import { useLayoutEffect, useRef, useState } from 'react';
import { generateSecureTemporaryPassword } from './password-generator';

interface Props {
  id: string;
  minLength: number;
  onChange: (value: string) => void;
  value: string;
  label?: string;
  help?: string;
  disabled?: boolean;
  invalid?: boolean;
}

export function TemporaryPasswordField({
  id,
  minLength,
  onChange,
  value,
  label,
  help,
  disabled = false,
  invalid = false,
}: Props) {
  const t = useTranslations('internal-accounts.dialog');
  const [showPassword, setShowPassword] = useState(false);
  const [failure, setFailure] = useState<'copy' | 'generation' | null>(null);
  const copyAttempt = useRef(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Changing the controlled secret invalidates transient feedback without retaining its previous value.
  useLayoutEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- Clear transient feedback before a replacement secret is painted.
    setFailure(null);
    return () => {
      copyAttempt.current += 1;
    };
  }, [value]);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label ?? t('new_password')}</Label>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Input
            aria-invalid={invalid}
            aria-describedby={`${id}-help`}
            disabled={disabled}
            maxLength={72}
            required
            autoComplete="new-password"
            className="pr-10 font-mono"
            id={id}
            minLength={minLength}
            onChange={(event) => {
              setFailure(null);
              onChange(event.target.value);
            }}
            type={showPassword ? 'text' : 'password'}
            value={value}
          />
          <Button
            disabled={disabled}
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
          disabled={disabled}
          aria-label={t('generate_password')}
          onClick={() => {
            try {
              const generated = generateSecureTemporaryPassword();
              onChange(generated);
              setFailure(null);
              setShowPassword(true);
            } catch {
              setFailure('generation');
            }
          }}
          size="icon"
          type="button"
          variant="outline"
        >
          <RefreshCw className="size-4" />
        </Button>
        <Button
          aria-label={t('copy_password')}
          disabled={disabled || !value}
          onClick={async () => {
            const attempt = ++copyAttempt.current;
            setFailure(null);
            try {
              if (
                !globalThis.isSecureContext ||
                !navigator.clipboard?.writeText
              )
                throw new Error('Clipboard unavailable');
              await navigator.clipboard.writeText(value);
            } catch {
              if (copyAttempt.current === attempt) setFailure('copy');
            }
          }}
          size="icon"
          type="button"
          variant="outline"
        >
          <Copy className="size-4" />
        </Button>
      </div>
      {failure === 'generation' ? (
        <p role="alert" className="text-destructive text-sm">
          {t('generate_password_failed')}
        </p>
      ) : null}
      {failure === 'copy' ? (
        <p role="alert" className="text-destructive text-sm">
          {t('copy_password_failed')}
        </p>
      ) : null}
      <p id={`${id}-help`} className="text-muted-foreground text-xs">
        {help ?? t('password_help', { count: minLength })}
      </p>
    </div>
  );
}
