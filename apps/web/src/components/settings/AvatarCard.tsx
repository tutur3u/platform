import { Cog6ToothIcon } from '@heroicons/react/24/solid';
import { ActionIcon, Avatar, Button, FileButton, Menu } from '@mantine/core';
import useTranslation from 'next-translate/useTranslation';
import { useState } from 'react';

interface Props {
  src: string | null;
  label?: string;
  file: File | null;
  setFile: (file: File | null) => void;
  onRemove: () => void;
}

const AvatarCard = ({ src, label, file, setFile, onRemove }: Props) => {
  const { t } = useTranslation('settings-account');
  const avatarLabel = t('avatar');

  const [opened, setOpened] = useState(false);

  const updateFile = (file: File | null) => {
    setFile(file);
    setOpened(false);
  };

  const removeFile = () => {
    onRemove();
    setOpened(false);
  };

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

        <Menu
          position="right"
          withArrow
          offset={4}
          opened={opened}
          onChange={setOpened}
        >
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
            <FileButton accept="image/png,image/jpeg" onChange={updateFile}>
              {(props) => (
                <Button
                  {...props}
                  variant="light"
                  className="flex w-full border text-zinc-900 hover:bg-zinc-200/70 dark:text-zinc-300 dark:hover:bg-zinc-300/10"
                >
                  {t('common:edit')}
                </Button>
              )}
            </FileButton>

            {hasAvatar ? (
              isPreview ? (
                <Button
                  variant="light"
                  className="flex w-full border text-zinc-900 hover:bg-zinc-200/70 dark:text-zinc-300 dark:hover:bg-zinc-300/10"
                  onClick={() => updateFile(null)}
                >
                  {t('revert_changes')}
                </Button>
              ) : (
                <Button
                  variant="light"
                  className="flex w-full border text-zinc-900 hover:bg-zinc-200/70 dark:text-zinc-300 dark:hover:bg-zinc-300/10"
                  onClick={removeFile}
                >
                  {t('common:remove')}
                </Button>
              )
            ) : null}
          </Menu.Dropdown>
        </Menu>

        {isPreview && (
          <div className="absolute -bottom-2 left-0 right-0 mx-auto flex w-fit transform items-center justify-center rounded-full bg-clip-text backdrop-blur-xl">
            <div className="w-full rounded-full border-2 border-zinc-700/30 bg-zinc-100/50 bg-clip-padding px-4 py-1 text-center font-semibold text-black dark:border-zinc-300/30 dark:bg-transparent dark:text-zinc-300">
              {t('preview')}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AvatarCard;
