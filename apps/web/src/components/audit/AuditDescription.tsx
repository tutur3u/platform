import { JsonInput, Tabs } from '@mantine/core';
import { useState } from 'react';
import { AuditLog } from '../../types/primitives/AuditLog';
import { DEV_MODE } from '../../constants/common';
import AuditSmartContent from './AuditSmartContent';
import useTranslation from 'next-translate/useTranslation';

interface Props {
  data: AuditLog;
  isExpanded: boolean;
}

const AuditDescription = ({ data, isExpanded }: Props) => {
  const { t } = useTranslation('ws-activities');

  const [activeTab, setActiveTab] = useState<string | null>('default');

  if (!DEV_MODE)
    return <AuditSmartContent data={data} isExpanded={isExpanded} />;

  return (
    <Tabs
      value={activeTab}
      onTabChange={setActiveTab}
      variant="pills"
      color="gray"
    >
      <Tabs.List>
        <Tabs.Tab value="default">{t('common:default')}</Tabs.Tab>
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
