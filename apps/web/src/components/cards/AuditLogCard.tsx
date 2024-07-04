import AuditDescription from '../audit/AuditDescription';
import AuditLabel from '../audit/AuditLabel';
import { User } from '@/types/primitives/User';
import { AuditLog } from '@/types/primitives/audit-log';
import { Accordion } from '@mantine/core';
import useSWR from 'swr';

interface Props {
  data: AuditLog;
  isExpanded: boolean;
}

const AuditLogCard = ({ data, isExpanded }: Props) => {
  const userId = data?.auth_uid || null;
  const userApi = userId ? `/api/users/${userId}` : null;

  const { data: user, error } = useSWR<User>(userApi);
  const isLoading = (userId && !user && !error) || false;

  return (
    <Accordion.Item value={`log-${data.id}`}>
      <Accordion.Control>
        <AuditLabel
          data={data}
          isLoading={isLoading}
          hasActor={!!userId}
          actor={user}
        />
      </Accordion.Control>

      <Accordion.Panel>
        <AuditDescription data={data} isExpanded={isExpanded} />
      </Accordion.Panel>
    </Accordion.Item>
  );
};

export default AuditLogCard;
