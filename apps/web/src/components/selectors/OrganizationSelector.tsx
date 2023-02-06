import { Select } from '@mantine/core';
import { useOrgs } from '../../hooks/useOrganizations';
import { useProjects } from '../../hooks/useProjects';
import { useRouter } from 'next/router';

interface Props {
  showLabel?: boolean;
  onChange?: () => void;
  className?: string;
}

const OrganizationSelector = ({ showLabel, onChange, className }: Props) => {
  const router = useRouter();

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
      onChange={(orgId) => {
        setOrgId(orgId || '');
        if (onChange) onChange();
        router.push(`/orgs/${orgId}`);
      }}
      disabled={isLoading || !hasOrgs}
      classNames={{
        label: 'mb-1',
      }}
      className={className}
    />
  );
};

export default OrganizationSelector;
