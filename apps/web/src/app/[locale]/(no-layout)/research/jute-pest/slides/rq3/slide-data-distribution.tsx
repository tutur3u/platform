import type { Slide } from '..';

export const rq3DataDistributionSlide: Slide = {
  title: 'Data Distribution Analysis',
  subtitle: 'Understanding Feature Distributions and Statistical Properties',
  content: (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <div className="space-y-4">
          <h3 className="text-2xl font-semibold">
            Distribution Characteristics
          </h3>
          <ul className="list-disc space-y-2 pl-6">
            <li>Analysis of feature normality using Shapiro-Wilk test</li>
            <li>
              Identification of skewness and kurtosis in feature distributions
            </li>
            <li>Detection of outliers using IQR and z-score methods</li>
            <li>
              Visualization of feature distributions using histograms and KDE
              plots
            </li>
          </ul>
        </div>

        <div className="space-y-4">
          <h3 className="text-2xl font-semibold">Key Findings</h3>
          <ul className="list-disc space-y-2 pl-6">
            <li>Most morphological features follow non-normal distributions</li>
            <li>Color features show significant right-skewness</li>
            <li>Texture features exhibit multimodal distributions</li>
            <li>Presence of outliers in size-related measurements</li>
          </ul>
        </div>
      </div>

      <div className="mt-8 space-y-4">
        <h3 className="text-2xl font-semibold">
          Implications for Feature Engineering
        </h3>
        <ul className="list-disc space-y-2 pl-6">
          <li>Need for feature normalization and standardization</li>
          <li>Consideration of log-transformation for skewed features</li>
          <li>Robust scaling methods for outlier handling</li>
          <li>Distribution-aware feature selection strategies</li>
        </ul>
      </div>
    </div>
  ),
};
