import { DecisionDiagram } from './decision-diagrams';
import type { VisualCopy } from './diagram-primitives';
import { JourneyDiagram } from './journey-diagrams';
import { OpenGeometry } from './open-geometry';
import { ProductDiagram } from './product-diagrams';
import { StoryGeometry } from './story-geometry';
import { StrategyGeometry } from './strategy-geometry';

export function SceneGeometry({ id, copy }: { id: string; copy: VisualCopy }) {
  return (
    ProductDiagram({ id, copy }) ??
    DecisionDiagram({ id, copy }) ??
    JourneyDiagram({ id, copy }) ??
    StoryGeometry({ id }) ??
    StrategyGeometry({ id }) ??
    OpenGeometry({ id })
  );
}
