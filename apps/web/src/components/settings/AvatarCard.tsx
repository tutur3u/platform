import { PencilIcon, TrashIcon } from '@heroicons/react/24/solid';
import { Menu, ActionIcon, FileButton, Button, Avatar } from '@mantine/core';
import { IconSettings } from '@tabler/icons-react';
import useTranslation from 'next-translate/useTranslation';
import { User } from '../../types/primitives/User';

interface Props {
  user: User | undefined;
  setAvatarFile: (file: File) => void;
  removeAvatar: () => void;
  avatarFile: File | null;
  avatarUrl: string | null;
}

const AvatarCard = ({
  user,
  setAvatarFile,
  removeAvatar,
  avatarFile,
  avatarUrl,
}: Props) => {
  const { t } = useTranslation('settings-account');
  const avatarLabel = t('avatar');

  return (
    <div className="relative h-fit w-[16rem]">
      <Menu
        trigger="hover"
        position="right"
        offset={7}
        classNames={{
          item: 'p-0 flex hover:bg-transparent',
        }}
      >
        <Menu.Target>
          <ActionIcon
            variant="light"
            className="absolute right-2 top-8 z-10 flex h-[2rem] w-[2rem] "
          >
            <IconSettings size="1.5rem" />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <FileButton accept="image/png,image/jpeg" onChange={setAvatarFile}>
            {(props) => (
              <Button
                {...props}
                variant="light"
                className="flex w-full  border text-zinc-300 hover:bg-zinc-300/10 "
                leftIcon={<PencilIcon className="h-4 w-4 text-zinc-300" />}
              >
                {t('common:edit')}
              </Button>
            )}
          </FileButton>
          <Menu.Item>
            {(!!avatarFile || !!user?.avatar_url) && (
              <Button
                variant="light"
                className="flex w-full border text-zinc-300 hover:bg-zinc-300/10"
                leftIcon={<TrashIcon className="h-4 w-4 text-zinc-300" />}
                onClick={removeAvatar}
              >
                {t('common:remove')}
              </Button>
            )}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>

      <Avatar
        alt={avatarLabel}
        src={avatarFile ? URL.createObjectURL(avatarFile) : avatarUrl}
        size="2xl"
        className="h-[16rem] w-[16rem] max-w-sm rounded-full "
      />
      {avatarFile && (
        <div className="absolute bottom-[-1rem] left-0 right-0 mx-auto flex  w-[6rem] transform items-center justify-center rounded-full bg-clip-text backdrop-blur-lg">
          <div className="w-full rounded-full border-2 border-zinc-100/20 bg-zinc-300/5 bg-clip-padding py-2  text-center font-semibold text-zinc-300 ">
            Preview
          </div>
        </div>
      )}
    </div>
  );
};

export default AvatarCard;
