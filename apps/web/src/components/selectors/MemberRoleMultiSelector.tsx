'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import useTranslation from 'next-translate/useTranslation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { useCallback } from 'react';
import { Label } from '../ui/label';

interface Props {
  disabled?: boolean;
}

export default function MemberRoleMultiSelector({ disabled }: Props) {
  const { t } = useTranslation('member-roles');

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

  const role = searchParams.get('role') || '';

  const setRole = useCallback(
    (value: string) => {
      const query = createQueryString('role', value);
      router.push(`${pathname}?${query}`);
    },
    [createQueryString, pathname, router]
  );

  const options = [
    {
      label: t('common:all'),
      value: '',
      group: t('common:general'),
    },
    {
      label: t('owner'),
      value: 'OWNER',
      group: t('common:other'),
    },
    {
      label: t('admin'),
      value: 'ADMIN',
      group: t('common:other'),
    },
    {
      label: t('member'),
      value: 'MEMBER',
      group: t('common:other'),
    },
  ];

  return (
    <div className="grid w-full items-center gap-1.5">
      <Label>{t('roles')}</Label>
      <Select value={role} onValueChange={setRole} disabled={disabled}>
        <SelectTrigger>
          <SelectValue placeholder={t('select-roles')} />
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
}
