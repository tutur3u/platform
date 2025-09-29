'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import {
  Archive,
  Calendar,
  Edit3,
  Loader2,
  MoreVertical,
  Plus,
  Trash2,
  User,
} from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface TaskProject {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  creator_id: string;
  creator?: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
  };
}

interface TaskProjectsClientProps {
  wsId: string;
  initialProjects: TaskProject[];
  currentUserId: string;
}

export function TaskProjectsClient({
  wsId,
  initialProjects,
}: TaskProjectsClientProps) {
  const t = useTranslations('dashboard.bucket_dump');

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<TaskProject | null>(
    null
  );
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [editProjectName, setEditProjectName] = useState('');
  const [editProjectDescription, setEditProjectDescription] = useState('');

  // Fetch projects
  const {
    data: projects = initialProjects,
    isLoading: projectsLoading,
    refetch: refetchProjects,
  } = useQuery<TaskProject[]>({
    queryKey: ['workspace', wsId, 'task-projects'],
    queryFn: async () => {
      const response = await fetch(`/api/v1/workspaces/${wsId}/task-projects`);
      if (!response.ok) {
        throw new Error(t('errors.fetch_projects'));
      }
      return response.json();
    },
    initialData: initialProjects,
  });

  // Create project mutation
  const createProjectMutation = useMutation({
    mutationFn: async ({
      name,
      description,
    }: {
      name: string;
      description?: string;
    }) => {
      const response = await fetch(`/api/v1/workspaces/${wsId}/task-projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || t('errors.create_project'));
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success(t('success.project_created'));
      setIsCreateDialogOpen(false);
      setNewProjectName('');
      setNewProjectDescription('');
      refetchProjects();
    },
    onError: (error: Error) => {
      toast.error(error.message || t('errors.create_project'));
    },
  });

  // Update project mutation
  const updateProjectMutation = useMutation({
    mutationFn: async ({
      projectId,
      name,
      description,
    }: {
      projectId: string;
      name: string;
      description?: string;
    }) => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/task-projects/${projectId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, description }),
        }
      );
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || t('errors.update_project'));
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success(t('success.project_updated'));
      setIsEditDialogOpen(false);
      setEditingProject(null);
      setEditProjectName('');
      setEditProjectDescription('');
      refetchProjects();
    },
    onError: (error: Error) => {
      toast.error(error.message || t('errors.update_project'));
    },
  });

  // Delete project mutation
  const deleteProjectMutation = useMutation({
    mutationFn: async (projectId: string) => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/task-projects/${projectId}`,
        {
          method: 'DELETE',
        }
      );
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || t('errors.delete_project'));
      }
    },
    onSuccess: () => {
      toast.success(t('success.project_deleted'));
      refetchProjects();
    },
    onError: (error: Error) => {
      toast.error(error.message || t('errors.delete_project'));
    },
  });

  const handleCreateProject = () => {
    if (!newProjectName.trim()) {
      toast.error(t('errors.empty_project_name'));
      return;
    }
    createProjectMutation.mutate({
      name: newProjectName.trim(),
      description: newProjectDescription.trim() || undefined,
    });
  };

  const handleEditProject = (project: TaskProject) => {
    setEditingProject(project);
    setEditProjectName(project.name);
    setEditProjectDescription(project.description || '');
    setIsEditDialogOpen(true);
  };

  const handleUpdateProject = () => {
    if (!editingProject || !editProjectName.trim()) {
      toast.error(t('errors.empty_project_name'));
      return;
    }
    updateProjectMutation.mutate({
      projectId: editingProject.id,
      name: editProjectName.trim(),
      description: editProjectDescription.trim() || undefined,
    });
  };

  const handleDeleteProject = (projectId: string) => {
    deleteProjectMutation.mutate(projectId);
  };

  const isCreating = createProjectMutation.isPending;
  const isUpdating = updateProjectMutation.isPending;
  const isDeleting = deleteProjectMutation.isPending;

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-lg">All Projects</h2>
          <p className="text-muted-foreground text-sm">
            {projects.length} project{projects.length !== 1 ? 's' : ''} total
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Project
        </Button>
      </div>

      {projectsLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-dynamic-purple" />
        </div>
      ) : projects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Archive className="h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 font-semibold text-lg">No projects yet</h3>
            <p className="text-center text-muted-foreground">
              Create your first project to start organizing tasks across boards.
            </p>
            <Button
              className="mt-4"
              onClick={() => setIsCreateDialogOpen(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              Create Project
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Card key={project.id} className="group">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-base">{project.name}</CardTitle>
                    {project.description && (
                      <CardDescription className="mt-1">
                        {project.description}
                      </CardDescription>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isUpdating || isDeleting}
                        className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => handleEditProject(project)}
                        disabled={isUpdating}
                      >
                        <Edit3 className="mr-2 h-4 w-4 text-dynamic-blue" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleDeleteProject(project.id)}
                        disabled={isDeleting}
                        className="text-dynamic-red focus:text-dynamic-red"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center gap-4 text-muted-foreground text-sm">
                  <div className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    <span>{project.creator?.display_name || 'Unknown'}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    <span>
                      {new Date(project.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Project Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
            <DialogDescription>
              Create a new task project to organize tasks across multiple
              boards.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="project-name" className="font-medium text-sm">
                Project Name
              </Label>
              <Input
                id="project-name"
                placeholder="Enter project name"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                disabled={isCreating}
              />
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="project-description"
                className="font-medium text-sm"
              >
                Description (Optional)
              </Label>
              <Textarea
                id="project-description"
                placeholder="Enter project description"
                value={newProjectDescription}
                onChange={(e) => setNewProjectDescription(e.target.value)}
                disabled={isCreating}
                className="min-h-[80px]"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => setIsCreateDialogOpen(false)}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateProject} disabled={isCreating}>
              {isCreating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Project'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Project Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
            <DialogDescription>Update the project details.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label
                htmlFor="edit-project-name"
                className="font-medium text-sm"
              >
                Project Name
              </Label>
              <Input
                id="edit-project-name"
                placeholder="Enter project name"
                value={editProjectName}
                onChange={(e) => setEditProjectName(e.target.value)}
                disabled={isUpdating}
              />
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="edit-project-description"
                className="font-medium text-sm"
              >
                Description (Optional)
              </Label>
              <Textarea
                id="edit-project-description"
                placeholder="Enter project description"
                value={editProjectDescription}
                onChange={(e) => setEditProjectDescription(e.target.value)}
                disabled={isUpdating}
                className="min-h-[80px]"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => setIsEditDialogOpen(false)}
              disabled={isUpdating}
            >
              Cancel
            </Button>
            <Button onClick={handleUpdateProject} disabled={isUpdating}>
              {isUpdating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                'Update Project'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
