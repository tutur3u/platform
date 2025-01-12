import type { Slide } from '..';

export const rq3MulticollinearitySlide: Slide = {
  title: 'Multicollinearity Analysis',
  subtitle: 'Identifying and Addressing Feature Dependencies',
  content: (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <div className="space-y-4">
          <h3 className="text-2xl font-semibold">Detection Methods</h3>
          <ul className="list-disc space-y-2 pl-6">
            <li>Variance Inflation Factor (VIF) analysis</li>
            <li>Pearson correlation coefficient matrix</li>
            <li>Condition number assessment</li>
            <li>Eigenvalue decomposition</li>
          </ul>
        </div>

        <div className="space-y-4">
          <h3 className="text-2xl font-semibold">Key Findings</h3>
          <ul className="list-disc space-y-2 pl-6">
            <li>High correlation between texture features</li>
            <li>Moderate dependencies in color channels</li>
            <li>Low collinearity in shape descriptors</li>
            <li>Critical VIF thresholds exceeded</li>
          </ul>
        </div>
      </div>

      <div className="mt-8 space-y-4">
        <h3 className="text-2xl font-semibold">Impact on Model Performance</h3>
        <ul className="list-disc space-y-2 pl-6">
          <li>Reduced model stability and reliability</li>
          <li>Inflated variance in parameter estimates</li>
          <li>Difficulties in feature importance interpretation</li>
          <li>Computational inefficiencies</li>
        </ul>
      </div>

      <div className="mt-8 space-y-4">
        <h3 className="text-2xl font-semibold">Mitigation Strategies</h3>
        <ul className="list-disc space-y-2 pl-6">
          <li>Feature selection based on VIF thresholds</li>
          <li>Principal Component Analysis (PCA) transformation</li>
          <li>Regularization techniques (L1, L2)</li>
          <li>Feature clustering and representative selection</li>
        </ul>
      </div>
    </div>
  ),
};
