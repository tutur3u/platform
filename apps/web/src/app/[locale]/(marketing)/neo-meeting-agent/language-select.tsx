import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ncthub/ui/select';
import { useTranslations } from 'next-intl';

interface LanguageSelectProps {
  onValueChange: (value: string) => void;
  defaultValue: string;
}

export function LanguageSelect({
  onValueChange,
  defaultValue,
}: LanguageSelectProps) {
  const t = useTranslations('neo-meeting-agent');

  return (
    <Select onValueChange={onValueChange} defaultValue={defaultValue}>
      <SelectTrigger className="w-full border bg-card text-foreground transition-colors duration-300 hover:bg-muted/40">
        <SelectValue placeholder="Language" />
      </SelectTrigger>
      <SelectContent className="border-color bg-card text-foreground">
        <SelectItem value="english">{t('languages.english')}</SelectItem>
        <SelectItem value="vietnamese">{t('languages.vietnamese')}</SelectItem>
      </SelectContent>
    </Select>
  );
}
