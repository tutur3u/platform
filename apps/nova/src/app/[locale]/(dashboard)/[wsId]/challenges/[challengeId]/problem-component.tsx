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
      <Card className="min-h-[500px] overflow-y-auto bg-foreground/10 p-4 pt-10 text-foreground">
        <h2 className="text-xl font-bold">{problem.title}</h2>
        <p className="mt-2">{problem.description}</p>
        <h3 className="mt-3 font-semibold">Example:</h3>
        <pre className="overflow-y-auto rounded-md bg-foreground/10 p-2 whitespace-pre-wrap">
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
