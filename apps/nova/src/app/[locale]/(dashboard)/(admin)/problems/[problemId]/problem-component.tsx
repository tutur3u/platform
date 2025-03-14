import { Card } from '@tuturuuu/ui/card';

interface Problem {
  id: string;
  title: string;
  description: string;
  maxPromptLength: number;
  exampleInput: string;
  exampleOutput: string;
}

export default function ProblemComponent({ problem }: { problem: Problem }) {
  return (
    <div>
      <Card className="bg-foreground/10 text-foreground min-h-[500px] overflow-y-auto p-4 pt-10">
        <h2 className="text-xl font-bold">{problem.title}</h2>
        <p className="mt-2">{problem.description}</p>

        <div className="mt-2">
          <h3 className="mt-3 font-semibold">Max Prompt Length:</h3>
          <p className="mt-2">{problem.maxPromptLength}</p>
        </div>

        <div className="mt-2">
          <h3 className="mt-3 font-semibold">Example Input:</h3>
          <pre className="bg-foreground/10 overflow-y-auto whitespace-pre-wrap rounded-md p-2">
            {problem.exampleInput}
          </pre>
        </div>

        <div className="mt-2">
          <h3 className="mt-3 font-semibold">Example Output:</h3>
          <pre className="bg-foreground/10 overflow-y-auto whitespace-pre-wrap rounded-md p-2">
            {problem.exampleOutput}
          </pre>
        </div>
      </Card>
    </div>
  );
}
