'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BriefcaseBusiness,
  CheckCircle2,
  Clock,
  Link,
  Sparkles,
} from '@tuturuuu/icons';
import {
  createCanonicalExternalProject,
  updateCanonicalExternalProject,
  updateWorkspaceExternalProjectBinding,
} from '@tuturuuu/internal-api';
import type {
  CanonicalExternalProject,
  Json,
  WorkspaceExternalProjectBindingAudit,
} from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Textarea } from '@tuturuuu/ui/textarea';
import { type ReactNode, useDeferredValue, useState } from 'react';
import {
  DEFAULT_EXTERNAL_PROJECT_COLLECTIONS,
  EXTERNAL_PROJECT_ADAPTER_OPTIONS,
} from '@/lib/external-projects/constants';

type Strings = {
  actionPanelDescription: string;
  actionPanelTitle: string;
  activeLabel: string;
  activeProjectsLabel: string;
  adapterCoverageLabel: string;
  adapterLabel: string;
  allAdaptersLabel: string;
  auditFeedDescription: string;
  bindAction: string;
  bindDescription: string;
  bindTitle: string;
  bindingPreviewLabel: string;
  canonicalIdLabel: string;
  createAction: string;
  createDescription: string;
  createTitle: string;
  deliveryProfileHint: string;
  deliveryProfileLabel: string;
  displayNameLabel: string;
  inactiveLabel: string;
  invalidJsonLabel: string;
  liveBindingsLabel: string;
  noAuditsDescription: string;
  noAuditsTitle: string;
  noProjectsDescription: string;
  noProjectsTitle: string;
  overviewDescription: string;
  overviewTitle: string;
  recentAuditsTitle: string;
  recommendedCollectionsLabel: string;
  registryDescription: string;
  registryTitle: string;
  resultsLabel: string;
  rootSearchPlaceholder: string;
  saveAction: string;
  searchEmptyDescription: string;
  searchEmptyTitle: string;
  totalProjectsLabel: string;
  unbindAction: string;
  unboundLabel: string;
  useForBindingAction: string;
  workspaceIdLabel: string;
};

function buildDefaultDeliveryProfile(
  adapter: CanonicalExternalProject['adapter']
) {
  return JSON.stringify(
    {
      adapter,
      deliveryPreset: `${adapter}-default`,
    },
    null,
    2
  );
}

function tryParseJson(value: string): Json | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function formatCanonicalToken(value: string) {
  return value
    .split(/[-_]/g)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function formatAuditTime(value: string) {
  return new Date(value).toLocaleString();
}

function MetricCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/55 p-4">
      <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/80 bg-background/80 text-muted-foreground">
        {icon}
      </div>
      <div className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
        {label}
      </div>
      <div className="mt-1 font-semibold text-2xl">{value}</div>
    </div>
  );
}

function EmptyPanel({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <div className="rounded-xl border border-border/80 border-dashed bg-background/30 px-4 py-10 text-center">
      <div className="font-medium">{title}</div>
      <div className="mx-auto mt-2 max-w-xl text-muted-foreground text-sm leading-6">
        {description}
      </div>
    </div>
  );
}

