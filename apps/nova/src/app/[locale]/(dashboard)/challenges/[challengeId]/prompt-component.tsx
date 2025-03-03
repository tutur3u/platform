import PromptForm from './prompt-form';
import { Card } from '@tuturuuu/ui/card';

interface Problem {
  id: string;
  title: string;
  description: string;
  maxInputLength: number;
  exampleInput: string;
  exampleOutput: string;
  testcases: string[];
}

export default function PromptComponent({ problem }: { problem: Problem }) {
  return (
    <Card className="h-[813px] w-1/2 overflow-y-auto bg-foreground/10 p-4 pt-10 text-foreground">
      <PromptForm problem={problem} />
    </Card>
  );
}
