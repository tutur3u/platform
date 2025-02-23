import { Button } from '@tuturuuu/ui/button';

interface Props {
  proNum: number;
  currentProblem: number;
  onNext: () => void;
  onPrev: () => void;
}

export default function ProblemChanger({
  proNum,
  onNext,
  onPrev,
  currentProblem,
}: Props) {
  return (
    <div className="flex items-center gap-2">
      <Button onClick={onPrev} variant="outline" size="sm">
        {'<'}
      </Button>
      <div className="text-foreground text-sm text-black">
        {currentProblem} of {proNum}
      </div>
      <Button onClick={onNext} variant="outline" size="sm">
        {'>'}
      </Button>
    </div>
  );
}
