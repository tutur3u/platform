import { Select } from '@mantine/core';
import { useOrgs } from '../../hooks/useOrganizations';
import { useProjects } from '../../hooks/useProjects';
import { useRouter } from 'next/router';
import { BuildingOffice2Icon } from '@heroicons/react/24/solid';
import OrgEditForm from '../forms/OrgEditForm';
import { openModal } from '@mantine/modals';

interface Props {
  showLabel?: boolean;
  onChange?: () => void;
  className?: string;
}

const OrganizationSelector = ({ showLabel, onChange, className }: Props) => {
  const router = useRouter();

  const { isLoading, orgs, createOrg } = useOrgs();
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

  const showEditOrgModal = () => {
    openModal({
      title: <div className="font-semibold">New organization</div>,
      centered: true,
      children: <OrgEditForm onSubmit={createOrg} />,
    });
  };

  if (!isLoading && !hasOrgs)
    return (
      <button
        className="flex w-full items-center justify-center gap-2 rounded border border-zinc-800 bg-zinc-800/80 p-2 text-sm font-semibold text-zinc-400 transition hover:bg-zinc-300/10 hover:text-zinc-200"
        onClick={showEditOrgModal}
      >
        <BuildingOffice2Icon className="w-4" />
        <div className="line-clamp-1">Create Organization</div>
      </button>
    );

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
