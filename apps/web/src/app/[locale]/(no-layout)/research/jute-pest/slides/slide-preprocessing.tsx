import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import {
  Camera,
  Check,
  Filter,
  Image as ImageIcon,
  Layers,
  Sparkles,
  Zap,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart as RechartsLineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const preprocessingMetrics = [
  {
    step: 'Raw Images',
    quality: 65,
    noise: 35,
    contrast: 55,
    uniformity: 45,
  },
  {
    step: 'Noise Reduction',
    quality: 78,
    noise: 12,
    contrast: 58,
    uniformity: 72,
  },
  {
    step: 'Enhancement',
    quality: 85,
    noise: 10,
    contrast: 82,
    uniformity: 85,
  },
  {
    step: 'Final',
    quality: 92,
    noise: 8,
    contrast: 88,
    uniformity: 90,
  },
];

const performanceImpact = [
  {
    technique: 'Gaussian Blur',
    accuracy: 94.5,
    speed: 1.2,
    memory: 1.0,
  },
  {
    technique: 'Median Filter',
    accuracy: 95.2,
    speed: 1.5,
    memory: 1.1,
  },
  {
    technique: 'Bilateral Filter',
    accuracy: 96.8,
    speed: 1.8,
    memory: 1.3,
  },
  {
    technique: 'Adaptive Histogram',
    accuracy: 97.2,
    speed: 1.4,
    memory: 1.2,
  },
];

const PreprocessingMetric = ({
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

export const preprocessingSlide = {
  id: 'preprocessing',
  title: '🔄 Image Preprocessing',
  subtitle: 'Enhancing Image Quality',
  content: (
    <div className="space-y-8">
      <div className="grid gap-6 md:grid-cols-4">
        <PreprocessingMetric
          icon={ImageIcon}
          color="text-blue-500"
          title="Image Quality"
          value="+41.5%"
          detail="Average Improvement"
        />
        <PreprocessingMetric
          icon={Filter}
          color="text-emerald-500"
          title="Noise Level"
          value="-77.1%"
          detail="Reduction Rate"
        />
        <PreprocessingMetric
          icon={Sparkles}
          color="text-amber-500"
          title="Contrast"
          value="+60.0%"
          detail="Enhancement"
        />
        <PreprocessingMetric
          icon={Zap}
          color="text-violet-500"
          title="Processing"
          value="1.4ms"
          detail="Per Image"
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-foreground/5 rounded-xl p-6"
        >
          <h3 className="mb-4 text-lg font-bold">Quality Metrics Progress</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsLineChart
                data={preprocessingMetrics}
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="step" />
                <YAxis domain={[0, 100]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="quality"
                  name="Quality"
                  stroke="#3b82f6"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="noise"
                  name="Noise"
                  stroke="#ef4444"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="contrast"
                  name="Contrast"
                  stroke="#10b981"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="uniformity"
                  name="Uniformity"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                />
              </RechartsLineChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-foreground/5 rounded-xl p-6"
        >
          <h3 className="mb-4 text-lg font-bold">Performance Impact</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={performanceImpact}
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="technique" />
                <YAxis />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                  }}
                />
                <Legend />
                <Bar dataKey="accuracy" name="Accuracy %" fill="#3b82f6" />
                <Bar dataKey="speed" name="Relative Speed" fill="#10b981" />
                <Bar dataKey="memory" name="Memory Usage" fill="#8b5cf6" />
              </BarChart>
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
        <h3 className="mb-6 text-lg font-bold">Preprocessing Pipeline</h3>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-6">
            <ProcessStep
              icon={Camera}
              color="text-blue-500"
              title="Image Acquisition"
              description="Raw image capture and initial quality assessment"
            />
            <ProcessStep
              icon={Filter}
              color="text-emerald-500"
              title="Noise Reduction"
              description="Advanced filtering techniques for noise removal"
            />
          </div>
          <div className="space-y-6">
            <ProcessStep
              icon={Sparkles}
              color="text-amber-500"
              title="Enhancement"
              description="Contrast adjustment and detail preservation"
            />
            <ProcessStep
              icon={Layers}
              color="text-violet-500"
              title="Standardization"
              description="Size normalization and format consistency"
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
          <h4 className="mb-4 font-medium">Noise Reduction</h4>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <Check className="h-3 w-3 text-emerald-500" />
              <span>Gaussian blur filtering</span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-3 w-3 text-emerald-500" />
              <span>Median noise removal</span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-3 w-3 text-emerald-500" />
              <span>Bilateral filtering</span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-3 w-3 text-emerald-500" />
              <span>Edge-preserving smoothing</span>
            </li>
          </ul>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="bg-foreground/5 rounded-xl p-6"
        >
          <h4 className="mb-4 font-medium">Enhancement</h4>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <Check className="h-3 w-3 text-emerald-500" />
              <span>Adaptive histogram equalization</span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-3 w-3 text-emerald-500" />
              <span>Contrast stretching</span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-3 w-3 text-emerald-500" />
              <span>Gamma correction</span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-3 w-3 text-emerald-500" />
              <span>Local contrast enhancement</span>
            </li>
          </ul>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="bg-foreground/5 rounded-xl p-6"
        >
          <h4 className="mb-4 font-medium">Standardization</h4>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <Check className="h-3 w-3 text-emerald-500" />
              <span>Resolution normalization</span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-3 w-3 text-emerald-500" />
              <span>Aspect ratio correction</span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-3 w-3 text-emerald-500" />
              <span>Color space conversion</span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-3 w-3 text-emerald-500" />
              <span>Format standardization</span>
            </li>
          </ul>
        </motion.div>
      </div>
    </div>
  ),
};
