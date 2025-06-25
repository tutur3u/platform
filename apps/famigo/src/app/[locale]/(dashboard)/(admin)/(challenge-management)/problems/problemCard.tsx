'use client';

import type { NovaProblem, NovaProblemTestCase } from '@tuturuuu/types/db';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tuturuuu/ui/alert-dialog';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Pencil, Trash } from '@tuturuuu/ui/icons';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import EditProblemDialog from './editProblemDialog';

type ExtendedNovaProblem = NovaProblem & {
  challenge: {
    title: string;
  };
  test_cases: NovaProblemTestCase[];
};

interface ProblemCardProps {
  problem: ExtendedNovaProblem;
}

export default function ProblemCard({ problem }: ProblemCardProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const router = useRouter();

  const handleDeleteProblem = async () => {
    try {
      const response = await fetch(`/api/v1/problems/${problem.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        router.refresh();
      } else {
        toast({
          title: 'Failed to delete problem.',
          description: 'Please try again.',
        });
      }
    } catch (error) {
      console.error('Error deleting problem:', error);
      toast({
        title: 'An error occurred while deleting the problem.',
        description: 'Please try again.',
      });
    }
  };

  return (
    <>
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
              <span className="text-sm font-medium">Max Prompt Length:</span>
              <span className="ml-2 text-sm">{problem.max_prompt_length}</span>
            </div>
            <div>
              <span className="text-sm font-medium">Challenge:</span>
              <span className="ml-2 text-sm">{problem.challenge.title}</span>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Link href={`/problems/${problem.id}`}>
            <Button variant="default">View</Button>
          </Link>
          <div className="flex gap-2">
            <EditProblemDialog
              problem={problem}
              trigger={
                <Button variant="outline" size="icon">
                  <Pencil className="h-4 w-4" />
                </Button>
              }
            />
            <Button
              variant="destructive"
              size="icon"
              onClick={() => setShowDeleteDialog(true)}
            >
              <Trash className="h-4 w-4" />
            </Button>
          </div>
        </CardFooter>
      </Card>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Problem</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this problem? This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteProblem}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
