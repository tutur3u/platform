import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tutur3u/ui/components/ui/select';

export interface Challenge {
  id: number;
  title: string;
  topic: string;
  description: string;
  exampleInput: string;
  exampleOutput: string;
}

interface ChallengeSelectionProps {
  challenges: Challenge[];
  currentChallenge: Challenge;
  onSelectChallenge: (challenge: Challenge) => void;
}

export function ChallengeSelection({
  challenges,
  currentChallenge,
  onSelectChallenge,
}: ChallengeSelectionProps) {
  return (
    <div className="w-[300px]">
      <Select
        value={currentChallenge.id?.toString()}
        onValueChange={(value) => {
          const selected = challenges.find((c) => c.id?.toString() === value);
          if (selected) onSelectChallenge(selected);
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder="Select a challenge" />
        </SelectTrigger>
        <SelectContent>
          {challenges.map((challenge) => (
            <SelectItem key={challenge.id} value={challenge.id?.toString()}>
              {challenge.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
