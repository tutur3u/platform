import type { Slide } from '..';

export const rq3FeatureStabilitySlide: Slide = {
  title: 'Feature Stability Analysis',
  subtitle: 'Assessing Feature Reliability Across Different Conditions',
  content: (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <div className="space-y-4">
          <h3 className="text-2xl font-semibold">Stability Metrics</h3>
          <ul className="list-disc space-y-2 pl-6">
            <li>Coefficient of variation analysis</li>
            <li>Intraclass correlation coefficient</li>
            <li>Feature ranking consistency</li>
            <li>Bootstrap stability scores</li>
            <li>Cross-validation stability index</li>
          </ul>
        </div>

        <div className="space-y-4">
          <h3 className="text-2xl font-semibold">Environmental Factors</h3>
          <ul className="list-disc space-y-2 pl-6">
            <li>Lighting conditions variation</li>
            <li>Camera angle changes</li>
            <li>Image resolution differences</li>
            <li>Background complexity</li>
            <li>Seasonal variations</li>
          </ul>
        </div>
      </div>

      <div className="mt-8 space-y-4">
        <h3 className="text-2xl font-semibold">Most Stable Features</h3>
        <ul className="list-disc space-y-2 pl-6">
          <li>Shape ratios and invariant moments</li>
          <li>Normalized color features</li>
          <li>Scale-invariant texture descriptors</li>
          <li>Relative edge distributions</li>
          <li>Histogram-based features</li>
        </ul>
      </div>

      <div className="mt-8 space-y-4">
        <h3 className="text-2xl font-semibold">Stability Enhancement</h3>
        <ul className="list-disc space-y-2 pl-6">
          <li>Feature normalization techniques</li>
          <li>Robust feature extraction methods</li>
          <li>Ensemble feature selection</li>
          <li>Adaptive feature weighting</li>
          <li>Multi-condition validation</li>
        </ul>
      </div>
    </div>
  ),
};
