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

export const rq2ResultsSlide = {
  title: '📊 RQ2 Results & Findings',
  subtitle: 'Environmental Impact Analysis Results',
  content: (
    <div className="space-y-8">
      {/* Key Performance Metrics */}
      <div className="grid gap-6 md:grid-cols-3">
        <ResultMetric
          icon={Target}
          title="Overall Robustness"
          value="86.2%"
          description="Average performance across all environmental conditions"
        />
        <ResultMetric
          icon={TrendingUp}
          title="Stability Score"
          value="0.892"
          description="Feature stability coefficient across conditions"
        />
        <ResultMetric
          icon={Star}
          title="Best Condition"
          value="Natural Light"
          description="Most stable environmental condition"
        />
      </div>

      {/* Detailed Results */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-foreground/5 rounded-xl p-6"
      >
        <h3 className="mb-6 text-xl font-bold">Performance by Condition</h3>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <div className="bg-foreground/10 rounded-lg p-4">
              <h4 className="mb-2 font-medium">Lighting Conditions</h4>
              <ul className="text-foreground/80 space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <CircleDot className="text-primary h-4 w-4" />
                  Natural light: 92.4% accuracy
                </li>
                <li className="flex items-center gap-2">
                  <CircleDot className="text-primary h-4 w-4" />
                  Artificial light: 88.7% accuracy
                </li>
                <li className="flex items-center gap-2">
                  <CircleDot className="text-primary h-4 w-4" />
                  Low light: 78.5% accuracy
                </li>
              </ul>
            </div>
            <div className="bg-foreground/10 rounded-lg p-4">
              <h4 className="mb-2 font-medium">Background Complexity</h4>
              <ul className="text-foreground/80 space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <CircleDot className="text-primary h-4 w-4" />
                  Simple: 95.2% accuracy
                </li>
                <li className="flex items-center gap-2">
                  <CircleDot className="text-primary h-4 w-4" />
                  Moderate: 88.7% accuracy
                </li>
                <li className="flex items-center gap-2">
                  <CircleDot className="text-primary h-4 w-4" />
                  Complex: 82.4% accuracy
                </li>
              </ul>
            </div>
          </div>
          <div className="space-y-4">
            <div className="bg-foreground/10 rounded-lg p-4">
              <h4 className="mb-2 font-medium">Temperature Impact</h4>
              <ul className="text-foreground/80 space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <CircleDot className="text-primary h-4 w-4" />
                  Optimal (20-35°C): 91.2%
                </li>
                <li className="flex items-center gap-2">
                  <CircleDot className="text-primary h-4 w-4" />
                  High (&gt;35°C): 84.5%
                </li>
                <li className="flex items-center gap-2">
                  <CircleDot className="text-primary h-4 w-4" />
                  Low (&lt;15°C): 82.8%
                </li>
              </ul>
            </div>
            <div className="bg-foreground/10 rounded-lg p-4">
              <h4 className="mb-2 font-medium">Humidity Impact</h4>
              <ul className="text-foreground/80 space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <CircleDot className="text-primary h-4 w-4" />
                  Optimal (40-60%): 90.4%
                </li>
                <li className="flex items-center gap-2">
                  <CircleDot className="text-primary h-4 w-4" />
                  High (&gt;80%): 75.2%
                </li>
                <li className="flex items-center gap-2">
                  <CircleDot className="text-primary h-4 w-4" />
                  Low (&lt;30%): 81.7%
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
              title="Environmental Resilience"
              description="System shows strong resilience to moderate environmental variations"
            />
            <KeyFinding
              icon={BarChart3}
              title="Critical Conditions"
              description="High humidity and low light conditions most significantly impact performance"
            />
          </div>
          <div className="space-y-6">
            <KeyFinding
              icon={LineChart}
              title="Stability Patterns"
              description="Feature stability shows strong correlation with lighting conditions"
            />
            <KeyFinding
              icon={PieChart}
              title="Impact Distribution"
              description="Background complexity has more impact than temperature variations"
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
              {`• ANOVA test: p < 0.001 for environmental condition differences
• Tukey's HSD: Significant differences between extreme conditions
• Effect size (Cohen's d):
  - Lighting vs. Background: 0.68 (medium-large)
  - Temperature vs. Humidity: 0.42 (medium)
  - Day vs. Night: 0.55 (medium)`}
            </pre>
          </div>
        </div>
      </motion.div>
    </div>
  ),
};
