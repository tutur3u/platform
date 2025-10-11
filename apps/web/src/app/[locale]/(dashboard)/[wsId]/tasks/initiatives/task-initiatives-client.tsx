'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Archive,
  Calendar,
  Edit3,
  Layers,
  Link,
  Loader2,
  MoreVertical,
  Plus,
  Trash2,
  User,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
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
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

type InitiativeStatus = 'active' | 'completed' | 'on_hold' | 'cancelled';

type LinkedProject = {
  id: string;
  name: string;
  status: string | null;
};

type TaskInitiative = {
  id: string;
  name: string;
  description: string | null;
  status: InitiativeStatus | null;
  created_at: string;
  creator?: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  projectsCount: number;
  linkedProjects: LinkedProject[];
};

type TaskProjectOption = {
  id: string;
  name: string;
  status: string | null;
};

interface TaskInitiativesClientProps {
  wsId: string;
  initialInitiatives: TaskInitiative[];
}

const STATUS_LABELS: Record<InitiativeStatus, string> = {
  active: 'Active',
  completed: 'Completed',
  on_hold: 'On hold',
  cancelled: 'Cancelled',
};

const STATUS_BADGE_CLASS: Record<InitiativeStatus, string> = {
  active: 'bg-dynamic-green/15 text-dynamic-green border-transparent',
  completed: 'bg-dynamic-blue/15 text-dynamic-blue border-transparent',
  on_hold: 'bg-dynamic-yellow/15 text-dynamic-yellow border-transparent',
  cancelled: 'bg-dynamic-red/15 text-dynamic-red border-transparent',
};

