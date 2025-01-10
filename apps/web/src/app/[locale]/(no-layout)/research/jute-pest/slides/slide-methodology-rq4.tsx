import { motion } from 'framer-motion';
import {
  ArrowRight,
  BarChart2,
  Brain,
  ChartBar,
  Filter,
  LineChart,
  Microscope,
  Network,
  PieChart,
  Ruler,
  Scale,
  Target,
  TestTube,
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

const ResultCard = ({
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
    initial={{ opacity: 0, scale: 0.9 }}
    animate={{ opacity: 1, scale: 1 }}
    whileHover={{ scale: 1.05 }}
    className="flex flex-col items-center gap-3 text-center"
  >
    <div
      className={`${color} flex h-12 w-12 items-center justify-center rounded-xl bg-opacity-10`}
    >
      <Icon className="h-6 w-6" />
    </div>
    <h4 className="font-medium">{title}</h4>
    <p className="text-foreground/60 text-sm">{description}</p>
  </motion.div>
);

export const methodologyRQ4Slide = {
  id: 'methodology-rq4',
  title: '🔍 RQ4: Statistical Significance Analysis',
  subtitle: 'Morphological Feature Differentiation',
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
          <ResultCard
            icon={Microscope}
            color="text-blue-500"
            title="Feature Selection"
            description="Identify key morphological features"
          />
          <ArrowRight className="text-foreground/40 h-4 w-4" />
          <ResultCard
            icon={TestTube}
            color="text-purple-500"
            title="ANOVA Testing"
            description="Statistical significance analysis"
          />
          <ArrowRight className="text-foreground/40 h-4 w-4" />
          <ResultCard
            icon={Scale}
            color="text-emerald-500"
            title="Post-hoc Analysis"
            description="Detailed pairwise comparisons"
          />
          <ArrowRight className="text-foreground/40 h-4 w-4" />
          <ResultCard
            icon={Brain}
            color="text-orange-500"
            title="Interpretation"
            description="Biological implications"
          />
        </div>
      </motion.div>

      <div className="grid gap-6 md:grid-cols-2">
        <FeatureCard
          icon={Ruler}
          color="text-blue-500"
          bgColor="bg-blue-500/10"
          title="Feature Selection"
          items={[
            'Size measurements (area, perimeter)',
            'Shape descriptors (circularity, solidity)',
            'Color characteristics (RGB, HSV)',
            'Biological relevance criteria',
          ]}
        />
        <FeatureCard
          icon={ChartBar}
          color="text-purple-500"
          bgColor="bg-purple-500/10"
          title="Statistical Testing"
          items={[
            'One-way ANOVA per feature',
            'F-statistic calculation',
            'P-value assessment',
            'Effect size estimation',
          ]}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-6">
          <ProcessStep
            icon={BarChart2}
            color="text-emerald-500"
            title="ANOVA Analysis"
            description="Comprehensive statistical testing with F-statistics and p-values"
          />
          <ProcessStep
            icon={PieChart}
            color="text-orange-500"
            title="Post-hoc Testing"
            description="Tukey's HSD test for detailed pairwise comparisons"
          />
        </div>
        <div className="space-y-6">
          <ProcessStep
            icon={LineChart}
            color="text-blue-500"
            title="Effect Size Analysis"
            description="Quantification of differences between species groups"
          />
          <ProcessStep
            icon={Network}
            color="text-purple-500"
            title="Relationship Mapping"
            description="Visualization of inter-species morphological differences"
          />
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-foreground/5 rounded-xl p-6"
      >
        <h3 className="mb-6 text-center text-lg font-bold">Key Findings</h3>
        <div className="grid gap-6 md:grid-cols-3">
          <ResultCard
            icon={Target}
            color="text-blue-500"
            title="Statistical Evidence"
            description="Significant morphological differences with p < 0.05"
          />
          <ResultCard
            icon={Brain}
            color="text-purple-500"
            title="Biological Implications"
            description="Species-specific adaptations and evolutionary insights"
          />
          <ResultCard
            icon={Filter}
            color="text-emerald-500"
            title="Practical Impact"
            description="Enhanced accuracy in automated species classification"
          />
        </div>
      </motion.div>
    </div>
  ),
};
