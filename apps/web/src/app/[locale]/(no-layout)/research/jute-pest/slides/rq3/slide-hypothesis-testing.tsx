import type { Slide } from '..';

export const rq3HypothesisTestingSlide: Slide = {
  title: 'Statistical Validation',
  subtitle: 'Rigorous Testing of Feature Analysis Results',
  content: (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <div className="space-y-4">
          <h3 className="text-2xl font-semibold">Hypothesis Results</h3>
          <div className="space-y-3">
            <div className="rounded-lg border p-3">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="font-medium">H1: Feature Importance</h4>
                <span className="bg-primary/10 text-primary rounded-full px-2 py-1 text-sm">
                  p &lt; 0.001
                </span>
              </div>
              <p className="text-muted-foreground text-sm">
                Texture features contribute 42% (t = 8.92)
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
                <h4 className="font-medium">H2: Feature Reduction</h4>
                <span className="bg-primary/10 text-primary rounded-full px-2 py-1 text-sm">
                  p &lt; 0.001
                </span>
              </div>
              <p className="text-muted-foreground text-sm">
                68% reduction maintains accuracy (F = 45.3)
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
                <h4 className="font-medium">H3: Performance</h4>
                <span className="bg-primary/10 text-primary rounded-full px-2 py-1 text-sm">
                  p &lt; 0.001
                </span>
              </div>
              <p className="text-muted-foreground text-sm">
                92.5% accuracy is significant (χ² = 78.6)
              </p>
              <div className="bg-primary/20 mt-2 h-2 w-full rounded-full">
                <div
                  className="bg-primary h-2 rounded-full"
                  style={{ width: '92.5%' }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-2xl font-semibold">Statistical Tests</h3>
          <div className="space-y-3">
            <div className="rounded-lg border p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium">Shapiro-Wilk</span>
                <span className="bg-primary/10 text-primary rounded-full px-2 py-1 text-sm">
                  W = 0.982
                </span>
              </div>
              <p className="text-muted-foreground text-sm">
                Normal distribution (p &lt; 0.001)
              </p>
              <div className="bg-primary/20 mt-2 h-2 w-full rounded-full">
                <div
                  className="bg-primary h-2 rounded-full"
                  style={{ width: '98.2%' }}
                ></div>
              </div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium">Mann-Whitney U</span>
                <span className="bg-primary/10 text-primary rounded-full px-2 py-1 text-sm">
                  U = 245.3
                </span>
              </div>
              <p className="text-muted-foreground text-sm">
                Feature significance (p &lt; 0.001)
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
                <span className="font-medium">Friedman</span>
                <span className="bg-primary/10 text-primary rounded-full px-2 py-1 text-sm">
                  χ² = 78.6
                </span>
              </div>
              <p className="text-muted-foreground text-sm">
                Feature ranking (p &lt; 0.001)
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
        <h3 className="mb-4 text-2xl font-semibold">Statistical Confidence</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="bg-primary/5 rounded-lg border p-4">
            <h4 className="mb-2 font-semibold">Feature Selection</h4>
            <p className="text-muted-foreground text-sm">
              95% confidence in optimal set (n = 500)
            </p>
          </div>
          <div className="bg-primary/5 rounded-lg border p-4">
            <h4 className="mb-2 font-semibold">Performance</h4>
            <p className="text-muted-foreground text-sm">
              99% confidence in accuracy gains
            </p>
          </div>
          <div className="bg-primary/5 rounded-lg border p-4">
            <h4 className="mb-2 font-semibold">Stability</h4>
            <p className="text-muted-foreground text-sm">
              90% confidence across validation
            </p>
          </div>
        </div>
      </div>
    </div>
  ),
};
