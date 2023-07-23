import {
  Cog6ToothIcon,
  PencilIcon,
  TrashIcon,
} from '@heroicons/react/24/solid';
import { Menu, ActionIcon, FileButton, Button, Avatar } from '@mantine/core';
import useTranslation from 'next-translate/useTranslation';

interface Props {
  src: string | null;
  label?: string;
  file: File | null;
  setFile: (file: File) => void;
  onRemove: () => void;
}

const AvatarCard = ({ src, label, file, setFile, onRemove }: Props) => {
  const { t } = useTranslation('settings-account');
  const avatarLabel = t('avatar');

  const hasAvatar = !!src || !!file;
  const isPreview = !!file;

  return (
    <div className="flex items-center justify-center">
      <div className="relative w-fit">
        <Avatar
          alt={avatarLabel}
          src={file ? URL.createObjectURL(file) : src || undefined}
          size="2xl"
          color="blue"
          className="aspect-square w-[10rem] rounded-full text-4xl md:w-[12rem]"
        >
          {label}
        </Avatar>

        <Menu position="right" withArrow offset={4}>
          <Menu.Target>
            <ActionIcon
              size="lg"
              variant="light"
              className="absolute right-2 top-2 rounded-full border-2 border-zinc-700/30 bg-zinc-100/50 text-black backdrop-blur-xl hover:bg-zinc-800/10 dark:border-zinc-300/30 dark:bg-zinc-300/10 dark:hover:bg-zinc-300/10"
            >
              <Cog6ToothIcon className="h-5 w-5 text-zinc-800 dark:text-zinc-300" />
            </ActionIcon>
          </Menu.Target>

          <Menu.Dropdown>
            <FileButton accept="image/png,image/jpeg" onChange={setFile}>
              {(props) => (
                <Button
                  {...props}
                  variant="light"
                  className="flex w-full border text-zinc-900 hover:bg-zinc-200/70 dark:text-zinc-300 dark:hover:bg-zinc-300/10"
                  leftIcon={
                    <PencilIcon className="h-4 w-4 text-zinc-900 dark:text-zinc-300" />
                  }
                >
                  {t('common:edit')}
                </Button>
              )}
            </FileButton>

            {hasAvatar && (
              <Button
                variant="light"
                className="flex w-full border text-zinc-900 hover:bg-zinc-200/70 dark:text-zinc-300 dark:hover:bg-zinc-300/10"
                leftIcon={
                  <TrashIcon className="h-4 w-4 text-zinc-900 dark:text-zinc-300" />
                }
                onClick={onRemove}
              >
                {t('common:remove')}
              </Button>
            )}
          </Menu.Dropdown>
        </Menu>

        {isPreview && (
          <div className="absolute -bottom-2 left-0 right-0 mx-auto flex w-fit transform items-center justify-center rounded-full bg-clip-text backdrop-blur-xl">
            <div className="w-full rounded-full border-2 border-zinc-700/30 bg-zinc-100/50 bg-clip-padding px-4 py-1 text-center font-semibold text-black dark:border-zinc-300/30 dark:bg-transparent dark:text-zinc-300">
              Preview
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AvatarCard;
