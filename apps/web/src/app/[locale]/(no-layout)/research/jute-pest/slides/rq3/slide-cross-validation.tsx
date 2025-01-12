import type { Slide } from '..';

export const rq3CrossValidationSlide: Slide = {
  title: 'Model Validation',
  subtitle: 'Cross-Validation Results & Performance Analysis',
  content: (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <div className="space-y-4">
          <h3 className="text-2xl font-semibold">Performance Metrics</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span className="font-medium">Accuracy</span>
              <span className="text-muted-foreground text-sm">
                92.5% ± 1.8%
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span className="font-medium">Precision</span>
              <span className="text-muted-foreground text-sm">
                91.3% ± 2.1%
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span className="font-medium">Recall</span>
              <span className="text-muted-foreground text-sm">
                93.7% ± 1.5%
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span className="font-medium">F1-Score</span>
              <span className="text-muted-foreground text-sm">
                92.5% ± 1.7%
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-2xl font-semibold">Validation Strategy</h3>
          <div className="space-y-3">
            <div className="rounded-lg border p-3">
              <h4 className="mb-1 font-medium">5-Fold Stratified CV</h4>
              <p className="text-muted-foreground text-sm">
                Primary validation method
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <h4 className="mb-1 font-medium">Monte Carlo CV</h4>
              <p className="text-muted-foreground text-sm">
                100 random splits (80/20)
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <h4 className="mb-1 font-medium">Temporal Validation</h4>
              <p className="text-muted-foreground text-sm">
                3-month forward testing
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <h4 className="mb-1 font-medium">Geographic Split</h4>
              <p className="text-muted-foreground text-sm">
                Cross-region validation
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <h3 className="mb-4 text-2xl font-semibold">Key Findings</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-lg border p-4">
            <h4 className="mb-2 font-semibold">Model Stability</h4>
            <p className="text-muted-foreground text-sm">
              ±1.8% performance variation across all folds
            </p>
          </div>
          <div className="rounded-lg border p-4">
            <h4 className="mb-2 font-semibold">Feature Consistency</h4>
            <p className="text-muted-foreground text-sm">
              95% feature selection stability
            </p>
          </div>
          <div className="rounded-lg border p-4">
            <h4 className="mb-2 font-semibold">Generalization</h4>
            <p className="text-muted-foreground text-sm">
              90%+ accuracy on unseen regions
            </p>
          </div>
        </div>
      </div>
    </div>
  ),
};
