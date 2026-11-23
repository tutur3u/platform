'use client';

import { FolderKanban } from '@tuturuuu/icons';
import { useMemo } from 'react';
import { LoadingRegion, SkeletonLine } from '../skeleton';
import { Combobox, type ComboboxOption } from './combobox';

export type ProjectPickerOption = {
  id: string;
  name: string;
  status?: string | null;
};

export type ProjectPickerLabels = {
  placeholder: string;
  search: string;
  empty: string;
  clear: string;
  loading: string;
};

export type ProjectPickerState =
  | { status: 'loading' }
  | { status: 'ready'; projects: ProjectPickerOption[] };

export type ProjectPickerProps = {
  state: ProjectPickerState;
  /** The selected project id, or null for no project. */
  value: string | null;
  onChange: (projectId: string | null) => void;
  labels: ProjectPickerLabels;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
};

/** Chooses one workspace Project, with an explicit way back to none. */
export function ProjectPicker({
  state,
  value,
  onChange,
  labels,
  ariaLabel,
  disabled = false,
  className,
}: ProjectPickerProps) {
  const projects = state.status === 'ready' ? state.projects : null;
  const options = useMemo<ComboboxOption[]>(
    () =>
      (projects ?? []).map((project) => ({
        value: project.id,
        label: project.name,
        icon: <FolderKanban aria-hidden="true" className="size-4" />,
      })),
    [projects]
  );

  if (state.status === 'loading') {
    return (
      <LoadingRegion className={className} srLabel={labels.loading}>
        <SkeletonLine barClassName="w-full" size="base" />
      </LoadingRegion>
    );
  }

  return (
    <Combobox
      actions={
        value
          ? [
              {
                key: 'clear',
                label: labels.clear,
                onSelect: () => onChange(null),
              },
            ]
          : undefined
      }
      ariaLabel={ariaLabel ?? labels.placeholder}
      className={className}
      disabled={disabled}
      emptyText={labels.empty}
      onChange={(next) => {
        const id = Array.isArray(next) ? next[0] : next;
        onChange(id ? id : null);
      }}
      options={options}
      placeholder={labels.placeholder}
      searchPlaceholder={labels.search}
      selected={value ?? ''}
      triggerIcon={<FolderKanban aria-hidden="true" className="size-4" />}
    />
  );
}
