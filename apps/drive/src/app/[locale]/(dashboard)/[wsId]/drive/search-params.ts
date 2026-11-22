'use client';

import { parseAsString, parseAsStringLiteral } from 'nuqs';
import { type DriveTypeFilter, driveTypeFilters } from './drive-file-kind';

export const DRIVE_FETCH_PAGE_SIZE = 20;

export const driveSortByValues = [
  'name',
  'created_at',
  'updated_at',
  'size',
] as const;

export const driveSortOrderValues = ['asc', 'desc'] as const;
export const driveViewModes = ['grid', 'list'] as const;

export type DriveSortBy = (typeof driveSortByValues)[number];
export type DriveSortOrder = (typeof driveSortOrderValues)[number];
export type DriveViewMode = (typeof driveViewModes)[number];

const driveNavigationOptions = {
  shallow: true,
} as const;

export const driveSearchParamParsers = {
  path: parseAsString.withDefault('').withOptions(driveNavigationOptions),
  q: parseAsString.withDefault('').withOptions({
    ...driveNavigationOptions,
    throttleMs: 250,
  }),
  sortBy: parseAsStringLiteral(driveSortByValues)
    .withDefault('created_at')
    .withOptions(driveNavigationOptions),
  sortOrder: parseAsStringLiteral(driveSortOrderValues)
    .withDefault('desc')
    .withOptions(driveNavigationOptions),
  type: parseAsStringLiteral(driveTypeFilters).withOptions(
    driveNavigationOptions
  ),
  view: parseAsStringLiteral(driveViewModes)
    .withDefault('grid')
    .withOptions(driveNavigationOptions),
};

export type DriveSearchState = {
  path: string;
  q: string;
  sortBy: DriveSortBy;
  sortOrder: DriveSortOrder;
  type: DriveTypeFilter | null;
  view: DriveViewMode;
};

export type DriveSearchUpdate = Partial<{
  path: string | null;
  q: string | null;
  sortBy: DriveSortBy;
  sortOrder: DriveSortOrder;
  type: DriveTypeFilter | null;
  view: DriveViewMode;
}>;
