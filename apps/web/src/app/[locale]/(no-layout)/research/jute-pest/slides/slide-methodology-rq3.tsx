import { motion } from 'framer-motion';
import {
  ArrowRight,
  BarChart2,
  Brain,
  ChartBar,
  Code2,
  Cog,
  Database,
  GitBranch,
  Grid,
  LineChart,
  Network,
  PieChart,
} from 'lucide-react';

const FeatureCard = ({
  icon: Icon,
  color,
  bgColor,
  title,
  items,
}: {
  icon: any;
  color: string;
  bgColor: string;
  title: string;
  items: string[];
}) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.9 }}
    animate={{ opacity: 1, scale: 1 }}
    whileHover={{ scale: 1.02 }}
    className="bg-foreground/5 hover:bg-foreground/10 group relative overflow-hidden rounded-xl p-6 transition-colors"
  >
    <div className="absolute right-0 top-0 -translate-y-1/4 translate-x-1/4 opacity-5">
      <Icon className="h-32 w-32" />
    </div>
    <div className="mb-4 flex items-center gap-3">
      <div className={`${bgColor} ${color} rounded-lg p-2`}>
        <Icon className="h-5 w-5" />
      </div>
      <h4 className="font-medium">{title}</h4>
    </div>
    <ul className="space-y-2">
      {items.map((item, i) => (
        <motion.li
          key={item}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 + i * 0.1 }}
          className="flex items-center gap-2"
        >
          <div
            className={`${bgColor} ${color} flex h-5 w-5 items-center justify-center rounded-full text-xs`}
          >
            {i + 1}
          </div>
          <span className="text-foreground/80 text-sm">{item}</span>
        </motion.li>
      ))}
    </ul>
  </motion.div>
);

const ProcessStep = ({
  icon: Icon,
  color,
  title,
  description,
}: {
  icon: any;
  color: string;
  title: string;
  description: string;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="flex items-center gap-4"
  >
    <div
      className={`${color} flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-opacity-10`}
    >
      <Icon className="h-6 w-6" />
    </div>
    <div>
      <h4 className="font-medium">{title}</h4>
      <p className="text-foreground/60 text-sm">{description}</p>
    </div>
  </motion.div>
);

const AnalysisStep = ({
  icon: Icon,
  color,
  label,
}: {
  icon: any;
  color: string;
  label: string;
}) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.9 }}
    animate={{ opacity: 1, scale: 1 }}
    whileHover={{ scale: 1.05 }}
    className="flex flex-col items-center gap-2"
  >
    <div
      className={`${color} flex h-10 w-10 items-center justify-center rounded-lg bg-opacity-10`}
    >
      <Icon className="h-5 w-5" />
    </div>
    <span className="text-foreground/60 text-center text-sm">{label}</span>
  </motion.div>
);

export const methodologyRQ3Slide = {
  id: 'methodology-rq3',
  title: '📊 RQ3: Feature Correlation Analysis',
  subtitle: 'Methodology & Statistical Approach',
  content: (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-foreground/5 rounded-xl p-6"
      >
        <h3 className="mb-6 text-center text-xl font-bold">
          Analysis Pipeline
        </h3>
        <div className="flex items-center justify-center gap-4 text-sm">
          <AnalysisStep
            icon={Database}
            color="text-blue-500"
            label="Feature Collection"
          />
          <ArrowRight className="text-foreground/40 h-4 w-4" />
          <AnalysisStep
            icon={GitBranch}
            color="text-purple-500"
            label="Feature Engineering"
          />
          <ArrowRight className="text-foreground/40 h-4 w-4" />
          <AnalysisStep
            icon={Network}
            color="text-emerald-500"
            label="Correlation Analysis"
          />
          <ArrowRight className="text-foreground/40 h-4 w-4" />
          <AnalysisStep
            icon={Brain}
            color="text-orange-500"
            label="Feature Selection"
          />
        </div>
      </motion.div>

      <div className="grid gap-6 md:grid-cols-2">
        <FeatureCard
          icon={Grid}
          color="text-blue-500"
          bgColor="bg-blue-500/10"
          title="Feature Engineering"
          items={[
            'Shape feature extraction',
            'Color feature computation',
            'Texture feature analysis',
            'Composite feature creation',
          ]}
        />
        <FeatureCard
          icon={Network}
          color="text-purple-500"
          bgColor="bg-purple-500/10"
          title="Statistical Analysis"
          items={[
            'Pearson correlation matrix',
            'Feature-label correlations',
            'Statistical significance tests',
            'Feature importance ranking',
          ]}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-6">
          <ProcessStep
            icon={BarChart2}
            color="text-emerald-500"
            title="Dimensionality Reduction"
            description="PCA implementation and LDA analysis for feature space optimization"
          />
          <ProcessStep
            icon={PieChart}
            color="text-orange-500"
            title="Feature Selection"
            description="Importance ranking and optimal feature subset identification"
          />
        </div>
        <div className="space-y-6">
          <ProcessStep
            icon={LineChart}
            color="text-blue-500"
            title="Data Processing"
            description="Feature normalization and outlier detection procedures"
          />
          <ProcessStep
            icon={ChartBar}
            color="text-purple-500"
            title="Visualization"
            description="Correlation heatmaps and feature importance visualization"
          />
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-foreground/5 rounded-xl p-6"
      >
        <h3 className="mb-6 text-center text-lg font-bold">
          Implementation Tools
        </h3>
        <div className="flex items-center justify-center gap-8">
          <AnalysisStep
            icon={Code2}
            color="text-blue-500"
            label="Scikit-learn"
          />
          <AnalysisStep icon={Database} color="text-purple-500" label="NumPy" />
          <AnalysisStep
            icon={BarChart2}
            color="text-emerald-500"
            label="SciPy"
          />
          <AnalysisStep
            icon={ChartBar}
            color="text-orange-500"
            label="Seaborn"
          />
          <AnalysisStep
            icon={Cog}
            color="text-red-500"
            label="Custom Scripts"
          />
        </div>
      </motion.div>
    </div>
  ),
};
