import { Card } from '@tuturuuu/ui/card';

interface Problem {
  id: string;
  title: string;
  description: string;
  maxInputLength: number;
  exampleInput: string;
  exampleOutput: string;
}

export default function ProblemComponent({ problem }: { problem: Problem }) {
  return (
    <div>
      <Card className="min-h-[500px] overflow-y-auto bg-foreground/10 p-4 pt-10 text-foreground">
        <h2 className="text-xl font-bold">{problem.title}</h2>
        <p className="mt-2">{problem.description}</p>

        <div className="mt-2">
          <h3 className="mt-3 font-semibold">Max Input Length:</h3>
          <p className="mt-2">{problem.maxInputLength}</p>
        </div>

        <div className="mt-2">
          <h3 className="mt-3 font-semibold">Input:</h3>
          <pre className="overflow-y-auto rounded-md bg-foreground/10 p-2 whitespace-pre-wrap">
            {problem.exampleInput}
          </pre>
        </div>

        <div className="mt-2">
          <h3 className="mt-3 font-semibold">Output:</h3>
          <pre className="overflow-y-auto rounded-md bg-foreground/10 p-2 whitespace-pre-wrap">
            {problem.exampleOutput}
          </pre>
        </div>
      </Card>
    </div>
  );
}
