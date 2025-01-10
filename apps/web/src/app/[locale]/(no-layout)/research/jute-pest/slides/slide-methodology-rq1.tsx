import { motion } from 'framer-motion';
import {
  ArrowRight,
  BarChart2,
  Box,
  Camera,
  ChartBar,
  Code2,
  Cog,
  Database,
  FileImage,
  Filter,
  LineChart,
  Palette,
  PieChart,
  Shapes,
  Sparkles,
} from 'lucide-react';

const FeatureCard = ({
  icon: Icon,
  title,
  items,
}: {
  icon: any;
  title: string;
  items: string[];
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
    <ul className="space-y-2">
      {items.map((item, i) => (
        <motion.li
          key={item}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 + i * 0.1 }}
          className="flex items-center gap-2"
        >
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/10 text-xs text-emerald-500">
            ✓
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

const TechStack = ({
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
    <span className="text-foreground/60 text-sm">{label}</span>
  </motion.div>
);

export const methodologyRQ1Slide = {
  id: 'methodology-rq1',
  title: '🔬 RQ1: Morphological Feature Analysis',
  subtitle: 'Detailed Methodology & Implementation',
  content: (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-foreground/5 rounded-xl p-6"
      >
        <h3 className="mb-6 text-center text-xl font-bold">
          Feature Extraction Pipeline
        </h3>
        <div className="flex items-center justify-center gap-4 text-sm">
          <TechStack icon={Camera} color="text-blue-500" label="Image Input" />
          <ArrowRight className="text-foreground/40 h-4 w-4" />
          <TechStack
            icon={Filter}
            color="text-purple-500"
            label="Preprocessing"
          />
          <ArrowRight className="text-foreground/40 h-4 w-4" />
          <TechStack
            icon={Shapes}
            color="text-emerald-500"
            label="Feature Extraction"
          />
          <ArrowRight className="text-foreground/40 h-4 w-4" />
          <TechStack icon={ChartBar} color="text-orange-500" label="Analysis" />
        </div>
      </motion.div>

      <div className="grid gap-6 md:grid-cols-2">
        <FeatureCard
          icon={Box}
          title="Shape Analysis"
          items={[
            'Canny edge detection implementation',
            'OpenCV contour analysis',
            'Geometric feature calculation',
            'Shape descriptor extraction',
          ]}
        />
        <FeatureCard
          icon={Palette}
          title="Color Analysis"
          items={[
            'RGB histogram generation',
            'Statistical moments calculation',
            'Dominant color extraction',
            'Color space transformations',
          ]}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-6">
          <ProcessStep
            icon={BarChart2}
            color="text-blue-500"
            title="Feature Distribution"
            description="Descriptive statistics and box plot visualization for distribution analysis"
          />
          <ProcessStep
            icon={PieChart}
            color="text-purple-500"
            title="Statistical Tests"
            description="One-way ANOVA with Tukey's HSD post-hoc analysis and effect size calculation"
          />
        </div>
        <div className="space-y-6">
          <ProcessStep
            icon={LineChart}
            color="text-emerald-500"
            title="Data Analysis"
            description="Pandas/NumPy analysis with SciPy statistical tests and feature importance ranking"
          />
          <ProcessStep
            icon={Sparkles}
            color="text-orange-500"
            title="Visualization"
            description="Interactive Matplotlib/Seaborn plots for comprehensive result presentation"
          />
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-foreground/5 rounded-xl p-6"
      >
        <h3 className="mb-6 text-center text-lg font-bold">Technology Stack</h3>
        <div className="flex items-center justify-center gap-8">
          <TechStack icon={Code2} color="text-blue-500" label="Python" />
          <TechStack icon={FileImage} color="text-purple-500" label="OpenCV" />
          <TechStack icon={Database} color="text-emerald-500" label="NumPy" />
          <TechStack
            icon={ChartBar}
            color="text-orange-500"
            label="Matplotlib"
          />
          <TechStack icon={Cog} color="text-red-500" label="SciPy" />
        </div>
      </motion.div>
    </div>
  ),
};
