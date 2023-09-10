'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import useTranslation from 'next-translate/useTranslation';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

interface Props {
  preset: 'completion' | 'status';
}

const StatusSelector = ({ preset }: Props) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams()!;

  // Get a new searchParams string by merging the current
  // searchParams with a provided key/value pair
  const createQueryString = useCallback(
    (name: string, value: string) => {
      const params = new URLSearchParams(searchParams);

      if (value) params.set(name, value);
      else params.delete(name);

      return params.toString();
    },
    [searchParams]
  );

  const status = searchParams.get('status') || '';

  const setStatus = useCallback(
    (value: string) => {
      const query = createQueryString('status', value);
      router.push(`${pathname}?${query}`);
    },
    [createQueryString, pathname, router]
  );

  const { t } = useTranslation('status-selector');

  const options =
    preset === 'status'
      ? [
          {
            label: t('all'),
            value: '',
          },
          {
            label: t('active'),
            value: 'active',
          },
          {
            label: t('inactive'),
            value: 'inactive',
          },
        ]
      : [
          {
            label: t('all'),
            value: '',
          },
          {
            label: t('completed'),
            value: 'completed',
          },
          {
            label: t('incomplete'),
            value: 'incomplete',
          },
        ];

  return (
    <div className="grid w-full items-center gap-1.5">
      <Label>{t('status')}</Label>
      <Select value={status} onValueChange={setStatus}>
        <SelectTrigger>
          <SelectValue placeholder={t('status-placeholder')} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default StatusSelector;
