import moment from 'moment';
import { Accordion, JsonInput } from '@mantine/core';
import { AuditLog } from '../../types/primitives/AuditLog';
import { getLabel } from '../../utils/audit-helper';
import { User } from '../../types/primitives/User';
import useSWR from 'swr';

interface Props {
  data: AuditLog;
}

const AuditLogCard = ({ data }: Props) => {
  const userId = data?.auth_uid || null;
  const userApi = userId ? `/api/users/${userId}` : null;

  const { data: user } = useSWR<User>(userApi);

  const label = getLabel(data);

  const fullLabel = `${
    userId ? (user ? user.display_name : '...') : 'Hệ thống'
  } ${label}`;

  return (
    <Accordion.Item value={`log-${data.id}`}>
      <Accordion.Control>
        <div className="font-semibold tracking-wide">{fullLabel}</div>
        <div className="line-clamp-1 pb-1 font-semibold text-zinc-400/70">
          {moment(data.ts).fromNow()}
        </div>
      </Accordion.Control>
      <Accordion.Panel>
        <JsonInput
          value={JSON.stringify(data, null, 2)}
          formatOnBlur
          autosize
          disabled
        />
      </Accordion.Panel>
    </Accordion.Item>
  );
};

export default AuditLogCard;
