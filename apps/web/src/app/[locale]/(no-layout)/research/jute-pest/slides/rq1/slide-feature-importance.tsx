import { motion } from 'framer-motion';
import { Brain, CircleDot, GitBranch, Sigma } from 'lucide-react';

const ImportanceMetric = ({
  icon: Icon,
  title,
  value,
  description,
}: {
  icon: any;
  title: string;
  value: string;
  description: string;
}) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.9 }}
    animate={{ opacity: 1, scale: 1 }}
    whileHover={{ scale: 1.02 }}
    className="bg-foreground/5 hover:bg-foreground/10 rounded-xl p-6 transition-colors"
  >
    <div className="mb-4 flex items-center gap-3">
      <div className="bg-primary/10 text-primary rounded-lg p-2">
        <Icon className="h-5 w-5" />
      </div>
      <h4 className="font-medium">{title}</h4>
    </div>
    <div className="mb-2">
      <span className="text-2xl font-bold">{value}</span>
    </div>
    <p className="text-foreground/80 text-sm">{description}</p>
  </motion.div>
);

const FeatureRanking = ({
  rank,
  feature,
  importance,
  description,
}: {
  rank: number;
  feature: string;
  importance: string;
  description: string;
}) => (
  <motion.div
    initial={{ opacity: 0, x: -20 }}
    animate={{ opacity: 1, x: 0 }}
    className="bg-foreground/5 hover:bg-foreground/10 flex items-center gap-4 rounded-xl p-4 transition-colors"
  >
    <div className="bg-primary/10 text-primary flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold">
      {rank}
    </div>
    <div className="flex-1">
      <div className="flex items-baseline justify-between">
        <h4 className="font-medium">{feature}</h4>
        <span className="text-primary text-sm font-semibold">{importance}</span>
      </div>
      <p className="text-foreground/60 text-sm">{description}</p>
    </div>
  </motion.div>
);

export const rq1FeatureImportanceSlide = {
  title: '📊 Feature Importance Analysis',
  subtitle: 'Comprehensive Feature Ranking & Selection',
  content: (
    <div className="space-y-8">
      {/* Key Metrics */}
      <div className="grid gap-6 md:grid-cols-3">
        <ImportanceMetric
          icon={Brain}
          title="Total Features"
          value="324"
          description="Combined morphological features analyzed"
        />
        <ImportanceMetric
          icon={GitBranch}
          title="Selected Features"
          value="48"
          description="Optimal feature subset after selection"
        />
        <ImportanceMetric
          icon={Sigma}
          title="Variance Explained"
          value="95.2%"
          description="Cumulative variance explained by selected features"
        />
      </div>

      {/* Feature Selection Methods */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-foreground/5 rounded-xl p-6"
      >
        <h3 className="mb-6 text-xl font-bold">Selection Methods</h3>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <div className="bg-foreground/10 rounded-lg p-4">
              <h4 className="mb-2 font-medium">Primary Methods</h4>
              <ul className="text-foreground/80 space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <CircleDot className="text-primary h-4 w-4" />
                  Random Forest Importance
                </li>
                <li className="flex items-center gap-2">
                  <CircleDot className="text-primary h-4 w-4" />
                  Recursive Feature Elimination
                </li>
                <li className="flex items-center gap-2">
                  <CircleDot className="text-primary h-4 w-4" />
                  Principal Component Analysis
                </li>
              </ul>
            </div>
          </div>
          <div className="space-y-4">
            <div className="bg-foreground/10 rounded-lg p-4">
              <h4 className="mb-2 font-medium">Validation Methods</h4>
              <ul className="text-foreground/80 space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <CircleDot className="text-primary h-4 w-4" />
                  Cross-validation Scores
                </li>
                <li className="flex items-center gap-2">
                  <CircleDot className="text-primary h-4 w-4" />
                  Feature Stability Analysis
                </li>
                <li className="flex items-center gap-2">
                  <CircleDot className="text-primary h-4 w-4" />
                  Statistical Significance Tests
                </li>
              </ul>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Top Features */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-foreground/5 rounded-xl p-6"
      >
        <h3 className="mb-6 text-xl font-bold">
          Top 5 Most Important Features
        </h3>
        <div className="space-y-4">
          <FeatureRanking
            rank={1}
            feature="GLCM Contrast"
            importance="0.92"
            description="Texture contrast at 0° orientation"
          />
          <FeatureRanking
            rank={2}
            feature="HSV Hue Mean"
            importance="0.89"
            description="Average hue value in HSV color space"
          />
          <FeatureRanking
            rank={3}
            feature="Aspect Ratio"
            importance="0.85"
            description="Length to width ratio of pest body"
          />
          <FeatureRanking
            rank={4}
            feature="LBP Uniformity"
            importance="0.83"
            description="Local binary pattern uniformity measure"
          />
          <FeatureRanking
            rank={5}
            feature="Wavelet Energy"
            importance="0.81"
            description="Energy of level-2 wavelet decomposition"
          />
        </div>
      </motion.div>

      {/* Implementation Details */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-foreground/5 rounded-xl p-6"
      >
        <h3 className="mb-6 text-xl font-bold">Implementation</h3>
        <div className="space-y-4">
          <div className="bg-foreground/10 rounded-lg p-4">
            <h4 className="mb-2 font-medium">Feature Selection Pipeline</h4>
            <pre className="text-foreground/80 overflow-x-auto text-sm">
              {`from sklearn.ensemble import RandomForestClassifier
from sklearn.feature_selection import RFE
from sklearn.decomposition import PCA

# Feature importance ranking
rf = RandomForestClassifier(n_estimators=100)
importance = rf.feature_importances_

# Recursive feature elimination
rfe = RFE(estimator=rf, n_features_to_select=48)
selected_features = rfe.fit_transform(X, y)

# Dimensionality reduction
pca = PCA(n_components=0.95)
reduced_features = pca.fit_transform(selected_features)`}
            </pre>
          </div>
        </div>
      </motion.div>
    </div>
  ),
};
