import { EcosystemGeometry } from './ecosystem-geometry';
import { OpenGeometry } from './open-geometry';
import { StoryGeometry } from './story-geometry';
import { StrategyGeometry } from './strategy-geometry';

export function SceneGeometry({ id }: { id: string }) {
  return (
    StoryGeometry({ id }) ??
    StrategyGeometry({ id }) ??
    EcosystemGeometry({ id }) ??
    OpenGeometry({ id })
  );
}
