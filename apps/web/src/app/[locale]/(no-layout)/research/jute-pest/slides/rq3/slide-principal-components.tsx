import type { Slide } from '..';

export const rq3PrincipalComponentsSlide: Slide = {
  title: 'Principal Component Analysis',
  subtitle: 'Feature Space Optimization & Dimensionality Reduction',
  content: (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <div className="space-y-4">
          <h3 className="text-2xl font-semibold">Principal Components</h3>
          <div className="space-y-3">
            <div className="rounded-lg border p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium">PC1: Texture</span>
                <span className="bg-primary/10 text-primary rounded-full px-2 py-1 text-sm">
                  42%
                </span>
              </div>
              <p className="text-muted-foreground text-sm">
                GLCM features (loading: 0.85)
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
                <span className="font-medium">PC2: Shape</span>
                <span className="bg-primary/10 text-primary rounded-full px-2 py-1 text-sm">
                  28%
                </span>
              </div>
              <p className="text-muted-foreground text-sm">
                Morphological metrics (loading: 0.78)
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
                <span className="font-medium">PC3: Visual</span>
                <span className="bg-primary/10 text-primary rounded-full px-2 py-1 text-sm">
                  30%
                </span>
              </div>
              <p className="text-muted-foreground text-sm">
                Color + Edge (loading: 0.72)
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
          <h3 className="text-2xl font-semibold">Reduction Analysis</h3>
          <div className="space-y-3">
            <div className="rounded-lg border p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium">Variance Explained</span>
                <span className="bg-primary/10 text-primary rounded-full px-2 py-1 text-sm">
                  92.5%
                </span>
              </div>
              <p className="text-muted-foreground text-sm">
                With top 3 components
              </p>
              <div className="bg-primary/20 mt-2 h-2 w-full rounded-full">
                <div
                  className="bg-primary h-2 rounded-full"
                  style={{ width: '92.5%' }}
                ></div>
              </div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium">Feature Reduction</span>
                <span className="bg-primary/10 text-primary rounded-full px-2 py-1 text-sm">
                  68%
                </span>
              </div>
              <p className="text-muted-foreground text-sm">
                47 → 15 dimensions
              </p>
              <div className="bg-primary/20 mt-2 h-2 w-full rounded-full">
                <div
                  className="bg-primary h-2 rounded-full"
                  style={{ width: '68%' }}
                ></div>
              </div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium">Reconstruction</span>
                <span className="bg-primary/10 text-primary rounded-full px-2 py-1 text-sm">
                  0.95
                </span>
              </div>
              <p className="text-muted-foreground text-sm">
                Quality score (MSE)
              </p>
              <div className="bg-primary/20 mt-2 h-2 w-full rounded-full">
                <div
                  className="bg-primary h-2 rounded-full"
                  style={{ width: '95%' }}
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <h3 className="mb-4 text-2xl font-semibold">Performance Impact</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="bg-primary/5 rounded-lg border p-4">
            <h4 className="mb-2 font-semibold">Accuracy</h4>
            <p className="text-muted-foreground text-sm">
              92.5% with reduced feature set
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
