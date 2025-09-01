import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ncthub/ui/select';

interface LanguageSelectProps {
  onValueChange: (value: string) => void;
  defaultValue: string;
  languageLabels: {
    english: string;
    vietnamese: string;
  };
}

export function LanguageSelect({
  onValueChange,
  defaultValue,
  languageLabels,
}: LanguageSelectProps) {
  return (
    <Select onValueChange={onValueChange} defaultValue={defaultValue}>
      <SelectTrigger className="w-full border bg-[#18181B] text-white transition-colors duration-300 hover:bg-muted/40">
        <SelectValue placeholder="Language" />
      </SelectTrigger>
      <SelectContent className="border-color bg-[#18181B] text-white">
        <SelectItem value="english">{languageLabels.english}</SelectItem>
        <SelectItem value="vietnamese">{languageLabels.vietnamese}</SelectItem>
      </SelectContent>
    </Select>
  );
}
