import { getInitials } from '@/utils/name-helper';
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
import { SettingsIcon, UserIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

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
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const updatePreviewUrl = useCallback(
    (file: File | null) => {
      if (file) {
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
        return () => URL.revokeObjectURL(url);
      } else if (src) {
        setPreviewUrl(src);
        return;
      } else {
        setPreviewUrl(null);
        return;
      }
    },
    [src]
  );

  useEffect(() => {
    const cleanup = updatePreviewUrl(file);
    return cleanup;
  }, [file, updatePreviewUrl]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newFile = event.target.files?.[0] || null;
    setFile(newFile);
    updatePreviewUrl(newFile);
    setOpened(false);
  };

  const removeFile = () => {
    onRemove();
    setFile(null);
    setPreviewUrl(null);
    setOpened(false);
  };

  const hasAvatar = !!previewUrl;
  const isPreview = !!file;

  return (
    <div className="flex items-center justify-center">
      <div className="relative">
        <Avatar className="h-32 w-32 cursor-pointer overflow-visible text-3xl font-semibold">
          <AvatarImage
            src={previewUrl || undefined}
            alt="Avatar"
            className="object-cover"
          />
          <AvatarFallback className="font-semibold">
            {label ? getInitials(label) : <UserIcon className="h-12 w-12" />}
          </AvatarFallback>
        </Avatar>

        <DropdownMenu open={opened} onOpenChange={setOpened}>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="outline"
              className="absolute -bottom-2 -right-2 h-8 w-8 rounded-full shadow-md"
            >
              <SettingsIcon className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" sideOffset={4}>
            <DropdownMenuItem>
              <label htmlFor="file-upload" className="w-full cursor-pointer">
                {t('common.edit')}
              </label>
              <input
                id="file-upload"
                type="file"
                accept="image/png,image/jpeg"
                onChange={handleFileChange}
                className="hidden"
              />
            </DropdownMenuItem>

            {hasAvatar && (
              <DropdownMenuItem onClick={removeFile}>
                {t('common.remove')}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {isPreview && (
          <div className="absolute -bottom-8 left-0 right-0 mx-auto w-full text-center">
            <span className="rounded-full bg-zinc-100/90 px-3 py-1 text-xs font-semibold text-black dark:bg-zinc-800/90 dark:text-zinc-200">
              {t('settings-account.preview')}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default AvatarCard;
