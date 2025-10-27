import { createClient } from '@tuturuuu/supabase/next/client';
import type { User } from '@tuturuuu/types/primitives/User';
import { useCursorTracking } from '@tuturuuu/ui/hooks/useCursorTracking';
import { useEffect, useState } from 'react';
import CursorOverlay from './cursor-overlay';

export default function CursorOverlayWrapper({
  channelName,
  containerRef,
}: {
  channelName: string;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [overlaySize, setOverlaySize] = useState<{
    width: number;
    height: number;
  }>({ width: 0, height: 0 });
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Fetch current user
  useEffect(() => {
    const fetchUser = async () => {
      const supabase = createClient();

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user?.id) return;

        const { data: userData, error: userDataError } = await supabase
          .from('users')
          .select('id, display_name')
          .eq('id', user.id)
          .single();

        if (userDataError) {
          console.warn('Error fetching user data:', userDataError);
          return;
        }

        setCurrentUser(userData);
      } catch (err) {
        console.warn('Error fetching user:', err);
      }
    };

    fetchUser();
  }, []);

  const { cursors, error } = useCursorTracking(
    channelName,
    containerRef,
    currentUser ?? undefined
  );

  useEffect(() => {
    if (!containerRef.current) return;

    try {
      const updateOverlaySize = () => {
        try {
          const rect = containerRef.current?.getBoundingClientRect();
          if (rect) {
            setOverlaySize({ width: rect.width, height: rect.height });
          }
        } catch (err) {
          // Silently fail on resize errors
          console.warn('Cursor overlay resize error:', err);
        }
      };

      // Initial update
      updateOverlaySize();

      // Update on resize
      const resizeObserver = new ResizeObserver(updateOverlaySize);
      resizeObserver.observe(containerRef.current);

      return () => {
        resizeObserver.disconnect();
      };
    } catch (err) {
      // Catch any setup errors
      console.warn('Cursor overlay setup error:', err);
      return;
    }
  }, [containerRef]);

  // Don't render if errors detected
  if (error) {
    return null;
  }

  return (
    <CursorOverlay
      cursors={cursors}
      width={overlaySize.width}
      height={overlaySize.height}
    />
  );
}
