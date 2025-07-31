'use client';

import { useTimeBlocking } from '@tuturuuu/ui/hooks/time-blocking-provider';
import { ShieldCheck } from '@tuturuuu/ui/icons';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

export default function PlanUserFilterAccordion({ users }: { users: any[] }) {
  const t = useTranslations('meet-together-plan-details');
  const { filteredUserIds, setFilteredUserIds } = useTimeBlocking();
  const [hoveredUserId, setHoveredUserId] = useState<string | null>(null);
  const [isHoverFiltering, setIsHoverFiltering] = useState(false);

  // Use refs for values that don't need to trigger re-renders
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const originalFilteredUserIdsRef = useRef<string[] | null>(null);
  const hasStoredOriginalStateRef = useRef(false);
  const filteredUserIdsRef = useRef<string[]>([]);

  // Sync ref with current value using useEffect to avoid render-time assignment
  useEffect(() => {
    filteredUserIdsRef.current = filteredUserIds;
  }, [filteredUserIds]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleMouseEnter = useCallback(
    (userId: string) => {
      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Set hovered user immediately for visual feedback
      setHoveredUserId(userId);

      // Debounce the actual filtering to prevent rapid state changes
      timeoutRef.current = setTimeout(() => {
        // Only store the original state if we haven't stored it yet
        if (!hasStoredOriginalStateRef.current) {
          const currentFilteredIds = filteredUserIdsRef.current;
          originalFilteredUserIdsRef.current =
            currentFilteredIds.length === 0 ? null : currentFilteredIds.slice();
          hasStoredOriginalStateRef.current = true;
        }

        setFilteredUserIds([userId]);
        setIsHoverFiltering(true);
      }, 150);
    },
    [setFilteredUserIds]
  );

  const handleMouseLeave = useCallback(() => {
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Clear hovered user immediately
    setHoveredUserId(null);

    // Debounce the restoration to prevent flickering
    timeoutRef.current = setTimeout(() => {
      // Restore the original filter state
      setFilteredUserIds(originalFilteredUserIdsRef.current || []);
      setIsHoverFiltering(false);

      // Reset the flag so we can store original state again on next hover
      hasStoredOriginalStateRef.current = false;
    }, 100);
  }, [setFilteredUserIds]);

  return (
    <div className="flex w-full flex-col space-y-4 p-4">
      <div className="space-y-2">
        {users.length > 0 ? (
          users
            .filter((user) => user.id)
            .map((user) => (
              <button
                key={user.id}
                className={`w-full rounded-lg border p-3 text-left transition-all duration-200 ease-in-out ${
                  filteredUserIds.includes(user.id)
                    ? 'border-foreground/30 bg-foreground/20'
                    : 'bg-foreground/5 hover:bg-foreground/10'
                } ${
                  hoveredUserId === user.id && isHoverFiltering
                    ? 'scale-[1.02] ring-2 ring-primary/50'
                    : ''
                }`}
                onClick={() =>
                  setFilteredUserIds((prev) =>
                    prev.includes(user.id)
                      ? prev.filter((id) => id !== user.id)
                      : [...prev, user.id]
                  )
                }
                onMouseEnter={() => handleMouseEnter(user.id)}
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
            ))
        ) : (
          <div className="flex w-full items-center justify-center rounded-lg p-4 text-sm opacity-50">
            {t('no_users_yet')}
          </div>
        )}
      </div>
    </div>
  );
}
