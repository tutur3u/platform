import type { Slide } from '..';

export const rq3FeatureInteractionsSlide: Slide = {
  title: 'Feature Interactions',
  subtitle: 'Analysis of Feature Synergies & Dependencies',
  content: (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <div className="space-y-4">
          <h3 className="text-2xl font-semibold">Synergy Analysis</h3>
          <div className="space-y-3">
            <div className="rounded-lg border p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium">Texture × Edge</span>
                <span className="bg-primary/10 text-primary rounded-full px-2 py-1 text-sm">
                  +42%
                </span>
              </div>
              <p className="text-muted-foreground text-sm">
                GLCM + Gradient (H-stat: 0.85)
              </p>
              <div className="bg-primary/20 mt-2 h-2 w-full rounded-full">
                <div
                  className="bg-primary h-2 rounded-full"
                  style={{ width: '92%' }}
                ></div>
              </div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium">Color × Texture</span>
                <span className="bg-primary/10 text-primary rounded-full px-2 py-1 text-sm">
                  +28%
                </span>
              </div>
              <p className="text-muted-foreground text-sm">
                HSV + GLCM (H-stat: 0.72)
              </p>
              <div className="bg-primary/20 mt-2 h-2 w-full rounded-full">
                <div
                  className="bg-primary h-2 rounded-full"
                  style={{ width: '78%' }}
                ></div>
              </div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium">Shape × Color</span>
                <span className="bg-primary/10 text-primary rounded-full px-2 py-1 text-sm">
                  +20%
                </span>
              </div>
              <p className="text-muted-foreground text-sm">
                Morphology + HSV (H-stat: 0.68)
              </p>
              <div className="bg-primary/20 mt-2 h-2 w-full rounded-full">
                <div
                  className="bg-primary h-2 rounded-full"
                  style={{ width: '65%' }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-2xl font-semibold">Validation Methods</h3>
          <div className="space-y-3">
            <div className="rounded-lg border p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium">H-Statistic</span>
                <span className="bg-primary/10 text-primary rounded-full px-2 py-1 text-sm">
                  92.5%
                </span>
              </div>
              <p className="text-muted-foreground text-sm">
                Interaction strength (p &lt; 0.001)
              </p>
              <div className="bg-primary/20 mt-2 h-2 w-full rounded-full">
                <div
                  className="bg-primary h-2 rounded-full"
                  style={{ width: '92%' }}
                ></div>
              </div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium">SHAP Interaction</span>
                <span className="bg-primary/10 text-primary rounded-full px-2 py-1 text-sm">
                  0.82
                </span>
              </div>
              <p className="text-muted-foreground text-sm">
                Attribution matrix score
              </p>
              <div className="bg-primary/20 mt-2 h-2 w-full rounded-full">
                <div
                  className="bg-primary h-2 rounded-full"
                  style={{ width: '82%' }}
                ></div>
              </div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium">PDP Analysis</span>
                <span className="bg-primary/10 text-primary rounded-full px-2 py-1 text-sm">
                  0.75
                </span>
              </div>
              <p className="text-muted-foreground text-sm">
                Interaction visualization
              </p>
              <div className="bg-primary/20 mt-2 h-2 w-full rounded-full">
                <div
                  className="bg-primary h-2 rounded-full"
                  style={{ width: '75%' }}
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <h3 className="mb-4 text-2xl font-semibold">Impact Analysis</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="bg-primary/5 rounded-lg border p-4">
            <h4 className="mb-2 font-semibold">Performance</h4>
            <p className="text-muted-foreground text-sm">
              92.5% accuracy with synergistic features
            </p>
          </div>
          <div className="bg-primary/5 rounded-lg border p-4">
            <h4 className="mb-2 font-semibold">Efficiency</h4>
            <p className="text-muted-foreground text-sm">
              68% reduction in feature count
            </p>
          </div>
          <div className="bg-primary/5 rounded-lg border p-4">
            <h4 className="mb-2 font-semibold">Speed</h4>
            <p className="text-muted-foreground text-sm">
              3.2× faster with optimized pairs
            </p>
          </div>
        </div>
      </div>
    </div>
  ),
};
