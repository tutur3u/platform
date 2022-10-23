import { ReactElement, useRef, useState } from 'react';
import { PageWithLayoutProps } from '../types/PageWithLayoutProps';
import Layout from '../components/layout/Layout';
import { AuthProtect } from '../hooks/useUser';
import { Organization } from '../types/primitives/Organization';
import { PencilIcon, TrashIcon } from '@heroicons/react/24/solid';
import { showNotification } from '@mantine/notifications';
import { v4 as uuidv4 } from 'uuid';
import { closeAllModals, openModal } from '@mantine/modals';
import { Button, TextInput } from '@mantine/core';

const Home: PageWithLayoutProps = () => {
  AuthProtect();

  const [orgs, setOrgs] = useState<Organization[]>([]);
  const maxOrgs = 3;

  const addOrg = (org: Organization) =>
    setOrgs((prevOrgs) => [...prevOrgs, org]);

  const editOrg = (org: Organization) =>
    setOrgs((prevOrgs) =>
      prevOrgs.map((prevOrg) =>
        prevOrg.id === org.id ? { ...prevOrg, ...org } : prevOrg
      )
    );

  const removeOrg = (id: string) =>
    setOrgs((prevOrgs) => prevOrgs.filter((org) => org.id !== id));

  const showMaxOrgsReached = () => {
    showNotification({
      title: 'Maximum organizations reached',
      message: `You can only have ${maxOrgs} organizations at a time.`,
      color: 'red',
    });
  };

  const ref = useRef<HTMLInputElement>(null);

  const showEditOrgModal = (id?: string) => {
    openModal({
      title: id ? 'Edit organization' : 'Add organization',
      centered: true,
      children: (
        <>
          {id && (
            <TextInput
              label="Organization ID"
              value={id}
              disabled={!!id}
              className="mb-2"
              data-autofocus
            />
          )}
          <TextInput
            label="Organization name"
            placeholder="Enter organization name"
            ref={ref}
            data-autofocus
          />
          <Button
            fullWidth
            onClick={() => {
              const name = ref.current?.value;

              if (!!id) {
                editOrg({ id, name });
              } else if (orgs.length < maxOrgs) {
                const newId = uuidv4();
                addOrg({ id: newId, name });
              } else {
                showMaxOrgsReached();
              }

              closeAllModals();
            }}
            mt="md"
          >
            Submit
          </Button>
        </>
      ),
    });
  };

  return (
    <>
      <h1 className="text-4xl font-semibold mb-4">Home</h1>
      {orgs.length > 0 ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
          {orgs.map((org) => (
            <div
              key={org.id}
              className="p-4 border border-zinc-800/80 bg-[#19191d] rounded"
            >
              {org?.name || `Unnamed organization`}

              <div className="mt-2 flex justify-end gap-2">
                <button
                  className="p-2 border border-zinc-700/50 bg-zinc-800 hover:bg-zinc-700/80 rounded transition duration-150"
                  onClick={() => showEditOrgModal(org.id)}
                >
                  <PencilIcon className="w-5 h-5" />
                </button>
                <button
                  className="p-2 border border-zinc-700/50 bg-zinc-800 hover:bg-zinc-700/80 rounded transition duration-150"
                  onClick={() => removeOrg(org.id)}
                >
                  <TrashIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col">
          <div className="flex flex-row">
            You are not a member of any organizations.
          </div>
        </div>
      )}

      <button
        className="mt-8 bg-blue-300/20 hover:bg-blue-300/30 text-blue-300 font-semibold px-6 py-4 rounded"
        onClick={() => showEditOrgModal()}
      >
        New organization
      </button>
    </>
  );
};

Home.getLayout = function getLayout(page: ReactElement) {
  return <Layout>{page}</Layout>;
};

export default Home;
