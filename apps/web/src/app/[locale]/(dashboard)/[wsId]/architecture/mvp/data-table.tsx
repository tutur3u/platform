'use client';

import { CustomDataTable } from '@/components/custom-data-table';
import { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { Bolt, MoreHorizontal } from 'lucide-react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

interface ArchitectureProject {
  id: string;
  name: string;
  location: string;
  building_requirements: string;
  created_at: string;
  analysis?: any;
  status?: 'pending' | 'completed' | 'in-progress';
}

interface ArchitectureDataTableProps {
  data: ArchitectureProject[];
  count: number;
  defaultVisibility?: Record<string, boolean>;
}

function BatchActions({
  selectedRows,
  wsId,
}: {
  selectedRows: ArchitectureProject[];
  wsId: string;
}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const router = useRouter();

  const generateAll = async () => {
    if (selectedRows.length === 0) {
      toast({
        title: 'No projects selected',
        description:
          'Please select at least one project to generate analysis for.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsGenerating(true);

      // Update all selected projects to 'in-progress' status
      const updatePromises = selectedRows.map((project) =>
        fetch(`/api/v1/workspaces/${wsId}/architecture/${project.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            status: 'in-progress',
          }),
        })
      );

      await Promise.all(updatePromises);

      toast({
        title: 'Analysis generation started',
        description: `Started generating analysis for ${selectedRows.length} projects. You will be redirected to the first project.`,
      });

      // Redirect to the first project
      const firstProject = selectedRows[0];
      if (firstProject && firstProject.id) {
        router.push(`/${wsId}/architecture/mvp/${firstProject.id}`);
      }
    } catch (error) {
      toast({
        title: 'Failed to start analysis',
        description:
          error instanceof Error ? error.message : 'An unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  if (selectedRows.length === 0) return null;

  return (
    <div className="flex items-center space-x-2">
      <Button
        variant="default"
        size="sm"
        onClick={generateAll}
        disabled={isGenerating}
        className="flex items-center"
      >
        <Bolt className="mr-2 h-4 w-4" />
        {isGenerating
          ? 'Starting...'
          : `Generate Analysis (${selectedRows.length})`}
      </Button>
    </div>
  );
}

export function ArchitectureDataTable({
  data,
  count,
  defaultVisibility,
}: ArchitectureDataTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { wsId } = useParams();
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const onDelete = async (id: string) => {
    setIsDeleting(true);
    setDeletingId(id);
    try {
      const res = await fetch(`/api/v1/workspaces/${wsId}/architecture/${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        toast({
          title: 'Project deleted',
          description: 'The project has been deleted successfully',
        });
        router.refresh();
      } else {
        const data = await res.json();
        toast({
          title: 'Failed to delete project',
          description: data.message,
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Failed to delete project',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
      setDeletingId(null);
    }
  };

  const onGenerateAnalysis = async (project: ArchitectureProject) => {
    try {
      setIsGenerating(true);
      setGeneratingId(project.id);

      // First, update the project status to in-progress
      await fetch(`/api/v1/workspaces/${wsId}/architecture/${project.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'in-progress',
        }),
      });

      // Redirect to the project page where the analysis will be generated
      router.push(`/${wsId}/architecture/mvp/${project.id}`);

      toast({
        title: 'Analysis generation started',
        description:
          'You will be redirected to view the analysis generation progress.',
      });
    } catch (error) {
      toast({
        title: 'Failed to start analysis',
        description:
          error instanceof Error ? error.message : 'An unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
      setGeneratingId(null);
    }
  };

  const columns: ColumnDef<ArchitectureProject>[] = [
    {
      accessorKey: 'id',
      header: 'ID',
    },
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => {
        return (
          <div
            className="cursor-pointer"
            onClick={() => router.push(`${pathname}/${row.original.id}`)}
          >
            {row.getValue('name')}
          </div>
        );
      },
    },
    {
      accessorKey: 'location',
      header: 'Location',
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const status = (row.getValue('status') as string) || 'pending';

        return (
          <Badge
            variant={
              status === 'completed'
                ? 'default'
                : status === 'in-progress'
                  ? 'secondary'
                  : 'outline'
            }
          >
            {status === 'in-progress'
              ? 'In Progress'
              : status === 'completed'
                ? 'Completed'
                : 'Pending'}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'created_at',
      header: 'Created',
      cell: ({ row }) => {
        return formatDistanceToNow(new Date(row.getValue('created_at')), {
          addSuffix: true,
        });
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const project = row.original;

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => router.push(`${pathname}/${project.id}`)}
              >
                View
              </DropdownMenuItem>
              {(!project.analysis || project.status === 'completed') && (
                <DropdownMenuItem
                  onClick={() => onGenerateAnalysis(project)}
                  disabled={isGenerating && generatingId === project.id}
                >
                  {isGenerating && generatingId === project.id
                    ? 'Preparing...'
                    : project.analysis
                      ? 'Regenerate Analysis'
                      : 'Generate Analysis'}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => onDelete(project.id)}
                className="text-destructive"
                disabled={isDeleting && deletingId === project.id}
              >
                {isDeleting && deletingId === project.id
                  ? 'Deleting...'
                  : 'Delete'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          variant="outline"
          onClick={() => router.push(`/${wsId}/architecture/mvp/compare`)}
          className="flex items-center gap-2"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="16 3 21 3 21 8"></polyline>
            <line x1="4" y1="20" x2="21" y2="3"></line>
            <polyline points="21 16 21 21 16 21"></polyline>
            <line x1="15" y1="15" x2="21" y2="21"></line>
            <line x1="4" y1="4" x2="9" y2="9"></line>
          </svg>
          Compare Projects
        </Button>
      </div>

      <CustomDataTable
        data={data}
        columns={columns}
        namespace="architecture-data-table"
        count={count}
        defaultVisibility={defaultVisibility}
      />
    </div>
  );
}
