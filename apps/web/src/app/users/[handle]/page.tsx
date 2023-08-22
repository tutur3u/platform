import { cookies } from 'next/headers';
import {
  SupabaseClient,
  createServerComponentClient,
} from '@supabase/auth-helpers-nextjs';
import Image from 'next/image';
import { getInitials } from '../../../utils/name-helper';
import HeaderX from '../../../components/metadata/HeaderX';
import { redirect } from 'next/navigation';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface Props {
  params: {
    handle: string;
  };
}

export default async function UserProfilePage({ params: { handle } }: Props) {
  const supabase = createServerComponentClient({ cookies });

  const {
    data: { user: sbUser },
  } = await supabase.auth.getUser();

  if (!sbUser) redirect('/login');

  const user = await getUser({
    supabase,
    handle,
  });

  // const getDaysUntilBirthday = (birthday: Date) => {
  //   const today = new Date();
  //   const nextBirthday = new Date(
  //     today.getFullYear(),
  //     birthday.getMonth(),
  //     birthday.getDate()
  //   );

  //   if (today > nextBirthday) {
  //     nextBirthday.setFullYear(nextBirthday.getFullYear() + 1);
  //   }

  //   const daysUntilBirthday = Math.ceil(
  //     (nextBirthday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  //   );

  //   return daysUntilBirthday;
  // };

  return (
    <>
      <HeaderX
        label={`${user?.handle} ${
          user?.display_name ? `(${user?.display_name})` : ''
        }`}
      />
      <div className="absolute inset-0 top-[4.5rem] flex h-full w-full flex-col border-zinc-800 md:static">
        <div className="relative flex h-64 items-center justify-center">
          <div className="m-4 max-h-64 w-full overflow-hidden rounded-lg md:mt-14">
            <Image
              src="/media/background/placeholder.jpg"
              alt="Profile background"
              width={1640}
              height={924}
              className="w-full object-cover"
            />
          </div>

          <div className="absolute top-32 flex flex-col items-center justify-center gap-1 md:top-40 lg:top-48">
            <Avatar className="h-40 w-40 text-6xl">
              <AvatarImage
                src={user.avatar_url}
                alt={user?.handle || user?.display_name}
              />
              <AvatarFallback>{getInitials(user.display_name)}</AvatarFallback>
            </Avatar>
            <div className="text-3xl font-bold text-zinc-300">
              {user.display_name}
            </div>
            <div className="text-lg font-semibold text-purple-300">
              @{user.handle}
            </div>
          </div>
        </div>

        {/* <div className="grid translate-y-28 grid-cols-1 gap-4 p-4 md:grid-cols-2 md:p-8 lg:translate-y-48 lg:grid-cols-3 lg:pt-0 2xl:grid-cols-4">
          {user?.birthday && (
            <ProfileCard
              title="Birthday"
              titleClassname="text-green-200"
              classname="bg-green-300/20 transition duration-500"
            >
              <div className="mt-4 text-4xl font-bold text-green-300">
                {new Date(user.birthday).toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                })}
              </div>
              <div className="mt-2 text-lg font-semibold text-green-200/80">
                in {getDaysUntilBirthday(new Date(user.birthday))} days
              </div>
            </ProfileCard>
          )}
        </div> */}
      </div>
    </>
  );
}

async function getUser({
  supabase,
  handle,
}: {
  supabase: SupabaseClient;
  handle: string;
}) {
  const { data: user, error } = await supabase
    .from('users')
    .select('id, handle, display_name, avatar_url, created_at')
    .eq('handle', handle)
    .single();

  if (error) {
    console.error(error);
    throw error;
  }

  return user;
}
