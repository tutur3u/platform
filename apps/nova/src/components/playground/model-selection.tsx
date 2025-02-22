import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';

interface ModelSelectionProps {
  selectedModel: string;
  setSelectedModel: (model: string) => void;
}

export function ModelSelection({
  selectedModel,
  setSelectedModel,
}: ModelSelectionProps) {
  const models = ['gpt-3.5-turbo', 'gpt-4', 'claude-v1', 'palm-2'];

  return (
    <div className="w-[200px]">
      <Select value={selectedModel} onValueChange={setSelectedModel}>
        <SelectTrigger>
          <SelectValue placeholder="Select a model" />
        </SelectTrigger>
        <SelectContent>
          {models.map((model) => (
            <SelectItem key={model} value={model}>
              {model}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
