import { motion } from 'framer-motion';
import {
  ArrowRight,
  BarChart2,
  Book,
  Camera,
  ChartBar,
  Code2,
  FileImage,
  Layers,
  LineChart,
  PieChart,
  Sun,
  Target,
} from 'lucide-react';

const AnalysisCard = ({
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

const ImplementationStep = ({
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

export const methodologyRQ2Slide = {
  id: 'methodology-rq2',
  title: '🌍 RQ2: Environmental Impact Analysis',
  subtitle: 'Methodology & Implementation Details',
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
          <ImplementationStep
            icon={Camera}
            color="text-blue-500"
            label="Image Capture"
          />
          <ArrowRight className="text-foreground/40 h-4 w-4" />
          <ImplementationStep
            icon={Sun}
            color="text-purple-500"
            label="Lighting Analysis"
          />
          <ArrowRight className="text-foreground/40 h-4 w-4" />
          <ImplementationStep
            icon={Layers}
            color="text-emerald-500"
            label="Background Study"
          />
          <ArrowRight className="text-foreground/40 h-4 w-4" />
          <ImplementationStep
            icon={Target}
            color="text-orange-500"
            label="Impact Assessment"
          />
        </div>
      </motion.div>

      <div className="grid gap-6 md:grid-cols-2">
        <AnalysisCard
          icon={Sun}
          color="text-blue-500"
          bgColor="bg-blue-500/10"
          title="Lighting Conditions"
          items={[
            'Natural light categorization',
            'Artificial light assessment',
            'Low-light condition analysis',
            'Illumination normalization',
          ]}
        />
        <AnalysisCard
          icon={Layers}
          color="text-purple-500"
          bgColor="bg-purple-500/10"
          title="Background Analysis"
          items={[
            'Complexity measurement',
            'Texture analysis',
            'Color distribution study',
            'Background segmentation',
          ]}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-6">
          <ProcessStep
            icon={BarChart2}
            color="text-emerald-500"
            title="Comparative Tests"
            description="Within-species comparisons and cross-condition analysis for feature stability"
          />
          <ProcessStep
            icon={PieChart}
            color="text-orange-500"
            title="Impact Quantification"
            description="Effect size calculation and variance analysis across conditions"
          />
        </div>
        <div className="space-y-6">
          <ProcessStep
            icon={LineChart}
            color="text-blue-500"
            title="Statistical Analysis"
            description="Feature stability assessment and percentage differences calculation"
          />
          <ProcessStep
            icon={ChartBar}
            color="text-purple-500"
            title="Visualization"
            description="Interactive plots and comprehensive result visualization"
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
          <ImplementationStep
            icon={Code2}
            color="text-blue-500"
            label="Python Scripts"
          />
          <ImplementationStep
            icon={FileImage}
            color="text-purple-500"
            label="OpenCV"
          />
          <ImplementationStep
            icon={BarChart2}
            color="text-emerald-500"
            label="Statistics"
          />
          <ImplementationStep
            icon={ChartBar}
            color="text-orange-500"
            label="Visualization"
          />
          <ImplementationStep
            icon={Book}
            color="text-red-500"
            label="Documentation"
          />
        </div>
      </motion.div>
    </div>
  ),
};
