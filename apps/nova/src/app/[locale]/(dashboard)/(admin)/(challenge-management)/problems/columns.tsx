'use client';

import EditProblemDialog from './editProblemDialog';
import { ColumnDef } from '@tanstack/react-table';
import { ExtendedNovaProblem } from '@tuturuuu/types/db';
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
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Edit, Eye, MoreHorizontal, Trash } from '@tuturuuu/ui/icons';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function getProblemColumns(
  t: any,
  _: string | undefined,
  __: any[] | undefined,
  _extraData?: any
): ColumnDef<ExtendedNovaProblem>[] {
  return [
    {
      accessorKey: 'id',
      header: ({ column }) => (
        <DataTableColumnHeader t={t} column={column} title="ID" />
      ),
    },
    {
      accessorKey: 'title',
      header: ({ column }) => (
        <DataTableColumnHeader t={t} column={column} title={'Title'} />
      ),
      cell: ({ row }) => {
        return (
          <Link
            href={`/problems/${row.original.id}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {row.original.title}
          </Link>
        );
      },
    },
    {
      accessorKey: 'challenge.title',
      header: ({ column }) => (
        <DataTableColumnHeader t={t} column={column} title="Challenge Title" />
      ),
      cell: ({ row }) => {
        const isHighlighted =
          _extraData?.filteredChallengeId &&
          row.original.challenge_id === _extraData.filteredChallengeId;

        return (
          <span className={isHighlighted ? 'text-primary font-semibold' : ''}>
            {row.original.challenge?.title || 'Not assigned'}
          </span>
        );
      },
    },
    {
      accessorKey: 'test_cases',
      header: ({ column }) => (
        <DataTableColumnHeader t={t} column={column} title={'Test Cases'} />
      ),
      cell: ({ row }) => {
        return `${row.original.test_cases?.length || 0} tests`;
      },
    },
    {
      accessorKey: 'max_prompt_length',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={'Max Prompt Length'}
        />
      ),
      cell: ({ row }) => {
        return row.original.max_prompt_length || '0';
      },
    },
    {
      id: 'action',
      header: 'Actions',
      cell: ({ row }) => {
        return <ActionCell problem={row.original} />;
      },
    },
  ];
}

function ActionCell({ problem }: { problem: ExtendedNovaProblem }) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const router = useRouter();

  const handleDeleteProblem = async () => {
    try {
      const response = await fetch(`/api/v1/problems/${problem.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast({
          title: 'Problem deleted successfully',
          description: `Problem "${problem.title}" has been removed.`,
        });
        router.refresh();
      } else {
        const error = await response.json();
        throw new Error(error.message || 'Failed to delete problem');
      }
    } catch (error) {
      console.error('Error deleting problem:', error);
      toast({
        title: 'Failed to delete problem',
        description:
          error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      setShowDeleteDialog(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">Open menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>

          <DropdownMenuItem asChild>
            <Link
              href={`/problems/${problem.id}`}
              className="flex items-center"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Eye className="mr-2 h-4 w-4" />
              <span>View</span>
            </Link>
          </DropdownMenuItem>

          <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
            <EditProblemDialog
              problem={problem}
              trigger={
                <div className="flex w-full items-center">
                  <Edit className="mr-2 h-4 w-4" />
                  <span>Edit</span>
                </div>
              }
            />
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            className="text-red-600"
            onSelect={() => setShowDeleteDialog(true)}
          >
            <Trash className="mr-2 h-4 w-4" />
            <span>Delete</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Problem</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{problem.title}"? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteProblem}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
