import AuditSmartContent from './AuditSmartContent';
import { DEV_MODE } from '@/constants/common';
import { AuditLog } from '@repo/types/primitives/audit-log';

interface Props {
  data: AuditLog;
  isExpanded: boolean;
}

const AuditDescription = ({ data, isExpanded }: Props) => {
  if (!DEV_MODE)
    return <AuditSmartContent data={data} isExpanded={isExpanded} />;

  return <div></div>;

  // return (
  //   <Tabs
  //     value={activeTab}
  //     onChange={setActiveTab}
  //     variant="pills"
  //     color="blue"
  //   >
  //     <Tabs.List>
  //       <Tabs.Tab value="default">{t('common.default')}</Tabs.Tab>
  //       <Tabs.Tab value="json">JSON</Tabs.Tab>
  //     </Tabs.List>

  //     <Tabs.Panel value="default" pt="xs">
  //       <AuditSmartContent data={data} isExpanded={isExpanded} />
  //     </Tabs.Panel>

  //     <Tabs.Panel value="json" pt="xs">
  //       <JsonInput
  //         value={JSON.stringify(data, null, 2)}
  //         formatOnBlur
  //         autosize
  //         disabled
  //       />
  //     </Tabs.Panel>
  //   </Tabs>
  // );
};

export default AuditDescription;
