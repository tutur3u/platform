import { Divider, TextInput } from '@mantine/core';
import moment from 'moment';
import { useRouter } from 'next/router';
import { ChangeEvent, ReactElement, useEffect, useState } from 'react';
import useSWR, { mutate } from 'swr';
import NestedLayout from '../../../components/layouts/NestedLayout';
import { useAppearance } from '../../../hooks/useAppearance';
import { useOrgs } from '../../../hooks/useOrganizations';
import HeaderX from '../../../components/metadata/HeaderX';

const OrganizationSettingsPage = () => {
  const router = useRouter();
  const { orgId } = router.query;

  const { updateOrg, deleteOrg } = useOrgs();

  const { data: org, error } = useSWR(`/api/orgs/${orgId}`);
  const isLoading = !org && !error;

  const { setRootSegment } = useAppearance();

  const [name, setName] = useState(org?.name);

  useEffect(() => {
    setName(org?.name);
    setRootSegment(
      orgId
        ? [
            {
              content: org?.name ?? 'Loading...',
              href: `/orgs/${orgId}`,
            },
            {
              content: 'Settings',
              href: `/orgs/${orgId}/settings`,
            },
          ]
        : []
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, org?.name]);

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (isLoading) return <div>Loading...</div>;

  const isSystemOrg = orgId === '00000000-0000-0000-0000-000000000000';

  const handleSave = async () => {
    setIsSaving(true);

    if (isSystemOrg) {
      setIsSaving(false);
      return;
    }

    if (!updateOrg || !org) {
      setIsSaving(false);
      throw new Error('Failed to update org');
    }

    await updateOrg(
      {
        id: org.id,
        name,
      },
      {
        onSuccess: () => {
          setRootSegment(
            orgId
              ? [
                  {
                    content: name,
                    href: `/orgs/${orgId}`,
                  },
                  {
                    content: 'Settings',
                    href: `/orgs/${orgId}/settings`,
                  },
                ]
              : []
          );

          mutate('/api/orgs');
          mutate(`/api/orgs/${orgId}`);
        },
        onCompleted: () => setIsSaving(false),
      }
    );
  };

  const handleDelete = async () => {
    setIsDeleting(true);

    if (isSystemOrg) {
      setIsDeleting(false);
      return;
    }

    if (!deleteOrg || !org) {
      setIsDeleting(false);
      throw new Error('Failed to delete org');
    }

    await deleteOrg(org.id, {
      onSuccess: () => {
        mutate('/api/orgs');
        router.push('/');
      },
      onCompleted: () => setIsDeleting(false),
    });
  };

  return (
    <>
      <HeaderX label={`Settings – ${org?.name || 'Unnamed Organization'}`} />

      {orgId && (
        <>
          <div className="rounded-lg bg-zinc-900 p-4">
            <h1 className="text-2xl font-bold">Settings</h1>
            <p className="text-zinc-400">
              Manage the settings of your project.
            </p>
          </div>
        </>
      )}

      <Divider className="my-4" />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col rounded-lg border border-zinc-800/80 bg-[#19191d] p-4">
          <div className="mb-1 text-3xl font-bold">Basic Information</div>
          <div className="mb-4 font-semibold text-zinc-500">
            Manage the basic information of your organization.
          </div>

          <div className="grid max-w-xs gap-2">
            <TextInput
              label="Organization Name"
              placeholder={org?.name || name || 'Organization Name'}
              value={name}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setName(e.currentTarget.value)
              }
              // Disable this form if the current org is the root org (Tuturuuu)
              // Which has an ID of '00000000-0000-0000-0000-000000000000'
              disabled={isSystemOrg}
            />
          </div>

          <div className="mt-8 border-t border-zinc-700/70 pt-4 text-zinc-500">
            This organization was created{' '}
            <span className="font-semibold text-zinc-300">
              {moment(org.created_at).fromNow()}
            </span>
            .
          </div>

          <div className="h-full" />

          <button
            onClick={
              isSystemOrg || isSaving || name === org?.name
                ? undefined
                : handleSave
            }
            className={`${
              isSystemOrg || isSaving || name === org?.name
                ? 'cursor-not-allowed opacity-50'
                : 'hover:border-blue-300/30 hover:bg-blue-300/20'
            } col-span-full mt-8 flex w-full items-center justify-center rounded-lg border border-blue-300/20 bg-blue-300/10 p-2 text-xl font-semibold text-blue-300 transition`}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>

        <div className="flex flex-col rounded-lg border border-zinc-800/80 bg-[#19191d] p-4">
          <div className="mb-1 text-3xl font-bold">Security</div>
          <div className="mb-4 font-semibold text-zinc-500">
            Manage the security of your organization.
          </div>

          <div className="grid h-full items-end gap-4 text-center xl:grid-cols-2">
            <button
              onClick={isSystemOrg ? undefined : handleDelete}
              className={`${
                isSystemOrg
                  ? 'cursor-not-allowed opacity-50'
                  : 'hover:border-red-300/30 hover:bg-red-300/20'
              } col-span-full mt-8 flex w-full items-center justify-center rounded-lg border border-red-300/20 bg-red-300/10 p-2 text-xl font-semibold text-red-300 transition`}
            >
              {isDeleting ? 'Deleting...' : 'Delete Organization'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

OrganizationSettingsPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout>{page}</NestedLayout>;
};

export default OrganizationSettingsPage;
