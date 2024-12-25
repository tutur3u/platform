import { Button } from '@repo/ui/components/ui/button';
import { ScrollArea } from '@repo/ui/components/ui/scroll-area';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';

interface Challenge {
  id: number;
  title: string;
  description: string;
}

interface TimelineProps {
  challenges: Challenge[];
  currentChallenge: number;
  onSelectChallenge: (id: number) => void;
}

export function Timeline({
  challenges,
  currentChallenge,
  onSelectChallenge,
}: TimelineProps) {
  const [startIndex, setStartIndex] = useState(0);
  const visibleChallenges = challenges.slice(startIndex, startIndex + 5);

  const handlePrevious = () => {
    if (startIndex > 0) setStartIndex(startIndex - 1);
  };

  const handleNext = () => {
    if (startIndex + 5 < challenges.length) setStartIndex(startIndex + 1);
  };

  return (
    <div className="mb-6">
      <h2 className="mb-2 text-lg font-semibold">Challenges Timeline</h2>
      <div className="flex items-center space-x-2">
        <Button
          variant="outline"
          size="icon"
          onClick={handlePrevious}
          disabled={startIndex === 0}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <ScrollArea className="flex-grow">
          <div className="flex space-x-2">
            {visibleChallenges.map((challenge) => (
              <Button
                key={challenge.id}
                variant={
                  challenge.id === currentChallenge ? 'default' : 'outline'
                }
                onClick={() => onSelectChallenge(challenge.id)}
                className="flex-shrink-0"
              >
                {challenge.title}
              </Button>
            ))}
          </div>
        </ScrollArea>
        <Button
          variant="outline"
          size="icon"
          onClick={handleNext}
          disabled={startIndex + 5 >= challenges.length}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
