import PromptForm from './prompt-form';
import { Card } from '@tuturuuu/ui/card';

interface Problem {
  id: string;
  title: string;
  description: string;
  maxPromptLength: number;
  exampleInput: string;
  exampleOutput: string;
  testcases: string[];
}

export default function PromptComponent({ problem }: { problem: Problem }) {
  return (
    <Card className="bg-foreground/10 text-foreground h-[813px] w-1/2 overflow-y-auto p-4 pt-10">
      <PromptForm problem={problem} />
    </Card>
  );
}
