import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import {
  Brain,
  ChartBar,
  Check,
  Cpu,
  Grid,
  Image as ImageIcon,
  Palette,
  Shapes,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const featureImportance = [
  { name: 'Area', importance: 95, complexity: 'Low', time: 0.8 },
  { name: 'Perimeter', importance: 92, complexity: 'Low', time: 0.7 },
  { name: 'Major Axis', importance: 88, complexity: 'Medium', time: 1.2 },
  { name: 'Minor Axis', importance: 85, complexity: 'Medium', time: 1.1 },
  { name: 'Aspect Ratio', importance: 90, complexity: 'Low', time: 0.9 },
  { name: 'Circularity', importance: 87, complexity: 'Medium', time: 1.3 },
  { name: 'Solidity', importance: 83, complexity: 'High', time: 1.5 },
  { name: 'Color Moments', importance: 89, complexity: 'High', time: 1.8 },
];

const featureCategories = [
  {
    name: 'Shape',
    accuracy: 92,
    robustness: 88,
    speed: 95,
    complexity: 75,
  },
  {
    name: 'Color',
    accuracy: 88,
    robustness: 85,
    speed: 90,
    complexity: 70,
  },
  {
    name: 'Texture',
    accuracy: 85,
    robustness: 82,
    speed: 87,
    complexity: 85,
  },
  {
    name: 'Combined',
    accuracy: 97,
    robustness: 94,
    speed: 85,
    complexity: 90,
  },
];

const FeatureMetric = ({
  icon: Icon,
  color,
  title,
  value,
  detail,
}: {
  icon: any;
  color: string;
  title: string;
  value: string;
  detail: string;
}) => (
  <motion.div
    whileHover={{ scale: 1.05 }}
    className={cn(
      'bg-foreground/5 hover:bg-foreground/10 group relative overflow-hidden rounded-xl p-6 transition-colors',
      'flex items-center gap-4'
    )}
  >
    <div
      className={cn('rounded-lg p-3', color.replace('text-', 'bg-') + '/10')}
    >
      <Icon className={cn('h-6 w-6', color)} />
    </div>
    <div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="font-medium">{title}</div>
      <div className="text-foreground/60 text-sm">{detail}</div>
    </div>
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
      className={cn(
        'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl',
        color.replace('text-', 'bg-') + '/10'
      )}
    >
      <Icon className={cn('h-6 w-6', color)} />
    </div>
    <div>
      <h4 className="font-medium">{title}</h4>
      <p className="text-foreground/60 text-sm">{description}</p>
    </div>
  </motion.div>
);

export const featureExtractionSlide = {
  id: 'feature-extraction',
  title: '🔍 Feature Extraction',
  subtitle: 'Extracting Meaningful Features',
  content: (
    <div className="space-y-8">
      <div className="grid gap-6 md:grid-cols-4">
        <FeatureMetric
          icon={Shapes}
          color="text-blue-500"
          title="Total Features"
          value="24"
          detail="Optimized Selection"
        />
        <FeatureMetric
          icon={ChartBar}
          color="text-emerald-500"
          title="Accuracy"
          value="97.2%"
          detail="Combined Features"
        />
        <FeatureMetric
          icon={Cpu}
          color="text-amber-500"
          title="Processing"
          value="1.2ms"
          detail="Per Feature"
        />
        <FeatureMetric
          icon={Brain}
          color="text-violet-500"
          title="Robustness"
          value="94%"
          detail="Cross-validation"
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-foreground/5 rounded-xl p-6"
        >
          <h3 className="mb-4 text-lg font-bold">Feature Importance</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={featureImportance}
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="name" />
                <YAxis domain={[0, 100]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                  }}
                />
                <Legend />
                <Bar
                  dataKey="importance"
                  name="Importance Score"
                  fill="hsl(var(--primary))"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-foreground/5 rounded-xl p-6"
        >
          <h3 className="mb-4 text-lg font-bold">
            Feature Categories Analysis
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={featureCategories}>
                <PolarGrid opacity={0.2} />
                <PolarAngleAxis dataKey="name" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                  }}
                />
                <Legend />
                <Radar
                  name="Accuracy"
                  dataKey="accuracy"
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  fillOpacity={0.3}
                />
                <Radar
                  name="Robustness"
                  dataKey="robustness"
                  stroke="#10b981"
                  fill="#10b981"
                  fillOpacity={0.3}
                />
                <Radar
                  name="Speed"
                  dataKey="speed"
                  stroke="#f59e0b"
                  fill="#f59e0b"
                  fillOpacity={0.3}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-foreground/5 rounded-xl p-6"
      >
        <h3 className="mb-6 text-lg font-bold">Extraction Pipeline</h3>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-6">
            <ProcessStep
              icon={ImageIcon}
              color="text-blue-500"
              title="Image Preprocessing"
              description="Noise reduction, normalization, and enhancement"
            />
            <ProcessStep
              icon={Shapes}
              color="text-emerald-500"
              title="Shape Analysis"
              description="Contour detection and morphological features"
            />
          </div>
          <div className="space-y-6">
            <ProcessStep
              icon={Palette}
              color="text-amber-500"
              title="Color Analysis"
              description="Color moments and distribution statistics"
            />
            <ProcessStep
              icon={Grid}
              color="text-violet-500"
              title="Texture Analysis"
              description="GLCM features and pattern recognition"
            />
          </div>
        </div>
      </motion.div>

      <div className="grid gap-6 md:grid-cols-3">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="bg-foreground/5 rounded-xl p-6"
        >
          <h4 className="mb-4 font-medium">Shape Features</h4>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <Check className="h-3 w-3 text-emerald-500" />
              <span>Area and perimeter measurements</span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-3 w-3 text-emerald-500" />
              <span>Aspect ratio and circularity</span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-3 w-3 text-emerald-500" />
              <span>Convex hull properties</span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-3 w-3 text-emerald-500" />
              <span>Morphological characteristics</span>
            </li>
          </ul>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="bg-foreground/5 rounded-xl p-6"
        >
          <h4 className="mb-4 font-medium">Color Features</h4>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <Check className="h-3 w-3 text-emerald-500" />
              <span>Color moments and statistics</span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-3 w-3 text-emerald-500" />
              <span>RGB and HSV histograms</span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-3 w-3 text-emerald-500" />
              <span>Color correlation matrices</span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-3 w-3 text-emerald-500" />
              <span>Dominant color extraction</span>
            </li>
          </ul>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="bg-foreground/5 rounded-xl p-6"
        >
          <h4 className="mb-4 font-medium">Texture Features</h4>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <Check className="h-3 w-3 text-emerald-500" />
              <span>GLCM features</span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-3 w-3 text-emerald-500" />
              <span>Local binary patterns</span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-3 w-3 text-emerald-500" />
              <span>Haralick texture features</span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-3 w-3 text-emerald-500" />
              <span>Gabor filter responses</span>
            </li>
          </ul>
        </motion.div>
      </div>
    </div>
  ),
};
