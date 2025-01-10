import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { Award, Check, Clock, Cpu, Zap } from 'lucide-react';
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

const modelComparisonData = [
  {
    name: 'Traditional ML',
    svm: 85.3,
    rf: 87.8,
    knn: 82.5,
    year: 2020,
  },
  {
    name: 'Early DL',
    svm: 85.3,
    rf: 87.8,
    knn: 82.5,
    cnn: 91.2,
    year: 2021,
  },
  {
    name: 'Advanced DL',
    svm: 85.3,
    rf: 87.8,
    knn: 82.5,
    cnn: 91.2,
    resnet: 93.5,
    vgg: 92.8,
    year: 2022,
  },
  {
    name: 'Current Work',
    svm: 85.3,
    rf: 87.8,
    knn: 82.5,
    cnn: 91.2,
    resnet: 93.5,
    vgg: 92.8,
    densenet: 97.2,
    year: 2023,
  },
];

const performanceMetrics = [
  {
    metric: 'Accuracy',
    traditional: 85.2,
    previous: 92.5,
    current: 97.2,
  },
  {
    metric: 'Precision',
    traditional: 84.8,
    previous: 92.1,
    current: 96.8,
  },
  {
    metric: 'Recall',
    traditional: 84.5,
    previous: 91.8,
    current: 96.5,
  },
  {
    metric: 'F1-Score',
    traditional: 84.6,
    previous: 91.9,
    current: 96.6,
  },
];

const ComparisonMetric = ({
  icon: Icon,
  color,
  title,
  value,
  improvement,
}: {
  icon: any;
  color: string;
  title: string;
  value: string;
  improvement: string;
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
      <div className="text-foreground/60 text-sm">{improvement}</div>
    </div>
  </motion.div>
);

export const comparativeAnalysisSlide = {
  id: 'comparative-analysis',
  title: '📈 Comparative Analysis',
  subtitle: 'Benchmarking & Improvements',
  content: (
    <div className="space-y-8">
      <div className="grid gap-6 md:grid-cols-4">
        <ComparisonMetric
          icon={Award}
          color="text-blue-500"
          title="Accuracy Gain"
          value="+11.9%"
          improvement="vs. Previous Methods"
        />
        <ComparisonMetric
          icon={Clock}
          color="text-emerald-500"
          title="Training Time"
          value="-35%"
          improvement="Faster Convergence"
        />
        <ComparisonMetric
          icon={Cpu}
          color="text-amber-500"
          title="Model Size"
          value="-45%"
          improvement="More Efficient"
        />
        <ComparisonMetric
          icon={Zap}
          color="text-violet-500"
          title="Inference"
          value="45ms"
          improvement="Real-time Capable"
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-foreground/5 rounded-xl p-6"
        >
          <h3 className="mb-4 text-lg font-bold">Evolution of Performance</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsLineChart
                data={modelComparisonData}
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="name" />
                <YAxis domain={[80, 100]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="svm"
                  name="SVM"
                  stroke="#3b82f6"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="rf"
                  name="Random Forest"
                  stroke="#10b981"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="knn"
                  name="KNN"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="cnn"
                  name="CNN"
                  stroke="#f59e0b"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="resnet"
                  name="ResNet"
                  stroke="#ec4899"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="vgg"
                  name="VGG"
                  stroke="#14b8a6"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="densenet"
                  name="DenseNet (Ours)"
                  stroke="#6366f1"
                  strokeWidth={3}
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
          <h3 className="mb-4 text-lg font-bold">Performance Metrics</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={performanceMetrics}
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="metric" />
                <YAxis domain={[80, 100]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                  }}
                />
                <Legend />
                <Bar
                  dataKey="traditional"
                  name="Traditional ML"
                  fill="#3b82f6"
                />
                <Bar dataKey="previous" name="Previous DL" fill="#10b981" />
                <Bar dataKey="current" name="Our Method" fill="#8b5cf6" />
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
        <h3 className="mb-4 text-lg font-bold">Key Improvements</h3>
        <div className="grid gap-6 md:grid-cols-3">
          <div className="space-y-2">
            <h4 className="font-medium">Accuracy & Performance</h4>
            <ul className="space-y-1 text-sm">
              <li className="flex items-center gap-2">
                <Check className="h-3 w-3 text-emerald-500" />
                <span>State-of-the-art accuracy (97.2%)</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-3 w-3 text-emerald-500" />
                <span>Faster training convergence</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-3 w-3 text-emerald-500" />
                <span>Improved generalization</span>
              </li>
            </ul>
          </div>
          <div className="space-y-2">
            <h4 className="font-medium">Technical Advantages</h4>
            <ul className="space-y-1 text-sm">
              <li className="flex items-center gap-2">
                <Check className="h-3 w-3 text-emerald-500" />
                <span>Optimized model architecture</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-3 w-3 text-emerald-500" />
                <span>Reduced parameter count</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-3 w-3 text-emerald-500" />
                <span>Enhanced feature extraction</span>
              </li>
            </ul>
          </div>
          <div className="space-y-2">
            <h4 className="font-medium">Practical Benefits</h4>
            <ul className="space-y-1 text-sm">
              <li className="flex items-center gap-2">
                <Check className="h-3 w-3 text-emerald-500" />
                <span>Real-time processing capability</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-3 w-3 text-emerald-500" />
                <span>Lower resource requirements</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-3 w-3 text-emerald-500" />
                <span>Easier deployment process</span>
              </li>
            </ul>
          </div>
        </div>
      </motion.div>
    </div>
  ),
};
