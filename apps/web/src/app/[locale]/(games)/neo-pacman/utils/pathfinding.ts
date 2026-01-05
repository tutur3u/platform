import type { TilePosition } from '../types';

interface PathNode {
  position: TilePosition;
  g: number; // Cost from start
  h: number; // Heuristic cost to end
  f: number; // Total cost (g + h)
  parent: PathNode | null;
}

/**
 * Manhattan distance heuristic for A* pathfinding
 */
function manhattanDistance(a: TilePosition, b: TilePosition): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

/**
 * Check if two positions are equal
 */
function positionsEqual(a: TilePosition, b: TilePosition): boolean {
  return a.row === b.row && a.col === b.col;
}

/**
 * Find a node in a list by position
 */
function findNodeByPosition(
  list: PathNode[],
  position: TilePosition
): PathNode | undefined {
  return list.find((node) => positionsEqual(node.position, position));
}

/**
 * Get the neighbors of a tile position
 */
export function getNeighbors(
  position: TilePosition,
  mapLayout: number[][],
  wallTile: number
): TilePosition[] {
  const neighbors: TilePosition[] = [];

  // Early return if map is empty
  if (mapLayout.length === 0 || !mapLayout[0]) {
    return neighbors;
  }

  const directions = [
    { row: -1, col: 0 }, // Up
    { row: 1, col: 0 }, // Down
    { row: 0, col: -1 }, // Left
    { row: 0, col: 1 }, // Right
  ];

  for (const dir of directions) {
    const newRow = position.row + dir.row;
    const newCol = position.col + dir.col;

    // Check bounds
    if (
      newRow >= 0 &&
      newRow < mapLayout.length &&
      newCol >= 0 &&
      newCol < mapLayout[0].length
    ) {
      // Check if not a wall
      if (mapLayout[newRow]?.[newCol] !== wallTile) {
        neighbors.push({ row: newRow, col: newCol });
      }
    }
  }

  return neighbors;
}

/**
 * A* pathfinding algorithm
 * Returns the next tile position to move towards the target
 * If no path exists, returns null
 */
export function findPath(
  start: TilePosition,
  target: TilePosition,
  mapLayout: number[][],
  wallTile: number = 1
): TilePosition | null {
  // If already at target, return null
  if (positionsEqual(start, target)) {
    return null;
  }

  const openList: PathNode[] = [];
  const closedList: PathNode[] = [];

  // Create start node
  const startNode: PathNode = {
    position: start,
    g: 0,
    h: manhattanDistance(start, target),
    f: 0,
    parent: null,
  };
  startNode.f = startNode.g + startNode.h;
  openList.push(startNode);

  let iterations = 0;
  const maxIterations = 1000; // Prevent infinite loops

  while (openList.length > 0 && iterations < maxIterations) {
    iterations++;

    // Find node with lowest f cost
    let currentIndex = 0;
    for (let i = 1; i < openList.length; i++) {
      const nodeI = openList[i];
      const nodeCurrent = openList[currentIndex];
      if (nodeI && nodeCurrent && nodeI.f < nodeCurrent.f) {
        currentIndex = i;
      }
    }

    const current = openList[currentIndex];
    if (!current) {
      break;
    }

    // Remove current from open list
    openList.splice(currentIndex, 1);

    // Add current to closed list
    closedList.push(current);

    // Check if we reached the target
    if (positionsEqual(current.position, target)) {
      // Reconstruct path and return the first step
      let path: TilePosition[] = [];
      let temp: PathNode | null = current;

      while (temp !== null) {
        path.unshift(temp.position);
        temp = temp.parent;
      }

      // Return the next position (index 1, since index 0 is the start)
      const nextPosition = path[1];
      return nextPosition ?? null;
    }

    // Get neighbors
    const neighbors = getNeighbors(current.position, mapLayout, wallTile);

    for (const neighborPos of neighbors) {
      // Skip if in closed list
      if (findNodeByPosition(closedList, neighborPos)) {
        continue;
      }

      const g = current.g + 1;
      const h = manhattanDistance(neighborPos, target);
      const f = g + h;

      // Check if neighbor is in open list
      const existingNode = findNodeByPosition(openList, neighborPos);

      if (existingNode) {
        // Update if we found a better path
        if (g < existingNode.g) {
          existingNode.g = g;
          existingNode.f = f;
          existingNode.parent = current;
        }
      } else {
        // Add to open list
        const neighborNode: PathNode = {
          position: neighborPos,
          g,
          h,
          f,
          parent: current,
        };
        openList.push(neighborNode);
      }
    }
  }

  // No path found
  return null;
}
