import { Button } from '@tuturuuu/ui/button';

interface Props {
  problemLength: number;
  currentProblem: number;
  onPrev: () => void;
  onNext: () => void;
}

export default function ProblemChanger({
  problemLength,
  currentProblem,
  onPrev,
  onNext,
}: Props) {
  return (
    <div className="flex items-center gap-2">
      <Button onClick={onPrev} variant="outline" size="sm">
        {'<'}
      </Button>
      <div className="text-sm text-black text-foreground">
        {currentProblem} of {problemLength}
      </div>
      <Button onClick={onNext} variant="outline" size="sm">
        {'>'}
      </Button>
    </div>
  );
}
