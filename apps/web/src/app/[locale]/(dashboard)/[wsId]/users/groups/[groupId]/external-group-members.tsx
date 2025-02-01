'use client';

import { UserGroup } from '@/types/primitives/UserGroup';
import { Button } from '@repo/ui/components/ui/button';
import { Separator } from '@repo/ui/components/ui/separator';
import { ChevronLeft, ChevronRight, Users } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

export default function ExternalGroupMembers({
  wsId,
  totalUsers,
  groups,
}: {
  wsId: string;
  totalUsers: number;
  groups: UserGroup[];
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const groupsPerPage = 8;

  const indexOfLastGroup = currentPage * groupsPerPage;
  const indexOfFirstGroup = indexOfLastGroup - groupsPerPage;
  const currentGroups = groups.slice(indexOfFirstGroup, indexOfLastGroup);

  const totalPages = Math.ceil(groups.length / groupsPerPage);

  const handleNext = () => {
    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
  };

  const handlePrev = () => {
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  };

  return (
    <>
      {groups.length > groupsPerPage && (
        <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
          <Button
            size="xs"
            variant="secondary"
            onClick={handlePrev}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="h-6 w-6" />
          </Button>

          <Button
            size="xs"
            variant="secondary"
            onClick={handleNext}
            disabled={currentPage === totalPages}
          >
            <ChevronRight className="h-6 w-6" />
          </Button>
        </div>
      )}
      <div className="grid gap-2 md:grid-cols-2">
        {currentGroups.length > 0 &&
          currentGroups.map((group) => (
            <div
              key={group.id}
              className="flex items-center rounded-lg border bg-background p-2"
            >
              <div className="w-full">
                <Link
                  href={`/${wsId}/users/groups/${group.id}`}
                  className="line-clamp-1 rounded border border-transparent text-center font-semibold break-all hover:border-foreground/10 hover:bg-foreground/10"
                >
                  {group.name}
                </Link>
                <Separator className="my-1" />
                <div className="flex w-full items-center justify-center gap-1">
                  <Users className="h-4 w-4" />
                  <div className="text-sm font-semibold">
                    {group.amount}
                    <span className="opacity-50">/{totalUsers}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
      </div>
    </>
  );
}
