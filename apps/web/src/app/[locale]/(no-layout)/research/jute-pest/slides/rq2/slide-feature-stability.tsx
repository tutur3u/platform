import { motion } from 'framer-motion';
import {
  Activity,
  BarChart3,
  CircleDot,
  GitBranch,
  LineChart,
  Network,
  Scale,
  Shield,
  Sigma,
  TrendingUp,
} from 'lucide-react';

const StabilityMetric = ({
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

const StabilityFeature = ({
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

export const rq2FeatureStabilitySlide = {
  title: '🛡️ Feature Stability Analysis',
  subtitle: 'Cross-Condition Feature Reliability Assessment',
  content: (
    <div className="space-y-8">
      {/* Key Stability Metrics */}
      <div className="grid gap-6 md:grid-cols-3">
        <StabilityMetric
          icon={Shield}
          title="Overall Stability"
          value="87.6%"
          description="Average feature stability across all conditions"
        />
        <StabilityMetric
          icon={Activity}
          title="Variance Range"
          value="±8.3%"
          description="Feature variation across different conditions"
        />
        <StabilityMetric
          icon={Scale}
          title="Reliability Score"
          value="0.924"
          description="Intraclass correlation coefficient (ICC)"
        />
      </div>

      {/* Stability Analysis Methods */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-foreground/5 rounded-xl p-6"
      >
        <h3 className="mb-6 text-xl font-bold">Analysis Methods</h3>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-6">
            <StabilityFeature
              icon={Network}
              title="Cross-Validation"
              description="K-fold cross-validation across different environmental conditions"
            />
            <StabilityFeature
              icon={GitBranch}
              title="Feature Tracking"
              description="Individual feature stability monitoring and analysis"
            />
            <StabilityFeature
              icon={LineChart}
              title="Temporal Analysis"
              description="Feature stability assessment over time and conditions"
            />
          </div>
          <div className="space-y-6">
            <StabilityFeature
              icon={Sigma}
              title="Statistical Tests"
              description="Comprehensive statistical significance testing"
            />
            <StabilityFeature
              icon={BarChart3}
              title="Variance Analysis"
              description="Feature variance decomposition and analysis"
            />
            <StabilityFeature
              icon={TrendingUp}
              title="Trend Analysis"
              description="Long-term feature stability trend assessment"
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
            <h4 className="mb-2 font-medium">Stability Analysis Pipeline</h4>
            <pre className="text-foreground/80 overflow-x-auto text-sm">
              {`1. Feature extraction across conditions
2. Stability metric computation
3. Cross-validation analysis
4. Statistical significance testing
5. Reliability assessment`}
            </pre>
          </div>
          <div className="bg-foreground/10 rounded-lg p-4">
            <h4 className="mb-2 font-medium">Key Python Libraries</h4>
            <pre className="text-foreground/80 overflow-x-auto text-sm">
              {`import numpy as np
from sklearn.model_selection import KFold
from scipy.stats import pearsonr, spearmanr
from pingouin import intraclass_corr`}
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
            <h4 className="mb-2 font-medium">Feature Stability Rankings</h4>
            <ul className="text-foreground/80 space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                Hu Moments: 94.2% stability
              </li>
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                GLCM Features: 88.7% stability
              </li>
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                Color Moments: 82.4% stability
              </li>
            </ul>
          </div>
          <div className="bg-foreground/10 rounded-lg p-4">
            <h4 className="mb-2 font-medium">Reliability Analysis</h4>
            <ul className="text-foreground/80 space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                Test-retest reliability: 0.912
              </li>
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                Inter-rater agreement: 0.894
              </li>
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                Internal consistency: 0.932
              </li>
            </ul>
          </div>
        </div>
      </motion.div>
    </div>
  ),
};
