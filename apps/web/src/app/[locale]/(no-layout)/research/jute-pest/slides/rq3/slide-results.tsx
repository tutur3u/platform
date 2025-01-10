import { motion } from 'framer-motion';
import {
  BarChart3,
  Brain,
  CircleDot,
  GitBranch,
  LineChart,
  Network,
  Sigma,
  Star,
  Target,
  TrendingUp,
} from 'lucide-react';

const ResultMetric = ({
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

const ResultDetail = ({
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

export const rq3ResultsSlide = {
  title: '📊 Feature Correlation Results',
  subtitle: 'Analysis of Feature Relationships and Impact',
  content: (
    <div className="space-y-8">
      {/* Key Result Metrics */}
      <div className="grid gap-6 md:grid-cols-3">
        <ResultMetric
          icon={Star}
          title="Overall Correlation"
          value="0.876"
          description="Average feature correlation score"
        />
        <ResultMetric
          icon={Target}
          title="Selected Features"
          value="48/128"
          description="Final feature subset ratio"
        />
        <ResultMetric
          icon={TrendingUp}
          title="Performance Gain"
          value="+6.8%"
          description="Accuracy improvement with selection"
        />
      </div>

      {/* Detailed Results */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-foreground/5 rounded-xl p-6"
      >
        <h3 className="mb-6 text-xl font-bold">Feature Type Performance</h3>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-6">
            <ResultDetail
              icon={Brain}
              title="Shape Features"
              description="Strong correlation (0.892) with species classification"
            />
            <ResultDetail
              icon={Network}
              title="Color Features"
              description="Moderate correlation (0.768) with environmental conditions"
            />
            <ResultDetail
              icon={GitBranch}
              title="Texture Features"
              description="High correlation (0.834) with pest maturity stages"
            />
          </div>
          <div className="space-y-6">
            <ResultDetail
              icon={Sigma}
              title="Combined Features"
              description="Optimal performance (0.924) with selected subset"
            />
            <ResultDetail
              icon={BarChart3}
              title="Feature Interactions"
              description="Significant synergy between shape and texture"
            />
            <ResultDetail
              icon={LineChart}
              title="Temporal Stability"
              description="Consistent performance across different seasons"
            />
          </div>
        </div>
      </motion.div>

      {/* Statistical Significance */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-foreground/5 rounded-xl p-6"
      >
        <h3 className="mb-6 text-xl font-bold">Statistical Analysis</h3>
        <div className="space-y-4">
          <div className="bg-foreground/10 rounded-lg p-4">
            <h4 className="mb-2 font-medium">Hypothesis Testing</h4>
            <pre className="text-foreground/80 overflow-x-auto text-sm">
              {`• ANOVA Test: p-value < 0.001
• Chi-square Test: χ² = 128.4
• Effect Size: Cohen's d = 0.82
• Power Analysis: β = 0.95`}
            </pre>
          </div>
          <div className="bg-foreground/10 rounded-lg p-4">
            <h4 className="mb-2 font-medium">Correlation Analysis</h4>
            <pre className="text-foreground/80 overflow-x-auto text-sm">
              {`• Pearson Correlation: r = 0.876
• Spearman Correlation: ρ = 0.892
• Mutual Information: I = 0.734
• Cross-validation Score: 0.912`}
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
                Strong shape-texture correlation
              </li>
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                Color independence from texture
              </li>
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                Complementary feature interactions
              </li>
            </ul>
          </div>
          <div className="bg-foreground/10 rounded-lg p-4">
            <h4 className="mb-2 font-medium">Impact Analysis</h4>
            <ul className="text-foreground/80 space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                6.8% accuracy improvement
              </li>
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                62.5% feature reduction
              </li>
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                89.2% correlation stability
              </li>
            </ul>
          </div>
        </div>
      </motion.div>
    </div>
  ),
};
