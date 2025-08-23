import { type RefObject, useCallback } from 'react';
import type { EmploymentNode } from '../../types';

interface UseNodeInteractionsProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  nodes: EmploymentNode[];
  onEmployeeSelect: (employmentId: string) => void;
  screenToWorld: (
    screenX: number,
    screenY: number
  ) => { worldX: number; worldY: number };
}

interface UseNodeInteractionsReturn {
  handleCanvasClick: (event: React.MouseEvent<HTMLCanvasElement>) => void;
  findNodeAtPosition: (worldX: number, worldY: number) => EmploymentNode | null;
}

/**
 * Custom hook for handling node interactions
 * Manages click detection and employee selection
 */
export function useNodeInteractions({
  canvasRef,
  nodes,
  onEmployeeSelect,
  screenToWorld,
}: UseNodeInteractionsProps): UseNodeInteractionsReturn {
  const findNodeAtPosition = useCallback(
    (worldX: number, worldY: number): EmploymentNode | null => {
      // Search in reverse order to prioritize nodes drawn on top
      for (let i = nodes.length - 1; i >= 0; i--) {
        const node = nodes[i];
        if (
          worldX >= node.x &&
          worldX <= node.x + node.width &&
          worldY >= node.y &&
          worldY <= node.y + node.height
        ) {
          return node;
        }
      }
      return null;
    },
    [nodes]
  );

  const handleCanvasClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const screenX = event.clientX - rect.left;
      const screenY = event.clientY - rect.top;

      const { worldX, worldY } = screenToWorld(screenX, screenY);
      const clickedNode = findNodeAtPosition(worldX, worldY);

      if (clickedNode) {
        onEmployeeSelect(clickedNode.id);
      }
    },
    [canvasRef, screenToWorld, findNodeAtPosition, onEmployeeSelect]
  );

  return {
    handleCanvasClick,
    findNodeAtPosition,
  };
}
