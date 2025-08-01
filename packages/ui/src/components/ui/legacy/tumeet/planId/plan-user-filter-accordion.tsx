'use client';

import type { PlanUser } from '@tuturuuu/types/primitives/MeetTogetherPlan';
import { useTimeBlocking } from '@tuturuuu/ui/hooks/time-blocking-provider';
import { ShieldCheck } from '@tuturuuu/ui/icons';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

export default function PlanUserFilterAccordion({
  users,
}: {
  users: PlanUser[];
}) {
  const t = useTranslations('meet-together-plan-details');
  const { filteredUserIds, setFilteredUserIds } = useTimeBlocking();
  const [hoveredUserId, setHoveredUserId] = useState<string | null>(null);
  const [isHoverFiltering, setIsHoverFiltering] = useState(false);

  // Track clicked users separately from hover state
  const clickedUsersRef = useRef<string[]>([]);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  const startHoverFilter = useCallback(
    (userId: string) => {
      setFilteredUserIds([userId]);
      setIsHoverFiltering(true);
    },
    [setFilteredUserIds]
  );

  const stopHoverFilter = useCallback(() => {
    // Restore clicked users, or empty array if none clicked
    setFilteredUserIds(clickedUsersRef.current);
    setIsHoverFiltering(false);
  }, [setFilteredUserIds]);

  const clearHoverTimeout = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  }, []);

  const handleMouseEnter = useCallback(
    (userId: string) => {
      // Disable hover if any users have been clicked
      if (clickedUsersRef.current.length > 0) {
        return;
      }

      setHoveredUserId(userId);
      clearHoverTimeout();

      // Start hover filter after a short delay
      hoverTimeoutRef.current = setTimeout(() => {
        startHoverFilter(userId);
      }, 100);
    },
    [startHoverFilter, clearHoverTimeout]
  );

  const handleMouseLeave = useCallback(() => {
    // Disable hover if any users have been clicked
    if (clickedUsersRef.current.length > 0) {
      return;
    }

    setHoveredUserId(null);
    clearHoverTimeout();

    // Stop hover filter after a short delay
    hoverTimeoutRef.current = setTimeout(() => {
      stopHoverFilter();
    }, 100);
  }, [stopHoverFilter, clearHoverTimeout]);

  const handleClick = useCallback(
    (userId: string) => {
      // Clear any pending hover timeouts
      clearHoverTimeout();

      // Clear hover states immediately
      setHoveredUserId(null);
      setIsHoverFiltering(false);

      // Update clicked users
      const newClickedUsers = clickedUsersRef.current.includes(userId)
        ? clickedUsersRef.current.filter((id) => id !== userId)
        : [...clickedUsersRef.current, userId];

      clickedUsersRef.current = newClickedUsers;
      setFilteredUserIds(newClickedUsers);
    },
    [setFilteredUserIds, clearHoverTimeout]
  );

  const filteredUsers = users.filter((user) => user.id);

  return (
    <div className="flex w-full flex-col space-y-4 p-4">
      <div className="space-y-2">
        {filteredUsers.length > 0 ? (
          filteredUsers.map((user) => {
            const userId = user.id ?? '';
            const isSelected = filteredUserIds?.includes(userId);
            const isHovered =
              hoveredUserId === userId &&
              isHoverFiltering &&
              clickedUsersRef.current.length === 0;

            return (
              <button
                key={userId}
                className={`w-full rounded-lg border p-3 text-left transition-all duration-200 ease-in-out ${
                  isSelected
                    ? 'border-foreground/30 bg-foreground/20'
                    : 'bg-foreground/5 hover:bg-foreground/10'
                } ${isHovered ? 'scale-[1.02] ring-2 ring-primary/50' : ''}`}
                onClick={() => handleClick(userId)}
                onMouseEnter={() => handleMouseEnter(userId)}
                onMouseLeave={handleMouseLeave}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="font-medium">{user.display_name}</div>
                    {user.is_guest ? (
                      <div className="rounded bg-foreground px-2 py-0.5 text-xs text-background">
                        {t('guest')}
                      </div>
                    ) : (
                      <ShieldCheck size={14} className="opacity-60" />
                    )}
                  </div>
                  <div className="text-sm font-medium text-foreground/70">
                    {user.timeblock_count} {t('timeblocks')}
                  </div>
                </div>
              </button>
            );
          })
        ) : (
          <div className="flex w-full items-center justify-center rounded-lg p-4 text-sm opacity-50">
            {t('no_users_yet')}
          </div>
        )}
      </div>
    </div>
  );
}
