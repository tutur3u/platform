'use client';

import { Folder } from '@tuturuuu/icons';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@tuturuuu/ui/breadcrumb';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

interface BreadcrumbItemType {
  label: string;
  href: string;
  isRoot: boolean;
}

interface Props {
  wsId: string;
  path?: string;
}

export default function DriveBreadcrumbs({ wsId, path }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Build breadcrumb navigation
  const pathSegments = path ? path.split('/').filter(Boolean) : [];
  const breadcrumbItems: BreadcrumbItemType[] = [
    {
      label: t('ws-storage-objects.name'),
      href: `/${wsId}/drive`,
      isRoot: true,
    },
    ...pathSegments.map((segment, index) => {
      const currentPath = pathSegments.slice(0, index + 1).join('/');
      return {
        label: decodeURIComponent(segment),
        href: `/${wsId}/drive?path=${currentPath}`,
        isRoot: false,
      };
    }),
  ];

  // Ellipsis logic: show first, last, and up to 2 in the middle; collapse the rest
  let visibleItems = breadcrumbItems;
  let collapsedItems: typeof breadcrumbItems = [];
  if (breadcrumbItems.length > 5) {
    visibleItems = [];
    if (breadcrumbItems[0]) visibleItems.push(breadcrumbItems[0]);
    if (breadcrumbItems[1]) visibleItems.push(breadcrumbItems[1]);
    visibleItems.push(...breadcrumbItems.slice(-3));
    collapsedItems = breadcrumbItems.slice(2, -3);
  }

  const handleNavigate = (item: BreadcrumbItemType) => {
    const params = new URLSearchParams(searchParams.toString());

    if (item.isRoot) {
      params.delete('path');
    } else {
      const pathMatch = item.href.match(/path=([^&]*)/);
      if (pathMatch?.[1]) {
        params.set('path', decodeURIComponent(pathMatch[1]));
      }
    }

    const queryString = params.toString();
    router.push(`${pathname}${queryString ? `?${queryString}` : ''}`, {
      scroll: false,
    });
  };

  return (
    <Breadcrumb>
      <BreadcrumbList className="mb-4 flex items-center gap-1 overflow-x-auto whitespace-nowrap rounded-lg border border-dynamic-border bg-muted/40 px-1 py-2">
        {visibleItems.map((item, index) => (
          <div key={item.href} className="flex items-center">
            <BreadcrumbItem>
              {item.isRoot ? (
                <BreadcrumbLink asChild>
                  <button
                    type="button"
                    onClick={() => handleNavigate(item)}
                    className="flex items-center gap-1 rounded px-2 py-1 font-semibold text-dynamic-blue transition-colors hover:text-dynamic-blue/80 focus:outline-none focus:ring-2 focus:ring-dynamic-blue/30"
                  >
                    <Folder className="mr-1 h-4 w-4 text-dynamic-blue/70" />
                    {item.label}
                  </button>
                </BreadcrumbLink>
              ) : index === visibleItems.length - 1 ? (
                <BreadcrumbPage className="flex items-center gap-1 rounded px-2 py-1 font-semibold text-dynamic-blue">
                  <Folder className="mr-1 h-4 w-4 text-dynamic-blue/70" />
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-block max-w-[120px] truncate align-middle">
                          {item.label}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>{item.label}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <button
                    type="button"
                    onClick={() => handleNavigate(item)}
                    className="flex items-center gap-1 rounded px-2 py-1 transition-colors hover:text-dynamic-blue focus:outline-none focus:ring-2 focus:ring-dynamic-blue/30"
                  >
                    <Folder className="mr-1 h-4 w-4 text-dynamic-blue/70" />
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-block max-w-[120px] truncate align-middle">
                            {item.label}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>{item.label}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </button>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
            {/* Ellipsis for collapsed items */}
            {index === 1 && collapsedItems.length > 0 && (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="rounded px-2 py-1 text-muted-foreground hover:bg-muted/60 focus:outline-none focus:ring-2 focus:ring-dynamic-blue/30"
                      >
                        …
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {collapsedItems.map((collapsed) => (
                        <DropdownMenuItem key={collapsed.href} asChild>
                          <button
                            type="button"
                            onClick={() => handleNavigate(collapsed)}
                            className="flex w-full items-center gap-1"
                          >
                            <Folder className="mr-1 h-4 w-4 text-dynamic-blue/70" />
                            <span>{collapsed.label}</span>
                          </button>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </BreadcrumbItem>
              </>
            )}
            {index < visibleItems.length - 1 && <BreadcrumbSeparator />}
          </div>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
