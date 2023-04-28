import { useWorkspaces } from '../../hooks/useWorkspaces';
import moment from 'moment';
import { Accordion } from '@mantine/core';
import { AuditLog } from '../../types/primitives/AuditLog';
import { getLabel } from '../../utils/audit-helper';

interface Props {
  data: AuditLog;
}

const AuditLogCard = ({ data }: Props) => {
  const { ws } = useWorkspaces();
  if (!ws) return null;

  const label = getLabel(data);

  return (
    <Accordion.Item value={`log-${data.id}`}>
      <Accordion.Control>
        <div className="font-semibold tracking-wide">{label}</div>
        <div className="line-clamp-1 pb-1 font-semibold text-zinc-400/70">
          {moment(data.ts).fromNow()}
        </div>
      </Accordion.Control>
      <Accordion.Panel>
        Configure components appearance and behavior with vast amount of
        settings or overwrite any part of component styles
      </Accordion.Panel>
    </Accordion.Item>
  );
};

export default AuditLogCard;
