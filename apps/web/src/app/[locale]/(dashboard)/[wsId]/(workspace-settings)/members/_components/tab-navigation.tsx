'use client';

import { parseAsStringLiteral, useQueryState } from 'nuqs';
import { TabsTrigger } from '@tuturuuu/ui/tabs';
import {
  memberStatusValues,
  type MemberStatus,
} from './members-queries';

interface Props {
  value: MemberStatus;
  label: string;
}

export default function TabNavigation({ value, label }: Props) {
  const [, setStatus] = useQueryState(
    'status',
    parseAsStringLiteral(memberStatusValues)
      .withDefault('all')
      .withOptions({ shallow: true })
  );

  return (
    <TabsTrigger value={value} onClick={() => setStatus(value)}>
      {label}
    </TabsTrigger>
  );
}
