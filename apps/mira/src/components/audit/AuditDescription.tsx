import AuditSmartContent from './AuditSmartContent';
import { DEV_MODE } from '@/constants/common';
import { AuditLog } from '@/types/primitives/audit-log';
import { JsonInput, Tabs } from '@mantine/core';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface Props {
  data: AuditLog;
  isExpanded: boolean;
}

const AuditDescription = ({ data, isExpanded }: Props) => {
  const t = useTranslations();

  const [activeTab, setActiveTab] = useState<string | null>('default');

  if (!DEV_MODE)
    return <AuditSmartContent data={data} isExpanded={isExpanded} />;

  return (
    <Tabs
      value={activeTab}
      onChange={setActiveTab}
      variant="pills"
      color="blue"
    >
      <Tabs.List>
        <Tabs.Tab value="default">{t('common.default')}</Tabs.Tab>
        <Tabs.Tab value="json">JSON</Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="default" pt="xs">
        <AuditSmartContent data={data} isExpanded={isExpanded} />
      </Tabs.Panel>

      <Tabs.Panel value="json" pt="xs">
        <JsonInput
          value={JSON.stringify(data, null, 2)}
          formatOnBlur
          autosize
          disabled
        />
      </Tabs.Panel>
    </Tabs>
  );
};

export default AuditDescription;
