import { NovaProblem } from '@tuturuuu/types/db';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { Pencil, Trash } from 'lucide-react';
import Link from 'next/link';

export default function ProblemCard({ problem }: { problem: NovaProblem }) {
  return (
    <Card className="h-full transition-all hover:shadow-md">
      <CardHeader>
        <CardTitle className="line-clamp-1">{problem.title}</CardTitle>
        <CardDescription className="line-clamp-2">
          {problem.description}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2">
          <div>
            <span className="text-sm font-medium">Max Input Length:</span>
            <span className="ml-2 text-sm">{problem.max_input_length}</span>
          </div>
          {problem.challenge_id && (
            <div>
              <span className="text-sm font-medium">Challenge ID:</span>
              <span className="ml-2 text-sm">{problem.challenge_id}</span>
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Link href={`/problems/${problem.id}`}>
          <Button variant="default">View</Button>
        </Link>
        <div className="flex gap-2">
          <Link href={`/problems/${problem.id}/edit`}>
            <Button variant="outline" size="icon">
              <Pencil className="h-4 w-4" />
            </Button>
          </Link>
          <Button variant="destructive" size="icon">
            <Trash className="h-4 w-4" />
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