export function TaskInitiativesClient({
  wsId,
  initialInitiatives,
}: TaskInitiativesClientProps) {
  const t = useTranslations('dashboard.bucket_dump');

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingInitiative, setEditingInitiative] =
    useState<TaskInitiative | null>(null);
  const [newInitiativeName, setNewInitiativeName] = useState('');
  const [newInitiativeDescription, setNewInitiativeDescription] = useState('');
  const [newInitiativeStatus, setNewInitiativeStatus] =
    useState<InitiativeStatus>('active');
  const [editInitiativeName, setEditInitiativeName] = useState('');
  const [editInitiativeDescription, setEditInitiativeDescription] =
    useState('');
  const [editInitiativeStatus, setEditInitiativeStatus] =
    useState<InitiativeStatus>('active');
  const [managingInitiative, setManagingInitiative] =
    useState<TaskInitiative | null>(null);
  const [projectToLink, setProjectToLink] = useState('');

  const statusOptions = useMemo(
    () =>
      (Object.keys(STATUS_LABELS) as InitiativeStatus[]).map((value) => ({
        value,
        label: STATUS_LABELS[value],
      })),
    []
  );

  const {
    data: initiatives = initialInitiatives,
    isLoading: initiativesLoading,
    refetch: refetchInitiatives,
  } = useQuery<TaskInitiative[]>({
    queryKey: ['workspace', wsId, 'task-initiatives'],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/task-initiatives`
      );
      if (!response.ok) {
        throw new Error(t('errors.fetch_initiatives'));
      }
      return response.json();
    },
    initialData: initialInitiatives,
    staleTime: 30_000,
  });

  const {
    data: allProjects = [],
    isLoading: projectsLoading,
    error: projectsError,
  } = useQuery<TaskProjectOption[]>({
    queryKey: ['workspace', wsId, 'task-projects-for-initiatives'],
    queryFn: async () => {
      const response = await fetch(`/api/v1/workspaces/${wsId}/task-projects`);
      if (!response.ok) {
        throw new Error(t('errors.fetch_projects'));
      }
      const rawProjects = await response.json();
      return (
        rawProjects as Array<{
          id: string;
          name: string;
          status?: string | null;
        }>
      ).map((project) => ({
        id: project.id,
        name: project.name,
        status: project.status ?? null,
      }));
    },
    enabled: Boolean(managingInitiative),
    staleTime: 60_000,
  });

  const availableProjects = useMemo(() => {
    if (!managingInitiative) {
      return [] as TaskProjectOption[];
    }
    const linkedIds = new Set(
      managingInitiative.linkedProjects.map((project) => project.id)
    );
    return allProjects.filter((project) => !linkedIds.has(project.id));
  }, [allProjects, managingInitiative]);

  useEffect(() => {
    if (!managingInitiative) {
      return;
    }
    const latest = initiatives.find(
      (initiative) => initiative.id === managingInitiative.id
    );
    if (latest && latest !== managingInitiative) {
      setManagingInitiative(latest);
    }
  }, [initiatives, managingInitiative]);

  useEffect(() => {
    if (availableProjects.length === 0) {
      setProjectToLink('');
    }
  }, [availableProjects.length]);

  const createInitiativeMutation = useMutation({
    mutationFn: async ({
      name,
      description,
      status,
    }: {
      name: string;
      description?: string;
      status: InitiativeStatus;
    }) => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/task-initiatives`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, description, status }),
        }
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || t('errors.create_initiative'));
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success(t('success.initiative_created'));
      setIsCreateDialogOpen(false);
      setNewInitiativeName('');
      setNewInitiativeDescription('');
      setNewInitiativeStatus('active');
      refetchInitiatives();
    },
    onError: (error: Error) => {
      toast.error(error.message || t('errors.create_initiative'));
    },
  });

  const updateInitiativeMutation = useMutation({
    mutationFn: async ({
      initiativeId,
      name,
      description,
      status,
    }: {
      initiativeId: string;
      name: string;
      description?: string;
      status: InitiativeStatus;
    }) => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/task-initiatives/${initiativeId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, description, status }),
        }
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || t('errors.update_initiative'));
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success(t('success.initiative_updated'));
      setIsEditDialogOpen(false);
      setEditingInitiative(null);
      setEditInitiativeName('');
      setEditInitiativeDescription('');
      setEditInitiativeStatus('active');
      refetchInitiatives();
    },
    onError: (error: Error) => {
      toast.error(error.message || t('errors.update_initiative'));
    },
  });

  const deleteInitiativeMutation = useMutation({
    mutationFn: async (initiativeId: string) => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/task-initiatives/${initiativeId}`,
        {
          method: 'DELETE',
        }
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || t('errors.delete_initiative'));
      }
    },
    onSuccess: () => {
      toast.success(t('success.initiative_deleted'));
      refetchInitiatives();
    },
    onError: (error: Error) => {
      toast.error(error.message || t('errors.delete_initiative'));
    },
  });

  const linkProjectMutation = useMutation({
    mutationFn: async ({
      initiativeId,
      projectId,
    }: {
      initiativeId: string;
      projectId: string;
    }) => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/task-initiatives/${initiativeId}/projects`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId }),
        }
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || t('errors.link_project'));
      }
      return response.json();
    },
    onSuccess: (_data, variables) => {
      toast.success(t('success.project_linked'));
      setProjectToLink('');
      if (variables) {
        const linkedProject = allProjects.find(
          (project) => project.id === variables.projectId
        );
        if (linkedProject) {
          setManagingInitiative((prev) =>
            prev
              ? {
                  ...prev,
                  projectsCount: prev.projectsCount + 1,
                  linkedProjects: [...prev.linkedProjects, linkedProject],
                }
              : prev
          );
        }
      }
      refetchInitiatives();
    },
    onError: (error: Error) => {
      toast.error(error.message || t('errors.link_project'));
    },
  });

  const unlinkProjectMutation = useMutation({
    mutationFn: async ({
      initiativeId,
      projectId,
    }: {
      initiativeId: string;
      projectId: string;
    }) => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/task-initiatives/${initiativeId}/projects/${projectId}`,
        {
          method: 'DELETE',
        }
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || t('errors.unlink_project'));
      }
      return response.json();
    },
    onSuccess: (_data, variables) => {
      toast.success(t('success.project_unlinked'));
      if (variables) {
        setManagingInitiative((prev) =>
          prev
            ? {
                ...prev,
                projectsCount: Math.max(prev.projectsCount - 1, 0),
                linkedProjects: prev.linkedProjects.filter(
                  (project) => project.id !== variables.projectId
                ),
              }
            : prev
        );
      }
      refetchInitiatives();
    },
    onError: (error: Error) => {
      toast.error(error.message || t('errors.unlink_project'));
    },
  });

  const handleCreateInitiative = () => {
    if (!newInitiativeName.trim()) {
      toast.error(t('errors.empty_initiative_name'));
      return;
    }

    createInitiativeMutation.mutate({
      name: newInitiativeName.trim(),
      description: newInitiativeDescription.trim() || undefined,
      status: newInitiativeStatus,
    });
  };

  const handleEditInitiative = (initiative: TaskInitiative) => {
    setEditingInitiative(initiative);
    setEditInitiativeName(initiative.name);
    setEditInitiativeDescription(initiative.description || '');
    setEditInitiativeStatus(initiative.status ?? 'active');
    setIsEditDialogOpen(true);
  };

  const handleUpdateInitiative = () => {
    if (!editingInitiative || !editInitiativeName.trim()) {
      toast.error(t('errors.empty_initiative_name'));
      return;
    }

    updateInitiativeMutation.mutate({
      initiativeId: editingInitiative.id,
      name: editInitiativeName.trim(),
      description: editInitiativeDescription.trim() || undefined,
      status: editInitiativeStatus,
    });
  };

  const handleOpenManageProjects = (initiative: TaskInitiative) => {
    setManagingInitiative(initiative);
    setProjectToLink('');
  };

  const handleCloseManageProjects = () => {
    setManagingInitiative(null);
    setProjectToLink('');
  };

  const handleLinkProject = () => {
    if (!managingInitiative) {
      return;
    }
    if (!projectToLink) {
      toast.error(t('errors.no_project_selected'));
      return;
    }
    linkProjectMutation.mutate({
      initiativeId: managingInitiative.id,
      projectId: projectToLink,
    });
  };

  const handleUnlinkProject = (projectId: string) => {
    if (!managingInitiative) {
      return;
    }
    unlinkProjectMutation.mutate({
      initiativeId: managingInitiative.id,
      projectId,
    });
  };

  const handleDeleteInitiative = (initiativeId: string) => {
    deleteInitiativeMutation.mutate(initiativeId);
  };

  const isCreating = createInitiativeMutation.isPending;
  const isUpdating = updateInitiativeMutation.isPending;
  const isDeleting = deleteInitiativeMutation.isPending;
  const isLinking = linkProjectMutation.isPending;
  const isUnlinking = unlinkProjectMutation.isPending;

  const renderStatusBadge = (status: InitiativeStatus | null) => {
    const key = status ?? 'active';
    return (
      <Badge className={STATUS_BADGE_CLASS[key]}>{STATUS_LABELS[key]}</Badge>
    );
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-lg">All Initiatives</h2>
          <p className="text-muted-foreground text-sm">
            {initiatives.length} initiative
            {initiatives.length === 1 ? '' : 's'} total
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Initiative
        </Button>
      </div>

      {initiativesLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-dynamic-purple" />
        </div>
      ) : initiatives.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Archive className="h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 font-semibold text-lg">No initiatives yet</h3>
            <p className="text-center text-muted-foreground">
              Create your first initiative to coordinate related projects and
              outcomes.
            </p>
            <Button
              className="mt-4"
              onClick={() => setIsCreateDialogOpen(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              Create Initiative
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {initiatives.map((initiative) => (
            <Card key={initiative.id} className="group">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-2">
                    <div className="flex flex-col gap-2">
                      <CardTitle className="text-base">
                        {initiative.name}
                      </CardTitle>
                      {renderStatusBadge(initiative.status)}
                    </div>
                    {initiative.description && (
                      <CardDescription>
                        {initiative.description}
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
                        onClick={() => handleEditInitiative(initiative)}
                        disabled={isUpdating}
                      >
                        <Edit3 className="mr-2 h-4 w-4 text-dynamic-blue" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleDeleteInitiative(initiative.id)}
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
                <div className="flex flex-wrap items-center gap-4 text-muted-foreground text-sm">
                  <div className="flex items-center gap-1">
                    <Layers className="h-3 w-3" />
                    <span>
                      {initiative.projectsCount} project
                      {initiative.projectsCount === 1 ? '' : 's'} linked
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    <span>{initiative.creator?.display_name || 'Unknown'}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    <span>
                      {new Date(initiative.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  {initiative.linkedProjects.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {initiative.linkedProjects.map((project) => (
                        <Badge key={project.id} variant="outline">
                          {project.name}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      No projects linked yet.
                    </p>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleOpenManageProjects(initiative)}
                    disabled={isLinking || isUnlinking}
                  >
                    <Link className="mr-2 h-4 w-4" />
                    Manage Projects
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Initiative</DialogTitle>
            <DialogDescription>
              Define a strategic initiative to coordinate multiple projects.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="initiative-name" className="font-medium text-sm">
                Initiative Name
              </Label>
              <Input
                id="initiative-name"
                placeholder="Enter initiative name"
                value={newInitiativeName}
                onChange={(event) => setNewInitiativeName(event.target.value)}
                disabled={isCreating}
              />
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="initiative-description"
                className="font-medium text-sm"
              >
                Description (Optional)
              </Label>
              <Textarea
                id="initiative-description"
                placeholder="Describe the initiative goals"
                value={newInitiativeDescription}
                onChange={(event) =>
                  setNewInitiativeDescription(event.target.value)
                }
                disabled={isCreating}
                className="min-h-[80px]"
              />
            </div>
            <div className="space-y-2">
              <Label className="font-medium text-sm">Status</Label>
              <Select
                value={newInitiativeStatus}
                onValueChange={(value: InitiativeStatus) =>
                  setNewInitiativeStatus(value)
                }
                disabled={isCreating}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            <Button onClick={handleCreateInitiative} disabled={isCreating}>
              {isCreating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Initiative'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Initiative</DialogTitle>
            <DialogDescription>
              Update details and status for this initiative.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label
                htmlFor="edit-initiative-name"
                className="font-medium text-sm"
              >
                Initiative Name
              </Label>
              <Input
                id="edit-initiative-name"
                placeholder="Enter initiative name"
                value={editInitiativeName}
                onChange={(event) => setEditInitiativeName(event.target.value)}
                disabled={isUpdating}
              />
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="edit-initiative-description"
                className="font-medium text-sm"
              >
                Description (Optional)
              </Label>
              <Textarea
                id="edit-initiative-description"
                placeholder="Describe the initiative goals"
                value={editInitiativeDescription}
                onChange={(event) =>
                  setEditInitiativeDescription(event.target.value)
                }
                disabled={isUpdating}
                className="min-h-[80px]"
              />
            </div>
            <div className="space-y-2">
              <Label className="font-medium text-sm">Status</Label>
              <Select
                value={editInitiativeStatus}
                onValueChange={(value: InitiativeStatus) =>
                  setEditInitiativeStatus(value)
                }
                disabled={isUpdating}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            <Button onClick={handleUpdateInitiative} disabled={isUpdating}>
              {isUpdating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                'Update Initiative'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(managingInitiative)}
        onOpenChange={(open) => {
          if (!open) {
            handleCloseManageProjects();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage Linked Projects</DialogTitle>
            <DialogDescription>
              Link existing task projects to this initiative.
            </DialogDescription>
          </DialogHeader>

          {managingInitiative ? (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label className="font-medium text-sm">Linked Projects</Label>
                {managingInitiative.linkedProjects.length > 0 ? (
                  <div className="space-y-2">
                    {managingInitiative.linkedProjects.map((project) => (
                      <div
                        key={project.id}
                        className="flex items-center justify-between rounded-md border border-dynamic-surface/50 bg-dynamic-surface/40 px-3 py-2"
                      >
                        <div>
                          <p className="font-medium text-sm">{project.name}</p>
                          {project.status ? (
                            <p className="text-muted-foreground text-xs capitalize">
                              {project.status.replace(/_/g, ' ')}
                            </p>
                          ) : null}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-dynamic-red hover:text-dynamic-red focus-visible:text-dynamic-red"
                          onClick={() => handleUnlinkProject(project.id)}
                          disabled={isUnlinking}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    No projects linked yet.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="font-medium text-sm">Link a Project</Label>
                <Select
                  value={projectToLink}
                  onValueChange={setProjectToLink}
                  disabled={
                    projectsLoading ||
                    availableProjects.length === 0 ||
                    isLinking
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projectsLoading ? (
                      <SelectItem disabled value="loading">
                        Loading projects...
                      </SelectItem>
                    ) : availableProjects.length === 0 ? (
                      <SelectItem disabled value="none">
                        No available projects
                      </SelectItem>
                    ) : (
                      availableProjects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {projectsError ? (
                  <p className="text-dynamic-red text-sm">
                    {(projectsError as Error).message}
                  </p>
                ) : availableProjects.length === 0 && !projectsLoading ? (
                  <p className="text-muted-foreground text-sm">
                    All workspace projects are linked already.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={handleCloseManageProjects}>
              Close
            </Button>
            <Button
              onClick={handleLinkProject}
              disabled={
                !projectToLink || isLinking || availableProjects.length === 0
              }
            >
              {isLinking ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Linking...
                </>
              ) : (
                'Link Project'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
