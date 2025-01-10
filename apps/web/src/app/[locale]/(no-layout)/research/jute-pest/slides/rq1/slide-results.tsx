import { motion } from 'framer-motion';
import {
  BarChart3,
  CheckCircle2,
  CircleDot,
  LineChart,
  PieChart,
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

const KeyFinding = ({
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

export const rq1ResultsSlide = {
  title: '📈 RQ1 Results & Findings',
  subtitle: 'Comprehensive Analysis of Morphological Features',
  content: (
    <div className="space-y-8">
      {/* Key Performance Metrics */}
      <div className="grid gap-6 md:grid-cols-3">
        <ResultMetric
          icon={Target}
          title="Overall Accuracy"
          value="91.4%"
          description="Combined morphological feature classification accuracy"
        />
        <ResultMetric
          icon={TrendingUp}
          title="Feature Efficiency"
          value="48/324"
          description="Optimal features selected from total feature set"
        />
        <ResultMetric
          icon={Star}
          title="Best Performer"
          value="GLCM"
          description="Most discriminative feature category"
        />
      </div>

      {/* Detailed Results */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-foreground/5 rounded-xl p-6"
      >
        <h3 className="mb-6 text-xl font-bold">Performance by Feature Type</h3>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <div className="bg-foreground/10 rounded-lg p-4">
              <h4 className="mb-2 font-medium">Shape Features</h4>
              <ul className="text-foreground/80 space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <CircleDot className="text-primary h-4 w-4" />
                  Accuracy: 78.5%
                </li>
                <li className="flex items-center gap-2">
                  <CircleDot className="text-primary h-4 w-4" />
                  F1-Score: 0.774
                </li>
                <li className="flex items-center gap-2">
                  <CircleDot className="text-primary h-4 w-4" />
                  Precision: 0.792
                </li>
              </ul>
            </div>
            <div className="bg-foreground/10 rounded-lg p-4">
              <h4 className="mb-2 font-medium">Color Features</h4>
              <ul className="text-foreground/80 space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <CircleDot className="text-primary h-4 w-4" />
                  Accuracy: 82.3%
                </li>
                <li className="flex items-center gap-2">
                  <CircleDot className="text-primary h-4 w-4" />
                  F1-Score: 0.815
                </li>
                <li className="flex items-center gap-2">
                  <CircleDot className="text-primary h-4 w-4" />
                  Precision: 0.831
                </li>
              </ul>
            </div>
          </div>
          <div className="space-y-4">
            <div className="bg-foreground/10 rounded-lg p-4">
              <h4 className="mb-2 font-medium">Texture Features</h4>
              <ul className="text-foreground/80 space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <CircleDot className="text-primary h-4 w-4" />
                  Accuracy: 87.4%
                </li>
                <li className="flex items-center gap-2">
                  <CircleDot className="text-primary h-4 w-4" />
                  F1-Score: 0.868
                </li>
                <li className="flex items-center gap-2">
                  <CircleDot className="text-primary h-4 w-4" />
                  Precision: 0.882
                </li>
              </ul>
            </div>
            <div className="bg-foreground/10 rounded-lg p-4">
              <h4 className="mb-2 font-medium">Combined Features</h4>
              <ul className="text-foreground/80 space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <CircleDot className="text-primary h-4 w-4" />
                  Accuracy: 91.4%
                </li>
                <li className="flex items-center gap-2">
                  <CircleDot className="text-primary h-4 w-4" />
                  F1-Score: 0.908
                </li>
                <li className="flex items-center gap-2">
                  <CircleDot className="text-primary h-4 w-4" />
                  Precision: 0.923
                </li>
              </ul>
            </div>
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
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-6">
            <KeyFinding
              icon={CheckCircle2}
              title="Feature Complementarity"
              description="Combined features showed significant improvement over individual feature types"
            />
            <KeyFinding
              icon={BarChart3}
              title="Texture Dominance"
              description="GLCM features demonstrated highest individual discriminative power"
            />
          </div>
          <div className="space-y-6">
            <KeyFinding
              icon={LineChart}
              title="Dimensionality Reduction"
              description="PCA reduced feature set by 85% while maintaining 95.2% variance"
            />
            <KeyFinding
              icon={PieChart}
              title="Species Specificity"
              description="Certain feature combinations showed species-specific effectiveness"
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
        <h3 className="mb-6 text-xl font-bold">Statistical Significance</h3>
        <div className="space-y-4">
          <div className="bg-foreground/10 rounded-lg p-4">
            <h4 className="mb-2 font-medium">Hypothesis Testing Results</h4>
            <pre className="text-foreground/80 overflow-x-auto text-sm">
              {`• ANOVA test: p < 0.001 for feature type differences
• Tukey's HSD: Significant differences between all feature pairs
• Effect size (Cohen's d):
  - Shape vs. Color: 0.45 (medium)
  - Color vs. Texture: 0.62 (medium-large)
  - Texture vs. Combined: 0.38 (medium)`}
            </pre>
          </div>
        </div>
      </motion.div>
    </div>
  ),
};
