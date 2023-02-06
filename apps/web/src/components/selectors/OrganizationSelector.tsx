import { Select } from '@mantine/core';
import { useOrgs } from '../../hooks/useOrganizations';
import { useProjects } from '../../hooks/useProjects';

interface Props {
  showLabel?: boolean;
  className?: string;
}

const OrganizationSelector = ({ showLabel, className }: Props) => {
  const { isLoading, orgs } = useOrgs();
  const { orgId, setOrgId } = useProjects();

  const hasOrgs = orgs?.current && orgs.current.length > 0;

  const orgOptions = hasOrgs
    ? orgs.current.map((o) => ({
        value: o.id,
        label: o?.name || 'Unnamed Organization',
      }))
    : [
        {
          value: '',
          label: 'No organization',
        },
      ];

  return (
    <Select
      label={showLabel ? 'Organization' : undefined}
      data={orgOptions}
      value={orgId}
      onChange={setOrgId}
      disabled={isLoading || !hasOrgs}
      classNames={{
        label: 'mb-1',
      }}
      className={className}
    />
  );
};

export default OrganizationSelector;
