import { Segment } from '@/types/primitives/Segment';
import React, { createContext, useCallback, useContext, useState } from 'react';

const SegmentContext = createContext({
  segments: [] as Segment[],
  setRootSegment: (segment: Segment | Segment[], conditions?: boolean[]) =>
    console.log(segment, conditions),
  setLastSegment: (segment: Segment) => console.log(segment),
  addSegment: (segment: Segment, conditions?: boolean[]) =>
    console.log(segment, conditions),
});

export const SegmentProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [segments, setSegments] = useState<Segment[]>([]);

  const setRootSegment = useCallback(
    (segment: Segment | Segment[], conditions?: boolean[]) => {
      // If not all conditions are true, don't set the segment
      if (conditions && conditions.some((condition) => !condition)) return;

      // Update the segments
      setSegments(() =>
        Array.isArray(segment)
          ? segment.filter(
              // Filter out duplicate segments
              (segment, index, self) =>
                index ===
                self.findIndex(
                  (s) =>
                    s.href === segment.href && s.content === segment.content
                )
            )
          : [segment]
      );
    },
    []
  );

  const setLastSegment = useCallback((segment: Segment) => {
    // Update the segments
    setSegments((oldSegments) => {
      const newSegments = [...oldSegments];
      newSegments[newSegments.length - 1] = segment;
      return newSegments;
    });
  }, []);

  const addSegment = (segment: Segment, conditions?: boolean[]) => {
    // If not all conditions are true, don't add the segment
    if (conditions && conditions.some((condition) => !condition)) return;

    // Update the segments
    setSegments((prev) => [...prev, segment]);
  };

  const values = {
    segments,
    setRootSegment,
    setLastSegment,
    addSegment,
  };

  return (
    <SegmentContext.Provider value={values}>{children}</SegmentContext.Provider>
  );
};

export const useSegments = () => {
  const context = useContext(SegmentContext);

  if (context === undefined)
    throw new Error(`useSegments() must be used within a SegmentProvider.`);

  return context;
};
