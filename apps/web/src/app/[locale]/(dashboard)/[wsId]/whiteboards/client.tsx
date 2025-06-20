'use client';

import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import {
  Calendar,
  Grid3X3,
  IconChevronUpDown,
  IconEdit,
  IconPlus,
  IconTrash,
  IconUsers,
  ImageIcon,
  LetterText,
  List,
  MoreHorizontal,
  Pen,
  Search,
} from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Separator } from '@tuturuuu/ui/separator';
import { Toggle } from '@tuturuuu/ui/toggle';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useState } from 'react';

type SortOption = 'alphabetical' | 'dateCreated' | 'lastModified';
type ViewMode = 'grid' | 'list';

export interface Whiteboard {
  id: string;
  title: string;
  description?: string;
  dateCreated: Date;
  lastModified: Date;
  thumbnail_url?: string;
  creatorName: string;
}

export default function WhiteboardsList({
  whiteboards,
}: {
  whiteboards: Whiteboard[];
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('lastModified');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const t = useTranslations('common');

  const getSortLabel = (option: SortOption) => {
    switch (option) {
      case 'alphabetical':
        return 'Alphabetical';
      case 'dateCreated':
        return 'Date Created';
      case 'lastModified':
        return 'Last Modified';
    }
  };

  const getSortIcon = (option: SortOption) => {
    switch (option) {
      case 'alphabetical':
        return <LetterText className="h-4 w-4" />;
      case 'dateCreated':
        return <Calendar className="h-4 w-4" />;
      case 'lastModified':
        return <Pen className="h-4 w-4" />;
    }
  };

  const sortedWhiteboards = [...whiteboards]
    .filter((whiteboard) =>
      whiteboard.title.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      switch (sortBy) {
        case 'alphabetical':
          return a.title.localeCompare(b.title);
        case 'dateCreated':
          return b.dateCreated.getTime() - a.dateCreated.getTime();
        case 'lastModified':
          return b.lastModified.getTime() - a.lastModified.getTime();
        default:
          return 0;
      }
    });

  const formatDate = (date: Date) => {
    const now = new Date();
    const diffInDays = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffInDays === 0) return 'Today';
    if (diffInDays === 1) return 'Yesterday';
    if (diffInDays < 7) return `${diffInDays} days ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="container mx-auto space-y-6 p-6">
      {/* Header */}
      <div className="flex justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">
            {t('whiteboards')}
          </h1>
          <p className="text-muted-foreground">
            {t('whiteboards_description')}
          </p>
        </div>
        <Button className="gap-2">
          <IconPlus className="h-4 w-4" />
          {t('new_whiteboard')}
        </Button>
      </div>

      <Separator />

      {/* Controls */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 transform text-muted-foreground" />
            <Input
              placeholder="Search whiteboards..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64 pl-10"
            />
          </div>

          {/* Sort Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                {getSortIcon(sortBy)}
                Sort by {getSortLabel(sortBy)}
                <IconChevronUpDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem
                onClick={() => setSortBy('alphabetical')}
                className="gap-2"
              >
                <LetterText className="h-4 w-4" />
                Alphabetical
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setSortBy('dateCreated')}
                className="gap-2"
              >
                <Calendar className="h-4 w-4" />
                Date Created
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setSortBy('lastModified')}
                className="gap-2"
              >
                <Pen className="h-4 w-4" />
                Last Modified
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center rounded-lg border">
          <Toggle
            pressed={viewMode === 'grid'}
            onPressedChange={() => setViewMode('grid')}
            className="rounded-r-none"
            size="sm"
          >
            <Grid3X3 className="h-4 w-4" />
          </Toggle>
          <Toggle
            pressed={viewMode === 'list'}
            onPressedChange={() => setViewMode('list')}
            className="rounded-l-none border-l"
            size="sm"
          >
            <List className="h-4 w-4" />
          </Toggle>
        </div>
      </div>

      {/* Whiteboard Content */}
      {sortedWhiteboards.length === 0 ? (
        <div className="py-12 text-center">
          <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-muted">
            <Search className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="mb-2 text-lg font-semibold">No whiteboards found</h3>
          <p className="mb-4 text-muted-foreground">
            {searchQuery
              ? `No whiteboards match "${searchQuery}"`
              : 'Get started by creating your first whiteboard'}
          </p>
          {!searchQuery && (
            <Button className="gap-2">
              <IconPlus className="h-4 w-4" />
              Create Whiteboard
            </Button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {sortedWhiteboards.map((whiteboard) => (
            <Card
              key={whiteboard.id}
              className="group cursor-pointer transition-shadow hover:shadow-md"
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-md line-clamp-1">
                    {whiteboard.title}
                  </CardTitle>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem className="gap-2">
                        <IconEdit className="h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem className="gap-2">
                        <IconUsers className="h-4 w-4" />
                        Share
                      </DropdownMenuItem>
                      <DropdownMenuItem className="gap-2">
                        <IconTrash className="h-4 w-4 text-red-500" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent>
                {/* Thumbnail */}
                <div className="mb-4 h-32 w-full overflow-hidden rounded-lg">
                  {whiteboard.thumbnail_url ? (
                    <Image
                      src={whiteboard.thumbnail_url}
                      alt={whiteboard.title}
                      width={128}
                      height={128}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-muted">
                      <div className="text-sm text-muted-foreground">
                        No preview
                      </div>
                    </div>
                  )}
                </div>

                {whiteboard.description && (
                  <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">
                    {whiteboard.description}
                  </p>
                )}

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <IconUsers className="h-3 w-3" />
                    {whiteboard.creatorName}
                  </div>
                  <div className="flex items-center gap-2">
                    <Pen className="h-3 w-3" />
                    {formatDate(whiteboard.lastModified)}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {sortedWhiteboards.map((whiteboard) => (
            <Card
              key={whiteboard.id}
              className="group cursor-pointer transition-shadow hover:shadow-sm"
            >
              <CardContent className="flex items-center gap-4 p-4">
                {/* Thumbnail */}
                <div className="h-12 w-12 overflow-hidden rounded">
                  {whiteboard.thumbnail_url ? (
                    <Image
                      src={whiteboard.thumbnail_url}
                      alt={whiteboard.title}
                      width={128}
                      height={128}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-muted">
                      <div className="text-sm text-muted-foreground">
                        <ImageIcon className="h-4 w-4" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold">{whiteboard.title}</h3>
                  {whiteboard.description && (
                    <p className="truncate text-sm text-muted-foreground">
                      {whiteboard.description}
                    </p>
                  )}
                </div>

                {/* Metadata */}
                <div className="flex items-center gap-6 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <IconUsers className="h-3 w-3" />
                    {whiteboard.creatorName}
                  </div>
                  <div className="flex items-center gap-1">
                    <Pen className="h-3 w-3" />
                    {formatDate(whiteboard.lastModified)}
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {formatDate(whiteboard.dateCreated)}
                  </div>
                </div>

                {/* Actions */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem className="gap-2">
                      <IconEdit className="h-4 w-4" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem className="gap-2">
                      <IconUsers className="h-4 w-4" />
                      Share
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
