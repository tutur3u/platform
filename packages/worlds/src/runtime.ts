export type Point = { x: number; z: number };

export type WorldObject = Point & {
  id: string;
  kind: 'booth' | 'platform' | 'fixture';
  width: number;
  depth: number;
  elevation: number;
  heading: 0 | 90 | 180 | 270;
  assetId?: string;
};

export type World = {
  schemaVersion: 1;
  id: string;
  bounds: { width: number; depth: number };
  spawns: (Point & { heading: WorldObject['heading'] })[];
  objects: WorldObject[];
  assets: { id: string; kind: 'model' | 'image'; digest: string }[];
};

export function containsPoint(bounds: World['bounds'], point: Point): boolean {
  return (
    point.x >= 0 &&
    point.z >= 0 &&
    point.x <= bounds.width &&
    point.z <= bounds.depth
  );
}

export function objectBounds(object: WorldObject) {
  const sideways = object.heading === 90 || object.heading === 270;
  const halfWidth = (sideways ? object.depth : object.width) / 2;
  const halfDepth = (sideways ? object.width : object.depth) / 2;

  return {
    min: { x: object.x - halfWidth, z: object.z - halfDepth },
    max: { x: object.x + halfWidth, z: object.z + halfDepth },
  };
}

export function objectsAt(world: World, point: Point): WorldObject[] {
  return world.objects.filter((object) => {
    const { min, max } = objectBounds(object);
    return point.x >= min.x && point.x <= max.x && point.z >= min.z && point.z <= max.z;
  });
}
