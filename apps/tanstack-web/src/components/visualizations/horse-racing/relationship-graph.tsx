import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Label } from '@tuturuuu/ui/label';
import { Switch } from '@tuturuuu/ui/switch';
import { useCallback, useEffect, useRef, useState } from 'react';

interface Horse {
  id: number;
  speed: number;
  color: string;
}

interface RelationshipGraphProps {
  horses: Horse[];
  fasterThanRelationships: Map<number, Set<number>>;
  slowerThanRelationships: Map<number, Set<number>>;
  finalRanking: number[];
  currentRaceIndex: number;
}

// Helper function to draw arrowhead (pure function, moved to module scope)
const drawArrowhead = (
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  radius: number
) => {
  const angle = Math.atan2(toY - fromY, toX - fromX);

  // Calculate the position for the arrowhead (slightly before the end point)
  const arrowX = toX - 15 * Math.cos(angle);
  const arrowY = toY - 15 * Math.sin(angle);

  ctx.beginPath();
  ctx.moveTo(arrowX, arrowY);
  ctx.lineTo(
    arrowX - radius * Math.cos(angle - Math.PI / 6),
    arrowY - radius * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    arrowX - radius * Math.cos(angle + Math.PI / 6),
    arrowY - radius * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fillStyle = 'rgba(59, 130, 246, 0.8)';
  ctx.fill();
};

// Helper function to draw the legend (pure function, moved to module scope)
const drawLegend = (
  ctx: CanvasRenderingContext2D,
  _: number,
  height: number
) => {
  const legendX = 20;
  const legendY = height - 60;
  const lineLength = 25;

  // Draw solid line legend
  ctx.beginPath();
  ctx.moveTo(legendX, legendY);
  ctx.lineTo(legendX + lineLength, legendY);
  ctx.strokeStyle = 'rgba(59, 130, 246, 0.8)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.font = '10px sans-serif';
  ctx.fillStyle = 'currentColor'; // Use the current text color
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('Known relationship', legendX + lineLength + 5, legendY);

  // Draw dashed line legend
  ctx.beginPath();
  ctx.moveTo(legendX, legendY + 15);
  ctx.lineTo(legendX + lineLength, legendY + 15);
  ctx.strokeStyle = 'rgba(99, 102, 241, 0.8)';
  ctx.lineWidth = 2;
  ctx.setLineDash([3, 3]);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillText('Inferred relationship', legendX + lineLength + 5, legendY + 15);

  // Draw node legend
  ctx.beginPath();
  ctx.arc(legendX + 8, legendY + 32, 8, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(59, 130, 246, 0.8)';
  ctx.fill();
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = 'currentColor';
  ctx.fillText('Horse', legendX + lineLength + 5, legendY + 32);
};

// Helper function to determine text color based on background (pure function, moved to module scope)
const getContrastingTextColor = (bgColor: string): string => {
  // Simple implementation - more sophisticated contrast calculation could be used
  if (!bgColor.startsWith('#')) return 'white';

  const r = parseInt(bgColor.slice(1, 3), 16);
  const g = parseInt(bgColor.slice(3, 5), 16);
  const b = parseInt(bgColor.slice(5, 7), 16);

  // Using relative luminance formula for contrast
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  return luminance > 0.5 ? 'black' : 'white';
};

export function RelationshipGraph({
  horses,
  fasterThanRelationships,
  slowerThanRelationships,
  finalRanking,
  currentRaceIndex,
}: RelationshipGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showAllRelationships, setShowAllRelationships] = useState(true);
  const [hoveredHorse, setHoveredHorse] = useState<number | null>(null);
  const [_graphSize, setGraphSize] = useState({ width: 0, height: 0 });

  // Current known positions based on finished races
  const knownPositions = finalRanking.slice(
    0,
    Math.min(currentRaceIndex + 1, finalRanking.length)
  );

  // drawGraph function - defined as useCallback to be used in useEffect
  const drawGraph = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;

    // Clear the canvas
    ctx.clearRect(0, 0, width, height);

    // Define the radius of the circle
    const radius = Math.min(width, height) * 0.4;
    const centerX = width / 2;
    const centerY = height / 2;

    // Calculate positions for each horse in a circle
    const horsePositions = new Map<number, { x: number; y: number }>();

    horses.forEach((horse, index) => {
      // Calculate positions in a circle
      const angle = (2 * Math.PI * index) / horses.length - Math.PI / 2;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);

      horsePositions.set(horse.id, { x, y });
    });

    // Draw relationships between horses
    for (const [horseId, fasterHorses] of fasterThanRelationships.entries()) {
      // Skip if not hovering and we're showing only hovered relationships
      if (
        !showAllRelationships &&
        hoveredHorse !== null &&
        hoveredHorse !== horseId
      )
        continue;

      const fromPos = horsePositions.get(horseId);
      if (!fromPos) continue;

      for (const fasterHorseId of fasterHorses) {
        // Skip if not hovering and we're showing only hovered relationships
        if (
          !showAllRelationships &&
          hoveredHorse !== null &&
          hoveredHorse !== fasterHorseId
        )
          continue;

        const toPos = horsePositions.get(fasterHorseId);
        if (!toPos) continue;

        // Draw a line from this horse to the faster one
        ctx.beginPath();
        ctx.moveTo(fromPos.x, fromPos.y);
        ctx.lineTo(toPos.x, toPos.y);

        // Set line style based on whether horses are in known ranking
        const isKnownRelationship =
          knownPositions.includes(horseId) &&
          knownPositions.includes(fasterHorseId);

        const isHovered =
          hoveredHorse === horseId || hoveredHorse === fasterHorseId;

        if (isKnownRelationship) {
          // Known relationship - solid line
          ctx.strokeStyle = isHovered
            ? 'rgba(59, 130, 246, 0.8)'
            : 'rgba(59, 130, 246, 0.3)';
          ctx.lineWidth = isHovered ? 2 : 1;
        } else {
          // Inferred relationship - dashed line
          ctx.strokeStyle = isHovered
            ? 'rgba(99, 102, 241, 0.8)'
            : 'rgba(99, 102, 241, 0.3)';
          ctx.lineWidth = isHovered ? 2 : 1;
          ctx.setLineDash([3, 3]);
        }

        ctx.stroke();
        ctx.setLineDash([]);

        // Draw arrowhead
        if (isHovered) {
          drawArrowhead(ctx, fromPos.x, fromPos.y, toPos.x, toPos.y, 6);
        }
      }
    }

    // Draw horses as nodes
    horses.forEach((horse) => {
      const pos = horsePositions.get(horse.id);
      if (!pos) return;

      // Determine node appearance based on status
      const isKnown = knownPositions.includes(horse.id);
      const isHovered = hoveredHorse === horse.id;

      // Draw circle
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, isHovered ? 15 : 12, 0, Math.PI * 2);
      ctx.fillStyle = horse.color;
      ctx.fill();

      // Add border
      ctx.lineWidth = isHovered ? 2.5 : 1.5;
      ctx.strokeStyle = isKnown
        ? 'rgba(255, 255, 255, 0.8)'
        : 'rgba(255, 255, 255, 0.4)';
      ctx.stroke();

      // Display horse ID in the circle
      ctx.fillStyle = getContrastingTextColor(horse.color);
      ctx.font = isHovered ? 'bold 12px sans-serif' : 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(horse.id.toString(), pos.x, pos.y);

      // For known positions, show rank
      if (isKnown) {
        const rank = knownPositions.indexOf(horse.id) + 1;
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(pos.x + 10, pos.y - 10, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'black';
        ctx.font = 'bold 8px sans-serif';
        ctx.fillText(rank.toString(), pos.x + 10, pos.y - 10);
      }
    });

    // Add legend
    drawLegend(ctx, width, height);

    // Add hover detection
    canvas.onmousemove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Check if mouse is over any horse
      let hoveredId = null;
      for (const [horseId, pos] of horsePositions.entries()) {
        const distance = Math.sqrt((x - pos.x) ** 2 + (y - pos.y) ** 2);
        if (distance <= 15) {
          hoveredId = horseId;
          break;
        }
      }

      setHoveredHorse(hoveredId);
    };

    canvas.onmouseleave = () => {
      setHoveredHorse(null);
    };
  }, [
    horses,
    fasterThanRelationships,
    showAllRelationships,
    hoveredHorse,
    knownPositions,
  ]);

  // Calculate the positions of horses in a circular layout
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Get canvas context
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Get canvas dimensions
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === canvas) {
          const { width, height } = entry.contentRect;
          setGraphSize({ width, height });
          canvas.width = width;
          canvas.height = height;
          drawGraph();
        }
      }
    });

    resizeObserver.observe(canvas);

    return () => {
      resizeObserver.disconnect();
    };
  }, [drawGraph]);

  // Redraw the graph when data changes
  useEffect(() => {
    drawGraph();
  }, [drawGraph]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Relationship Network</CardTitle>
          <div className="flex items-center space-x-2">
            <Switch
              id="show-all-relationships"
              checked={showAllRelationships}
              onCheckedChange={setShowAllRelationships}
            />
            <Label
              htmlFor="show-all-relationships"
              className="cursor-pointer text-xs"
            >
              Show all relationships
            </Label>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-2 text-muted-foreground text-xs">
          {hoveredHorse !== null ? (
            <>
              Showing relationships for Horse #{hoveredHorse}:{' '}
              <span className="font-medium">
                Faster than{' '}
                {fasterThanRelationships.get(hoveredHorse)?.size || 0} horses,
                Slower than{' '}
                {slowerThanRelationships.get(hoveredHorse)?.size || 0} horses
              </span>
            </>
          ) : showAllRelationships ? (
            'Showing all known relationships between horses'
          ) : (
            'Hover over a horse to see its relationships'
          )}
        </div>
        <div className="relative w-full">
          <canvas
            ref={canvasRef}
            className="aspect-square w-full rounded-md bg-muted/30"
            style={{ maxHeight: '400px' }}
          />
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <div className="rounded-md border p-2 text-center">
            <div className="font-medium">Known Horses</div>
            <div className="mt-1 font-bold text-2xl text-primary">
              {knownPositions.length}
            </div>
          </div>
          <div className="rounded-md border p-2 text-center">
            <div className="font-medium">Unknown Horses</div>
            <div className="mt-1 font-bold text-2xl text-muted-foreground">
              {horses.length - knownPositions.length}
            </div>
          </div>
          <div className="rounded-md border p-2 text-center">
            <div className="font-medium">Known Relations</div>
            <div className="mt-1 font-bold text-2xl text-blue-500">
              {countKnownRelationships()}
            </div>
          </div>
          <div className="rounded-md border p-2 text-center">
            <div className="font-medium">Inferred Relations</div>
            <div className="mt-1 font-bold text-2xl text-indigo-500">
              {countInferredRelationships()}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  // Helper function to count known direct relationships
  function countKnownRelationships() {
    let count = 0;
    knownPositions.forEach((_, index) => {
      for (let i = index + 1; i < knownPositions.length; i++) {
        count++;
      }
    });
    return count;
  }

  // Helper function to count inferred relationships
  function countInferredRelationships() {
    let totalRelations = 0;

    for (const [_, fasterHorses] of fasterThanRelationships.entries()) {
      totalRelations += fasterHorses.size;
    }

    return totalRelations - countKnownRelationships();
  }
}
