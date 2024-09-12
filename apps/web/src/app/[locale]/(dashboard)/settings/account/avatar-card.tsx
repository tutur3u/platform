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
import { useState } from 'react';

interface Props {
  src: string | null;
  label?: string;
  onFileSelect: (file: File) => void;
  onRemove: () => void;
}

const AvatarCard = ({ src, label, onFileSelect, onRemove }: Props) => {
  const t = useTranslations();
  const [opened, setOpened] = useState(false);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    console.log('call handleFileChange');
    const file = event.target.files?.[0];
    if (file) {
      onFileSelect(file);
    }
    setOpened(false);
  };

  const hasAvatar = !!src;

  return (
    <div className="flex items-center justify-center">
      <div className="relative">
        <Avatar className="h-32 w-32 cursor-pointer overflow-visible text-3xl font-semibold">
          <AvatarImage
            src={src || undefined}
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
                onChange={handleFileChange} // this function is not called
                className="hidden"
              />
            </DropdownMenuItem>

            {hasAvatar && (
              <DropdownMenuItem onClick={onRemove}>
                {t('common.remove')}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

export default AvatarCard;
