import type { NovaChallengeCriteria } from '@tuturuuu/types/db';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';

export function ChallengeCriteriaDialog({
  trigger,
  criteria,
}: {
  trigger: React.ReactNode;
  criteria: NovaChallengeCriteria[];
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-screen min-h-[500px] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Challenge Criteria</DialogTitle>

          {criteria.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <DialogDescription>
                No criteria found for this challenge.
              </DialogDescription>
            </div>
          ) : (
            <>
              <DialogDescription>
                When prompting, ensure that you follow the criteria below:
              </DialogDescription>

              <div className="max-h-[calc(100vh-200px)] overflow-y-auto py-4">
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Score</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {criteria.map((criterion, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">
                            {criterion.name}
                          </TableCell>
                          <TableCell>{criterion.description}</TableCell>
                          <TableCell className="text-right">10</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="mt-4 flex items-center justify-end">
                  <p className="text-md mr-2 font-medium text-muted-foreground">
                    Total score:{' '}
                    <span className="text-xl font-bold text-foreground">
                      10
                    </span>
                  </p>
                </div>

                <div className="mt-2">
                  <p className="text-md font-medium text-foreground">Note:</p>

                  <p className="mr-2 text-sm font-medium text-muted-foreground">
                    Total score = total score of all criteria / (10 * number of
                    criteria)
                  </p>
                </div>
              </div>
            </>
          )}
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
