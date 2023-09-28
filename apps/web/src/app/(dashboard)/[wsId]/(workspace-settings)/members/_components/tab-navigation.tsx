'use client';

import { TabsTrigger } from '@/components/ui/tabs';
import useQuery from '@/hooks/useQuery';

interface Props {
  value: string;
  label: string;
}

export default function TabNavigation({ value, label }: Props) {
  const query = useQuery();

  return (
    <TabsTrigger value={value} onClick={() => query.set({ status: value })}>
      {label}
    </TabsTrigger>
  );
}
