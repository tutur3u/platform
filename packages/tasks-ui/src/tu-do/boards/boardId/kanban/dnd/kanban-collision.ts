import {
  type CollisionDetection,
  closestCenter,
  pointerWithin,
} from '@dnd-kit/core';

// Keep the pointer's actual surface as the stable drag target. Using the
// active card's center first can switch lists when the preview slot changes
// layout, making the card visibly bounce between its source and destination.
export const kanbanCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) return pointerCollisions;
  return closestCenter(args);
};
