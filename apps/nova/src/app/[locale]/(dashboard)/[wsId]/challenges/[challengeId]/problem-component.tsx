import { Card } from '@tuturuuu/ui/card';

interface Problem {
  id: string;
  title: string;
  description: string;
  exampleInput: string;
  exampleOutput: string;
  constraints?: string[]; // Optional constraints field
}

export default function ProblemComponent({ problem }: { problem: Problem }) {
  return (
    <div>
      <Card className="text-foreground bg-foreground/10 min-h-[500px] overflow-y-auto p-4 pt-10">
        <h2 className="text-xl font-bold">{problem.title}</h2>
        <p className="mt-2">{problem.description}</p>
        <h3 className="mt-3 font-semibold">Example:</h3>
        <pre className="bg-foreground/10 overflow-y-auto whitespace-pre-wrap rounded-md p-2">
          {`Input: s = "${problem.exampleInput}"\n\nOutput: "${problem.exampleOutput}"`}
        </pre>

        {/* Render constraints if available */}
        {problem.constraints && problem.constraints.length > 0 && (
          <>
            <h3 className="mt-3 font-semibold">Constraints:</h3>
            <ul className="ml-5 list-disc">
              {problem.constraints.map((constraint, index) => (
                <li key={index}>{constraint}</li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}
