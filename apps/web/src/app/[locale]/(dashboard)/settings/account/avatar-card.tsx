import { getInitials } from '@/utils/name-helper';
import { Cog6ToothIcon } from '@heroicons/react/24/solid';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@repo/ui/components/ui/avatar';
import { Button } from '@repo/ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@repo/ui/components/ui/dropdown-menu';
import { UserIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface Props {
  src: string | null;
  label?: string;
  file: File | null;
  setFile: (file: File | null) => void;
  onRemove: () => void;
}

const AvatarCard = ({ src, label, file, setFile, onRemove }: Props) => {
  const t = useTranslations();

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
        <Avatar className="relative cursor-pointer overflow-visible font-semibold">
          <AvatarImage
            src={file ? URL.createObjectURL(file) : src || undefined}
            className="overflow-clip rounded-full"
          />
          <AvatarFallback className="font-semibold">
            {label ? getInitials(label) : <UserIcon className="h-5 w-5" />}
          </AvatarFallback>
        </Avatar>

        <DropdownMenu open={opened} onOpenChange={setOpened}>
          <DropdownMenuTrigger asChild>
            <Button size="sm">
              <Cog6ToothIcon className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" sideOffset={4}>
            <DropdownMenuItem asChild>
              <>
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={(e) => updateFile(e.target.files?.[0] || null)}
                  style={{ display: 'none' }}
                  id="file-upload"
                />
                <label htmlFor="file-upload">
                  <Button>{t('common.edit')}</Button>
                </label>
              </>
            </DropdownMenuItem>

            {hasAvatar ? (
              isPreview ? (
                <DropdownMenuItem asChild>
                  <Button onClick={() => updateFile(null)}>
                    {t('settings-account.revert_changes')}
                  </Button>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem asChild>
                  <Button onClick={removeFile}>{t('common.remove')}</Button>
                </DropdownMenuItem>
              )
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>

        {isPreview && (
          <div className="absolute -bottom-2 left-0 right-0 mx-auto flex w-fit transform items-center justify-center rounded-full bg-clip-text backdrop-blur-xl">
            <div className="w-full rounded-full border-2 border-zinc-700/30 bg-zinc-100/50 bg-clip-padding px-4 py-1 text-center font-semibold text-black dark:border-zinc-300/30 dark:bg-transparent dark:text-zinc-300">
              {t('settings-account.preview')}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AvatarCard;
