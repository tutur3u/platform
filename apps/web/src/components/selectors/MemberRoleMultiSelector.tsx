'use client';

import useTranslation from 'next-translate/useTranslation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Label } from '../ui/label';
import useQuery from '@/hooks/useQuery';

interface Props {
  disabled?: boolean;
}

export default function MemberRoleMultiSelector({ disabled }: Props) {
  const { t } = useTranslation('member-roles');

  const query = useQuery();

  const roles = query.get('roles') || 'ALL';

  const setRole = (value: string) =>
    query.set({ roles: value === 'ALL' ? '' : value });

  const options = [
    {
      label: t('common:all'),
      value: 'ALL',
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
      <Select value={roles} onValueChange={setRole} disabled={disabled}>
        <SelectTrigger>
          <SelectValue />
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
