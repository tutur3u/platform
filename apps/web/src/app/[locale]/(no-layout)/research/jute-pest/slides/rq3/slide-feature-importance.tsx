import type { Slide } from '..';

export const rq3FeatureImportanceSlide: Slide = {
  title: 'Feature Importance Analysis',
  subtitle: 'Quantifying Feature Contributions & Selection',
  content: (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <div className="space-y-4">
          <h3 className="text-2xl font-semibold">Feature Contributions</h3>
          <div className="space-y-3">
            <div className="rounded-lg border p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium">Texture/GLCM</span>
                <span className="bg-primary/10 text-primary rounded-full px-2 py-1 text-sm">
                  42%
                </span>
              </div>
              <p className="text-muted-foreground text-sm">
                Contrast (0.82), Entropy (0.75), Correlation (0.71)
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
                <span className="font-medium">Shape Metrics</span>
                <span className="bg-primary/10 text-primary rounded-full px-2 py-1 text-sm">
                  28%
                </span>
              </div>
              <p className="text-muted-foreground text-sm">
                Solidity (0.68), Eccentricity (0.65)
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
                <span className="font-medium">Color + Edge</span>
                <span className="bg-primary/10 text-primary rounded-full px-2 py-1 text-sm">
                  30%
                </span>
              </div>
              <p className="text-muted-foreground text-sm">
                HSV (0.63), Gradient (0.58)
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
          <h3 className="text-2xl font-semibold">Selection Methods</h3>
          <div className="space-y-3">
            <div className="rounded-lg border p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium">SHAP Analysis</span>
                <span className="bg-primary/10 text-primary rounded-full px-2 py-1 text-sm">
                  p &lt; 0.001
                </span>
              </div>
              <p className="text-muted-foreground text-sm">
                Feature Attribution Scores
              </p>
              <div className="bg-primary/20 mt-2 h-2 w-full rounded-full">
                <div
                  className="bg-primary h-2 rounded-full"
                  style={{ width: '95%' }}
                ></div>
              </div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium">Random Forest</span>
                <span className="bg-primary/10 text-primary rounded-full px-2 py-1 text-sm">
                  p &lt; 0.001
                </span>
              </div>
              <p className="text-muted-foreground text-sm">
                Gini Importance: 0.82
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
                <span className="font-medium">Permutation</span>
                <span className="bg-primary/10 text-primary rounded-full px-2 py-1 text-sm">
                  p &lt; 0.01
                </span>
              </div>
              <p className="text-muted-foreground text-sm">
                Impact Score: 0.78
              </p>
              <div className="bg-primary/20 mt-2 h-2 w-full rounded-full">
                <div
                  className="bg-primary h-2 rounded-full"
                  style={{ width: '88%' }}
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <h3 className="mb-4 text-2xl font-semibold">Key Findings</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="bg-primary/5 rounded-lg border p-4">
            <h4 className="mb-2 font-semibold">Feature Stability</h4>
            <p className="text-muted-foreground text-sm">
              92.5% consistency in rankings across validation sets
            </p>
          </div>
          <div className="bg-primary/5 rounded-lg border p-4">
            <h4 className="mb-2 font-semibold">Dimensionality</h4>
            <p className="text-muted-foreground text-sm">
              68% reduction (47 → 15 features)
            </p>
          </div>
          <div className="bg-primary/5 rounded-lg border p-4">
            <h4 className="mb-2 font-semibold">Processing</h4>
            <p className="text-muted-foreground text-sm">
              3.2× faster with optimized set
            </p>
          </div>
        </div>
      </div>
    </div>
  ),
};
