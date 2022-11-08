import { TextInput } from '@mantine/core';
import moment from 'moment';
import { useRouter } from 'next/router';
import { ChangeEvent, ReactElement, useEffect, useState } from 'react';
import useSWR from 'swr';
import NestedLayout from '../../../components/layout/NestedLayout';
import { useAppearance } from '../../../hooks/useAppearance';
import { useOrgs } from '../../../hooks/useOrganizations';

const OrganizationSettingsPage = () => {
  const router = useRouter();
  const { orgId } = router.query;

  const { updateOrg, deleteOrg } = useOrgs();

  const { data, error } = useSWR(`/api/orgs/${orgId}`);
  const isLoading = !data && !error;

  const { setRootSegment } = useAppearance();

  const [name, setName] = useState(data?.name);

  useEffect(() => {
    if (data?.id)
      setRootSegment(
        data?.name
          ? [
              {
                content: data.name,
                href: `/orgs/${data.id}`,
              },
              {
                content: 'Settings',
                href: `/orgs/${data.id}/settings`,
              },
            ]
          : []
      );
    setName(data?.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

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

    if (!updateOrg || !data) {
      setIsSaving(false);
      throw new Error('Failed to update org');
    }

    await updateOrg({
      id: data.id,
      name,
    });

    setRootSegment([
      {
        content: name,
        href: `/orgs/${data.id}`,
      },
      {
        content: 'Settings',
        href: `/orgs/${data.id}/settings`,
      },
    ]);

    setIsSaving(false);
  };

  const handleDelete = async () => {
    setIsDeleting(true);

    if (isSystemOrg) {
      setIsDeleting(false);
      return;
    }

    if (!deleteOrg || !data) {
      setIsDeleting(false);
      throw new Error('Failed to delete org');
    }

    await deleteOrg(data.id);
    router.push('/');
  };

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <h1 className="col-span-full font-bold">Settings</h1>

      <div className="p-4 flex flex-col border border-zinc-800/80 bg-[#19191d] rounded-lg">
        <div className="text-3xl font-bold mb-1">Basic Information</div>
        <div className="font-semibold text-zinc-500 mb-4">
          Manage the basic information of your organization.
        </div>

        <div className="grid gap-2 max-w-xs">
          <TextInput
            label="Organization Name"
            placeholder={data?.name ?? name ?? 'Organization Name'}
            value={name}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setName(e.currentTarget.value)
            }
            // Disable this form if the current org is the root org (Tuturuuu)
            // Which has an ID of '00000000-0000-0000-0000-000000000000'
            disabled={isSystemOrg}
          />
        </div>

        <div className="border-t pt-4 mt-8 border-zinc-700/70 text-zinc-500">
          This organization was created{' '}
          <span className="text-zinc-300 font-semibold">
            {moment(data.created_at).fromNow()}
          </span>
          .
        </div>

        {isSystemOrg || (
          <>
            <div className="h-full" />

            <div
              onClick={handleSave}
              className="mt-8 col-span-full w-full p-2 flex items-center border border-blue-300/20 hover:border-blue-300/30 justify-center font-semibold text-xl bg-blue-300/10 hover:bg-blue-300/20 text-blue-300 rounded-lg cursor-pointer transition duration-300"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </div>
          </>
        )}
      </div>

      {isSystemOrg || (
        <div className="flex flex-col p-4 border border-zinc-800/80 bg-[#19191d] rounded-lg">
          <div className="text-3xl font-bold mb-1">Security</div>
          <div className="font-semibold text-zinc-500 mb-4">
            Manage the security of your organization.
          </div>

          <div className="h-full text-center grid xl:grid-cols-2 items-end gap-4">
            <div
              className="col-span-full w-full h-fit p-2 flex items-center border border-red-300/20 hover:border-red-300/30 justify-center font-semibold text-xl bg-red-300/10 hover:bg-red-300/20 text-red-300 rounded-lg cursor-pointer transition duration-300"
              onClick={handleDelete}
            >
              {isDeleting ? 'Deleting...' : 'Delete Organization'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

OrganizationSettingsPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout>{page}</NestedLayout>;
};

export default OrganizationSettingsPage;
