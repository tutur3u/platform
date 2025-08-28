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
}

export function LanguageSelect({
  onValueChange,
  defaultValue,
}: LanguageSelectProps) {
  return (
    <Select onValueChange={onValueChange} defaultValue={defaultValue}>
      <SelectTrigger className="border-color w-full bg-[#18181B] text-white">
        <SelectValue placeholder="Language" />
      </SelectTrigger>
      <SelectContent className="border-color bg-[#18181B] text-white">
        <SelectItem value="english">English</SelectItem>
        <SelectItem value="vietnamese">Vietnamese</SelectItem>
      </SelectContent>
    </Select>
  );
}
