import type { Slide } from '..';

export const rq3AblationStudySlide: Slide = {
  title: 'Feature Ablation Analysis',
  subtitle: 'Systematic Assessment of Feature Contributions',
  content: (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <div className="space-y-4">
          <h3 className="text-2xl font-semibold">Impact Assessment</h3>
          <div className="space-y-3">
            <div className="rounded-lg border p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium">Texture/GLCM</span>
                <span className="bg-destructive/10 text-destructive rounded-full px-2 py-1 text-sm">
                  -42%
                </span>
              </div>
              <p className="text-muted-foreground text-sm">
                Accuracy drop: 92.5% → 50.5%
              </p>
              <div className="bg-destructive/20 mt-2 h-2 w-full rounded-full">
                <div
                  className="bg-destructive h-2 rounded-full"
                  style={{ width: '92%' }}
                ></div>
              </div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium">Shape Metrics</span>
                <span className="bg-destructive/10 text-destructive rounded-full px-2 py-1 text-sm">
                  -28%
                </span>
              </div>
              <p className="text-muted-foreground text-sm">
                Accuracy drop: 92.5% → 64.5%
              </p>
              <div className="bg-destructive/20 mt-2 h-2 w-full rounded-full">
                <div
                  className="bg-destructive h-2 rounded-full"
                  style={{ width: '78%' }}
                ></div>
              </div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium">Color + Edge</span>
                <span className="bg-destructive/10 text-destructive rounded-full px-2 py-1 text-sm">
                  -30%
                </span>
              </div>
              <p className="text-muted-foreground text-sm">
                Accuracy drop: 92.5% → 62.5%
              </p>
              <div className="bg-destructive/20 mt-2 h-2 w-full rounded-full">
                <div
                  className="bg-destructive h-2 rounded-full"
                  style={{ width: '65%' }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-2xl font-semibold">Feature Dependencies</h3>
          <div className="space-y-3">
            <div className="rounded-lg border p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium">Texture + Shape</span>
                <span className="bg-primary/10 text-primary rounded-full px-2 py-1 text-sm">
                  92.5%
                </span>
              </div>
              <p className="text-muted-foreground text-sm">
                Optimal complementary pair
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
                <span className="font-medium">Minimal Set</span>
                <span className="bg-primary/10 text-primary rounded-full px-2 py-1 text-sm">
                  15
                </span>
              </div>
              <p className="text-muted-foreground text-sm">
                Critical features required
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
                <span className="font-medium">Redundancy</span>
                <span className="bg-primary/10 text-primary rounded-full px-2 py-1 text-sm">
                  68%
                </span>
              </div>
              <p className="text-muted-foreground text-sm">
                Features safely removed
              </p>
              <div className="bg-primary/20 mt-2 h-2 w-full rounded-full">
                <div
                  className="bg-primary h-2 rounded-full"
                  style={{ width: '68%' }}
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <h3 className="mb-4 text-2xl font-semibold">Optimization Results</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="bg-primary/5 rounded-lg border p-4">
            <h4 className="mb-2 font-semibold">Performance</h4>
            <p className="text-muted-foreground text-sm">
              92.5% accuracy with minimal set
            </p>
          </div>
          <div className="bg-primary/5 rounded-lg border p-4">
            <h4 className="mb-2 font-semibold">Efficiency</h4>
            <p className="text-muted-foreground text-sm">
              3.2× faster processing time
            </p>
          </div>
          <div className="bg-primary/5 rounded-lg border p-4">
            <h4 className="mb-2 font-semibold">Memory</h4>
            <p className="text-muted-foreground text-sm">
              68% reduction in model size
            </p>
          </div>
        </div>
      </div>
    </div>
  ),
};