function ProjectRegistryCard({
  onPrepareBinding,
  onSave,
  project,
  strings,
}: {
  onPrepareBinding: () => void;
  onSave: (
    displayName: string,
    isActive: boolean,
    deliveryProfile: Json
  ) => void;
  project: CanonicalExternalProject;
  strings: Pick<
    Strings,
    | 'activeLabel'
    | 'adapterLabel'
    | 'deliveryProfileHint'
    | 'deliveryProfileLabel'
    | 'displayNameLabel'
    | 'inactiveLabel'
    | 'invalidJsonLabel'
    | 'recommendedCollectionsLabel'
    | 'saveAction'
    | 'useForBindingAction'
  >;
}) {
  const [displayName, setDisplayName] = useState(project.display_name);
  const [isActive, setIsActive] = useState(project.is_active);
  const [deliveryProfileText, setDeliveryProfileText] = useState(
    JSON.stringify(project.delivery_profile ?? {}, null, 2)
  );

  const deliveryProfileJson = tryParseJson(deliveryProfileText);

  return (
    <div className="rounded-2xl border border-border/70 bg-background/35 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="rounded-full">
              {formatCanonicalToken(project.adapter)}
            </Badge>
            <Badge
              variant={isActive ? 'default' : 'outline'}
              className="rounded-full"
            >
              {isActive ? strings.activeLabel : strings.inactiveLabel}
            </Badge>
          </div>
          <div>
            <div className="font-medium text-lg">{project.display_name}</div>
            <div className="text-muted-foreground text-sm">
              {project.id} · {strings.adapterLabel}:{' '}
              {formatCanonicalToken(project.adapter)}
            </div>
          </div>
        </div>

        <Button variant="outline" onClick={onPrepareBinding}>
          {strings.useForBindingAction}
        </Button>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[0.62fr_0.38fr]">
        <div className="space-y-4">
          <div className="grid gap-2">
            <Label>{strings.displayNameLabel}</Label>
            <Input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <Label>{strings.deliveryProfileLabel}</Label>
              <span className="text-muted-foreground text-xs">
                {strings.deliveryProfileHint}
              </span>
            </div>
            <Textarea
              rows={6}
              value={deliveryProfileText}
              onChange={(event) => setDeliveryProfileText(event.target.value)}
              className={
                deliveryProfileText.trim() && deliveryProfileJson === null
                  ? 'border-destructive/70 focus-visible:ring-destructive/30'
                  : undefined
              }
            />
            {deliveryProfileText.trim() && deliveryProfileJson === null ? (
              <p className="text-destructive text-xs">
                {strings.invalidJsonLabel}
              </p>
            ) : null}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-border/70 bg-card/80 p-4">
            <div className="mb-2 text-muted-foreground text-xs uppercase tracking-[0.18em]">
              {strings.recommendedCollectionsLabel}
            </div>
            <div className="flex flex-wrap gap-2">
              {project.allowed_collections.map((collection) => (
                <Badge
                  key={collection}
                  variant="secondary"
                  className="rounded-full"
                >
                  {formatCanonicalToken(collection)}
                </Badge>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-card/80 px-4 py-3">
            <Checkbox
              checked={isActive}
              onCheckedChange={(checked) => setIsActive(Boolean(checked))}
              id={`active-${project.id}`}
            />
            <Label htmlFor={`active-${project.id}`}>
              {strings.activeLabel}
            </Label>
          </div>

          <Button
            className="w-full"
            onClick={() =>
              deliveryProfileJson &&
              onSave(displayName, isActive, deliveryProfileJson)
            }
            disabled={!displayName.trim() || deliveryProfileJson === null}
          >
            {strings.saveAction}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function RootExternalProjectsAdminClient({
  initialAudits,
  initialProjects,
  strings,
}: {
  initialAudits: WorkspaceExternalProjectBindingAudit[];
  initialProjects: CanonicalExternalProject[];
  strings: Strings;
}) {
  const queryClient = useQueryClient();
  const [createForm, setCreateForm] = useState({
    adapter: 'junly' as CanonicalExternalProject['adapter'],
    deliveryProfile: buildDefaultDeliveryProfile('junly'),
    displayName: '',
    id: '',
  });
  const [bindingForm, setBindingForm] = useState({
    canonicalId: initialProjects[0]?.id ?? '',
    workspaceId: '',
  });
  const [adapterFilter, setAdapterFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const deferredSearchQuery = useDeferredValue(searchQuery);
  const normalizedQuery = deferredSearchQuery.trim().toLowerCase();
  const createPayloadJson = tryParseJson(createForm.deliveryProfile);
  const selectedBindingProject =
    initialProjects.find((project) => project.id === bindingForm.canonicalId) ??
    null;
  const activeProjects = initialProjects.filter((project) => project.is_active);
  const activeBindingCount = Array.from(
    initialAudits
      .reduce((map, audit) => {
        if (!map.has(audit.destination_ws_id)) {
          map.set(audit.destination_ws_id, audit.next_canonical_id);
        }
        return map;
      }, new Map<string, string | null>())
      .values()
  ).filter(Boolean).length;
  const adapterCoverageCount = new Set(
    initialProjects.map((project) => project.adapter)
  ).size;

  const filteredProjects = initialProjects.filter((project) => {
    const matchesAdapter =
      adapterFilter === 'all' || project.adapter === adapterFilter;
    const matchesQuery =
      !normalizedQuery ||
      project.id.toLowerCase().includes(normalizedQuery) ||
      project.display_name.toLowerCase().includes(normalizedQuery);

    return matchesAdapter && matchesQuery;
  });

  const createProjectMutation = useMutation({
    mutationFn: async () =>
      createCanonicalExternalProject({
        adapter: createForm.adapter,
        allowed_collections:
          DEFAULT_EXTERNAL_PROJECT_COLLECTIONS[createForm.adapter],
        allowed_features: [],
        delivery_profile: createPayloadJson ?? {},
        display_name: createForm.displayName,
        id: createForm.id,
        is_active: true,
        metadata: {},
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      window.location.reload();
    },
  });

  const bindMutation = useMutation({
    mutationFn: async () =>
      updateWorkspaceExternalProjectBinding(
        bindingForm.workspaceId,
        bindingForm.canonicalId || null
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      window.location.reload();
    },
  });

  const updateProjectMutation = useMutation({
    mutationFn: async ({
      deliveryProfile,
      displayName,
      id,
      isActive,
    }: {
      deliveryProfile: Json;
      displayName: string;
      id: string;
      isActive: boolean;
    }) =>
      updateCanonicalExternalProject(id, {
        delivery_profile: deliveryProfile,
        display_name: displayName,
        is_active: isActive,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      window.location.reload();
    },
  });

  const createDisabled =
    !createForm.id.trim() ||
    !createForm.displayName.trim() ||
    createPayloadJson === null ||
    createProjectMutation.isPending;

  const bindDisabled =
    !bindingForm.workspaceId.trim() || bindMutation.isPending;

  return (
    <div className="space-y-6 pb-8">
      <section className="overflow-hidden rounded-3xl border border-border/70 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.12),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))]">
        <div className="grid gap-6 p-6 xl:grid-cols-[1.1fr_0.9fr] xl:p-8">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/60 px-3 py-1 text-muted-foreground text-xs uppercase tracking-[0.24em]">
              <Sparkles className="h-3.5 w-3.5" />
              {strings.overviewTitle}
            </div>
            <div className="space-y-2">
              <h1 className="max-w-2xl font-semibold text-3xl tracking-tight">
                {strings.registryTitle}
              </h1>
              <p className="max-w-2xl text-muted-foreground text-sm leading-6">
                {strings.overviewDescription}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <MetricCard
              label={strings.totalProjectsLabel}
              value={String(initialProjects.length)}
              icon={<BriefcaseBusiness className="h-4 w-4" />}
            />
            <MetricCard
              label={strings.activeProjectsLabel}
              value={String(activeProjects.length)}
              icon={<CheckCircle2 className="h-4 w-4" />}
            />
            <MetricCard
              label={strings.liveBindingsLabel}
              value={String(activeBindingCount)}
              icon={<Link className="h-4 w-4" />}
            />
            <MetricCard
              label={strings.adapterCoverageLabel}
              value={`${adapterCoverageCount}/${EXTERNAL_PROJECT_ADAPTER_OPTIONS.length}`}
              icon={<Sparkles className="h-4 w-4" />}
            />
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.12fr_0.88fr]">
        <div className="space-y-6">
          <Card className="border-border/70 bg-card/80">
            <CardHeader>
              <CardTitle>{strings.registryTitle}</CardTitle>
              <CardDescription>{strings.registryDescription}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
                <div className="grid gap-2">
                  <Label>{strings.rootSearchPlaceholder}</Label>
                  <Input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder={strings.rootSearchPlaceholder}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>{strings.adapterLabel}</Label>
                  <Select
                    value={adapterFilter}
                    onValueChange={setAdapterFilter}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        {strings.allAdaptersLabel}
                      </SelectItem>
                      {EXTERNAL_PROJECT_ADAPTER_OPTIONS.map((adapter) => (
                        <SelectItem key={adapter} value={adapter}>
                          {formatCanonicalToken(adapter)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="text-muted-foreground text-sm">
                {filteredProjects.length} {strings.resultsLabel}
              </div>

              {filteredProjects.length === 0 ? (
                <EmptyPanel
                  title={strings.searchEmptyTitle}
                  description={strings.searchEmptyDescription}
                />
              ) : (
                <div className="space-y-4">
                  {filteredProjects.map((project) => (
                    <ProjectRegistryCard
                      key={project.id}
                      project={project}
                      strings={strings}
                      onPrepareBinding={() =>
                        setBindingForm((current) => ({
                          ...current,
                          canonicalId: project.id,
                        }))
                      }
                      onSave={(displayName, isActive, deliveryProfile) =>
                        updateProjectMutation.mutate({
                          deliveryProfile,
                          displayName,
                          id: project.id,
                          isActive,
                        })
                      }
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/80">
            <CardHeader>
              <CardTitle>{strings.recentAuditsTitle}</CardTitle>
              <CardDescription>{strings.auditFeedDescription}</CardDescription>
            </CardHeader>
            <CardContent>
              {initialAudits.length === 0 ? (
                <EmptyPanel
                  title={strings.noAuditsTitle}
                  description={strings.noAuditsDescription}
                />
              ) : (
                <div className="space-y-3">
                  {initialAudits.map((audit) => (
                    <div
                      key={audit.id}
                      className="rounded-xl border border-border/70 bg-background/40 p-4"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary" className="rounded-full">
                              {audit.next_canonical_id
                                ? strings.bindAction
                                : strings.unbindAction}
                            </Badge>
                            <span className="font-medium">
                              {audit.destination_ws_id}
                            </span>
                          </div>
                          <div className="text-muted-foreground text-sm">
                            {audit.previous_canonical_id ??
                              strings.unboundLabel}{' '}
                            {'->'}{' '}
                            {audit.next_canonical_id ?? strings.unboundLabel}
                          </div>
                          <div className="text-muted-foreground text-xs">
                            {audit.source_ws_id}
                            {audit.actor_user_id
                              ? ` · ${audit.actor_user_id}`
                              : ''}
                          </div>
                        </div>
                        <div className="inline-flex items-center gap-2 text-muted-foreground text-xs">
                          <Clock className="h-3.5 w-3.5" />
                          {formatAuditTime(audit.changed_at)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 xl:sticky xl:top-24 xl:self-start">
          <Card className="border-border/70 bg-card/80">
            <CardHeader>
              <CardTitle>{strings.actionPanelTitle}</CardTitle>
              <CardDescription>
                {strings.actionPanelDescription}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-1">
                  <div className="font-medium">{strings.createTitle}</div>
                  <div className="text-muted-foreground text-sm">
                    {strings.createDescription}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="canonical-id">
                      {strings.canonicalIdLabel}
                    </Label>
                    <Input
                      id="canonical-id"
                      value={createForm.id}
                      onChange={(event) =>
                        setCreateForm((current) => ({
                          ...current,
                          id: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="display-name">
                      {strings.displayNameLabel}
                    </Label>
                    <Input
                      id="display-name"
                      value={createForm.displayName}
                      onChange={(event) =>
                        setCreateForm((current) => ({
                          ...current,
                          displayName: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-[0.55fr_0.45fr]">
                  <div className="grid gap-2">
                    <Label>{strings.adapterLabel}</Label>
                    <Select
                      value={createForm.adapter}
                      onValueChange={(value) =>
                        setCreateForm((current) => ({
                          ...current,
                          adapter: value as CanonicalExternalProject['adapter'],
                          deliveryProfile: buildDefaultDeliveryProfile(
                            value as CanonicalExternalProject['adapter']
                          ),
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EXTERNAL_PROJECT_ADAPTER_OPTIONS.map((adapter) => (
                          <SelectItem key={adapter} value={adapter}>
                            {formatCanonicalToken(adapter)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="rounded-xl border border-border/80 border-dashed bg-background/40 p-4">
                    <div className="mb-2 text-muted-foreground text-xs uppercase tracking-[0.18em]">
                      {strings.recommendedCollectionsLabel}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {DEFAULT_EXTERNAL_PROJECT_COLLECTIONS[
                        createForm.adapter
                      ].map((collection) => (
                        <Badge
                          key={collection}
                          variant="secondary"
                          className="rounded-full"
                        >
                          {formatCanonicalToken(collection)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="delivery-profile">
                      {strings.deliveryProfileLabel}
                    </Label>
                    <span className="text-muted-foreground text-xs">
                      {strings.deliveryProfileHint}
                    </span>
                  </div>
                  <Textarea
                    id="delivery-profile"
                    rows={7}
                    value={createForm.deliveryProfile}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        deliveryProfile: event.target.value,
                      }))
                    }
                    className={
                      createForm.deliveryProfile.trim() &&
                      createPayloadJson === null
                        ? 'border-destructive/70 focus-visible:ring-destructive/30'
                        : undefined
                    }
                  />
                  {createForm.deliveryProfile.trim() &&
                  createPayloadJson === null ? (
                    <p className="text-destructive text-xs">
                      {strings.invalidJsonLabel}
                    </p>
                  ) : null}
                </div>

                <Button
                  onClick={() => createProjectMutation.mutate()}
                  disabled={createDisabled}
                  className="w-full"
                >
                  {strings.createAction}
                </Button>
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <div className="font-medium">{strings.bindTitle}</div>
                  <div className="text-muted-foreground text-sm">
                    {strings.bindDescription}
                  </div>
                </div>

                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="workspace-id">
                      {strings.workspaceIdLabel}
                    </Label>
                    <Input
                      id="workspace-id"
                      value={bindingForm.workspaceId}
                      onChange={(event) =>
                        setBindingForm((current) => ({
                          ...current,
                          workspaceId: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>{strings.canonicalIdLabel}</Label>
                    <Select
                      value={bindingForm.canonicalId || '__none__'}
                      onValueChange={(value) =>
                        setBindingForm((current) => ({
                          ...current,
                          canonicalId: value === '__none__' ? '' : value,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">
                          {strings.unboundLabel}
                        </SelectItem>
                        {initialProjects.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.display_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button
                    onClick={() => bindMutation.mutate()}
                    disabled={bindDisabled}
                  >
                    {bindingForm.canonicalId
                      ? strings.bindAction
                      : strings.unbindAction}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      setBindingForm((current) => ({
                        ...current,
                        canonicalId: '',
                      }))
                    }
                    disabled={bindMutation.isPending}
                  >
                    {strings.unbindAction}
                  </Button>
                </div>

                <div className="rounded-xl border border-border/70 bg-background/40 p-4">
                  <div className="mb-3 text-muted-foreground text-xs uppercase tracking-[0.18em]">
                    {strings.bindingPreviewLabel}
                  </div>
                  {selectedBindingProject ? (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant={
                            selectedBindingProject.is_active
                              ? 'default'
                              : 'outline'
                          }
                          className="rounded-full"
                        >
                          {selectedBindingProject.is_active
                            ? strings.activeLabel
                            : strings.inactiveLabel}
                        </Badge>
                        <span className="font-medium">
                          {selectedBindingProject.display_name}
                        </span>
                      </div>
                      <div className="text-muted-foreground text-sm">
                        {selectedBindingProject.id} ·{' '}
                        {formatCanonicalToken(selectedBindingProject.adapter)}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {selectedBindingProject.allowed_collections.map(
                          (collection) => (
                            <Badge
                              key={collection}
                              variant="secondary"
                              className="rounded-full"
                            >
                              {formatCanonicalToken(collection)}
                            </Badge>
                          )
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      {strings.noProjectsDescription}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
