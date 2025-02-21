import { Button } from '@tutur3u/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tutur3u/ui/select';

interface VersionControlProps {
  version: number;
  versions: { id: number; prompt: string }[];
  onSave: () => void;
  onLoad: (versionId: number) => void;
}

export function VersionControl({
  version,
  versions,
  onSave,
  onLoad,
}: VersionControlProps) {
  return (
    <div className="mb-4 flex items-center space-x-4">
      <div className="flex-grow">
        <Select
          value={version.toString()}
          onValueChange={(value) => onLoad(parseInt(value))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select version" />
          </SelectTrigger>
          <SelectContent>
            {versions.map((v) => (
              <SelectItem key={v.id} value={v.id.toString()}>
                Version {v.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button onClick={onSave} variant="outline">
        Save Version
      </Button>
    </div>
  );
}
