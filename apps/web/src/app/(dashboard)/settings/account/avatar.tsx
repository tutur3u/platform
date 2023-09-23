'use client';

import { User } from '@/types/primitives/User';

interface AvatarProps {
  user: User;
}

export default function Avatar({ user: _ }: AvatarProps) {
  // const removeAvatar = async () => {
  // If user has an avatar, remove it
  // if (user?.avatar_url) {
  // await updateUser?.({
  //   avatar_url: null,
  // });
  // }

  // If user has a local avatar file, remove it
  // setAvatarFile(null);
  // };

  return null;

  // return (
  //   <AvatarCard
  //     src={avatarUrl}
  //     file={avatarFile}
  //     setFile={setAvatarFile}
  //     onRemove={removeAvatar}
  //     label={getInitials(user?.display_name || user?.email)}
  //   />
  // );
}
