import { AtSymbolIcon, UserCircleIcon } from '@heroicons/react/24/solid';
import { Button, Divider, TextInput } from '@mantine/core';
import { useUser } from '@supabase/auth-helpers-react';
import { ChangeEvent, useEffect, useState } from 'react';
import { useUserData } from '../../hooks/useUserData';
import LoadingIndicator from '../common/LoadingIndicator';
import { useOrgs } from '../../hooks/useOrganizations';
import { useRouter } from 'next/router';
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { GetServerSidePropsContext } from 'next';

export const getServerSideProps = async (ctx: GetServerSidePropsContext) => {
  const supabase = createServerSupabaseClient(ctx);

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session)
    return {
      redirect: {
        destination: '/login',
        permanent: false,
      },
    };

  return {
    props: {
      initialSession: session,
      user: session.user,
    },
  };
};

const OnboardingForm = () => {
  const router = useRouter();
  const user = useUser();

  const { isLoading: isUserLoading, data, updateData } = useUserData();

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');

  const [profileCompleted, setProfileCompleted] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;

    const hasDisplayName = (data?.displayName || '')?.length > 0;
    const hasUsername = (data?.username || '')?.length > 0;

    setProfileCompleted(hasDisplayName && hasUsername);
    if (hasDisplayName && hasUsername) return;

    setDisplayName(data?.displayName || '');
    setUsername(data?.username || '');
  }, [data]);

  const updateProfile = async () => {
    setSaving(true);

    await updateData?.({
      displayName,
      username,
    });

    setSaving(false);
  };

  const [workspaceName, setWorkspaceName] = useState('');
  const { isLoading: isOrgsLoading, orgs, createOrg } = useOrgs();

  const hasWorkspaces = orgs?.current?.length > 0;

  return (
    <>
      <div className="absolute inset-0 z-10 mx-4 my-32 flex items-start justify-center md:mx-4 md:items-center lg:mx-32">
        <div className="flex w-full max-w-xl flex-col items-center gap-4 rounded-xl border border-zinc-700 bg-zinc-700/50 p-4 backdrop-blur-2xl md:p-8">
          {!user || isUserLoading || isOrgsLoading ? (
            <LoadingIndicator className="h-8 w-8" />
          ) : (
            <>
              <div className="text-center">
                <div className="bg-gradient-to-br from-yellow-200 via-green-200 to-green-300 bg-clip-text py-2 text-4xl font-semibold text-transparent md:text-5xl">
                  {profileCompleted
                    ? hasWorkspaces
                      ? 'Looks good!'
                      : 'One more step'
                    : 'Welcome to Tuturuuu!'}
                </div>

                <div className="text-xl font-semibold text-zinc-400">
                  {profileCompleted
                    ? hasWorkspaces
                      ? "You're all set up!"
                      : "Let's set up your workspace"
                    : "Let's take a few minutes to set up your account"}
                </div>
              </div>

              {profileCompleted || (
                <>
                  <Divider className="w-full" />
                  <div className="w-full rounded-lg bg-green-300/10 p-4 text-center text-green-300">
                    <div className="text-lg font-semibold opacity-70">
                      Currently logged in as
                    </div>
                    <Divider
                      className="my-2 w-full border-green-300/20"
                      variant="dashed"
                    />
                    <div className="text-2xl font-semibold">{user?.email}</div>
                  </div>
                </>
              )}

              <Divider className="w-full" />

              {hasWorkspaces ? null : profileCompleted ? (
                <TextInput
                  id="workspace-name"
                  icon={<UserCircleIcon className="h-5" />}
                  label="Workspace name"
                  placeholder="Tuturuuu"
                  value={workspaceName}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setWorkspaceName(event.currentTarget.value)
                  }
                  className="w-full"
                  classNames={{
                    label: 'text-zinc-200/80 mb-1',
                    input:
                      'bg-zinc-300/10 border-zinc-300/10 placeholder-zinc-200/30',
                  }}
                  disabled={saving}
                  autoComplete="off"
                />
              ) : (
                <div className="grid w-full gap-2">
                  <TextInput
                    id="display-name"
                    icon={<UserCircleIcon className="h-5" />}
                    label="Display name"
                    placeholder="Tuturuuu"
                    value={displayName}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setDisplayName(event.currentTarget.value)
                    }
                    classNames={{
                      label: 'text-zinc-200/80 mb-1',
                      input:
                        'bg-zinc-300/10 border-zinc-300/10 placeholder-zinc-200/30',
                    }}
                    disabled={saving}
                    autoComplete="off"
                  />

                  <TextInput
                    id="username"
                    icon={<AtSymbolIcon className="h-5" />}
                    label="Username"
                    placeholder="tuturuuu"
                    value={username}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setUsername(event.currentTarget.value)
                    }
                    classNames={{
                      label: 'text-zinc-200/80 mb-1',
                      input:
                        'bg-zinc-300/10 border-zinc-300/10 placeholder-zinc-200/30',
                    }}
                    disabled={saving}
                    autoComplete="off"
                  />
                </div>
              )}

              <div className="grid w-full gap-2 text-center">
                <Button
                  className="bg-blue-300/10"
                  variant="light"
                  loading={saving}
                  onClick={
                    profileCompleted
                      ? hasWorkspaces
                        ? () => router.push('/')
                        : () =>
                            createOrg({ id: 'new-org', name: workspaceName })
                      : updateProfile
                  }
                >
                  {profileCompleted
                    ? hasWorkspaces
                      ? 'Continue'
                      : 'Create workspace'
                    : 'Save'}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default OnboardingForm;
