'use client';

import AvatarCard from '@/components/settings/AvatarCard';
import { User } from '@/types/primitives/User';
import { getInitials } from '@/utils/name-helper';

interface AvatarProps {
  user?: User;
  updateUser?: (data: Partial<User>) => Promise<void>;

  avatarUrl: string;
  avatarFile: File | null;
  setAvatarFile: (file: File | null) => void;
}

export default function Avatar({
  user,
  updateUser,
  avatarUrl,
  setAvatarFile,
  avatarFile,
}: AvatarProps) {
  const removeAvatar = async () => {
    // If user has an avatar, remove it
    if (user?.avatar_url) {
      await updateUser?.({
        avatar_url: null,
      });
    }

    // If user has a local avatar file, remove it
    setAvatarFile(null);
  };

  return (
    <AvatarCard
      src={avatarUrl}
      file={avatarFile}
      setFile={setAvatarFile}
      onRemove={removeAvatar}
      label={getInitials(user?.display_name || user?.email)}
    />
  );
}
