import { motion } from 'framer-motion';
import {
  BarChart3,
  CircleDot,
  GitBranch,
  Grid,
  LineChart,
  Network,
  Sigma,
  Target,
  TrendingUp,
  Waves,
} from 'lucide-react';

const CorrelationMetric = ({
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

const AnalysisFeature = ({
  icon: Icon,
  title,
  description,
}: {
  icon: any;
  title: string;
  description: string;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="flex items-start gap-4"
  >
    <div className="bg-foreground/5 text-primary mt-1 rounded-lg p-2">
      <Icon className="h-5 w-5" />
    </div>
    <div>
      <h4 className="font-medium">{title}</h4>
      <p className="text-foreground/60 text-sm">{description}</p>
    </div>
  </motion.div>
);

export const rq3CorrelationAnalysisSlide = {
  title: '🔄 Feature Correlation Analysis',
  subtitle: 'Comprehensive Feature Relationship Study',
  content: (
    <div className="space-y-8">
      {/* Key Correlation Metrics */}
      <div className="grid gap-6 md:grid-cols-3">
        <CorrelationMetric
          icon={Network}
          title="Feature Pairs"
          value="52,326"
          description="Total feature pairs analyzed for correlations"
        />
        <CorrelationMetric
          icon={Target}
          title="Strong Correlations"
          value="324"
          description="Feature pairs with |r| > 0.7"
        />
        <CorrelationMetric
          icon={TrendingUp}
          title="Avg. Correlation"
          value="0.42"
          description="Mean absolute correlation coefficient"
        />
      </div>

      {/* Analysis Methods */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-foreground/5 rounded-xl p-6"
      >
        <h3 className="mb-6 text-xl font-bold">Analysis Methods</h3>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-6">
            <AnalysisFeature
              icon={Grid}
              title="Correlation Matrix"
              description="Pearson and Spearman correlation coefficient computation"
            />
            <AnalysisFeature
              icon={GitBranch}
              title="Feature Clustering"
              description="Hierarchical clustering of correlated feature groups"
            />
            <AnalysisFeature
              icon={Waves}
              title="Time Series Analysis"
              description="Temporal correlation patterns and stability"
            />
          </div>
          <div className="space-y-6">
            <AnalysisFeature
              icon={Sigma}
              title="Statistical Tests"
              description="Significance testing and p-value computation"
            />
            <AnalysisFeature
              icon={BarChart3}
              title="Distribution Analysis"
              description="Feature distribution and relationship patterns"
            />
            <AnalysisFeature
              icon={LineChart}
              title="Trend Analysis"
              description="Cross-feature trend and pattern identification"
            />
          </div>
        </div>
      </motion.div>

      {/* Implementation Details */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-foreground/5 rounded-xl p-6"
      >
        <h3 className="mb-6 text-xl font-bold">Implementation Highlights</h3>
        <div className="space-y-4">
          <div className="bg-foreground/10 rounded-lg p-4">
            <h4 className="mb-2 font-medium">Correlation Analysis Pipeline</h4>
            <pre className="text-foreground/80 overflow-x-auto text-sm">
              {`1. Feature pair extraction
2. Correlation computation
3. Statistical testing
4. Clustering analysis
5. Visualization generation`}
            </pre>
          </div>
          <div className="bg-foreground/10 rounded-lg p-4">
            <h4 className="mb-2 font-medium">Key Python Libraries</h4>
            <pre className="text-foreground/80 overflow-x-auto text-sm">
              {`import numpy as np
from scipy.stats import pearsonr, spearmanr
from scipy.cluster.hierarchy import linkage
import seaborn as sns`}
            </pre>
          </div>
        </div>
      </motion.div>

      {/* Key Findings */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-foreground/5 rounded-xl p-6"
      >
        <h3 className="mb-6 text-xl font-bold">Key Findings</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="bg-foreground/10 rounded-lg p-4">
            <h4 className="mb-2 font-medium">Feature Relationships</h4>
            <ul className="text-foreground/80 space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                Shape-Texture: Strong correlation
              </li>
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                Color-Shape: Weak correlation
              </li>
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                Color-Texture: Moderate correlation
              </li>
            </ul>
          </div>
          <div className="bg-foreground/10 rounded-lg p-4">
            <h4 className="mb-2 font-medium">Statistical Significance</h4>
            <ul className="text-foreground/80 space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                85.2% significant correlations
              </li>
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                12 major feature clusters
              </li>
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                94.7% confidence level
              </li>
            </ul>
          </div>
        </div>
      </motion.div>
    </div>
  ),
};
