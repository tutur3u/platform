import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { Brain, ChartBar, Check, Database, Zap } from 'lucide-react';
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

const modelPerformanceData = [
  {
    name: 'DenseNet201',
    accuracy: 97.2,
    precision: 96.8,
    recall: 96.5,
    f1: 96.6,
    inferenceTime: 45,
    modelSize: 80,
  },
  {
    name: 'ResNet101',
    accuracy: 95.8,
    precision: 95.3,
    recall: 95.1,
    f1: 95.2,
    inferenceTime: 38,
    modelSize: 178,
  },
  {
    name: 'VGG16',
    accuracy: 94.5,
    precision: 94.2,
    recall: 94.0,
    f1: 94.1,
    inferenceTime: 28,
    modelSize: 528,
  },
  {
    name: 'InceptionV3',
    accuracy: 93.7,
    precision: 93.4,
    recall: 93.2,
    f1: 93.3,
    inferenceTime: 42,
    modelSize: 92,
  },
  {
    name: 'Xception',
    accuracy: 95.1,
    precision: 94.8,
    recall: 94.6,
    f1: 94.7,
    inferenceTime: 49,
    modelSize: 88,
  },
  {
    name: 'MobileNetV2',
    accuracy: 92.8,
    precision: 92.5,
    recall: 92.3,
    f1: 92.4,
    inferenceTime: 22,
    modelSize: 14,
  },
];

const trainingHistory = [
  { epoch: 1, accuracy: 45.2, validation: 44.8, loss: 2.1 },
  { epoch: 5, accuracy: 68.5, validation: 67.2, loss: 1.4 },
  { epoch: 10, accuracy: 82.3, validation: 80.1, loss: 0.8 },
  { epoch: 15, accuracy: 89.7, validation: 87.5, loss: 0.5 },
  { epoch: 20, accuracy: 93.4, validation: 91.2, loss: 0.3 },
  { epoch: 25, accuracy: 95.8, validation: 93.7, loss: 0.2 },
  { epoch: 30, accuracy: 97.2, validation: 95.1, loss: 0.15 },
];

const ModelMetric = ({
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

export const modelEvaluationSlide = {
  id: 'model-evaluation',
  title: '📊 Model Evaluation',
  subtitle: 'Performance Metrics & Training Analysis',
  content: (
    <div className="space-y-8">
      <div className="grid gap-6 md:grid-cols-4">
        <ModelMetric
          icon={Brain}
          color="text-blue-500"
          title="Best Model"
          value="DenseNet201"
          detail="Overall Performance"
        />
        <ModelMetric
          icon={ChartBar}
          color="text-emerald-500"
          title="Accuracy"
          value="97.2%"
          detail="Test Dataset"
        />
        <ModelMetric
          icon={Zap}
          color="text-amber-500"
          title="Inference"
          value="45ms"
          detail="Average Time"
        />
        <ModelMetric
          icon={Database}
          color="text-violet-500"
          title="Model Size"
          value="80MB"
          detail="Optimized"
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-foreground/5 rounded-xl p-6"
        >
          <h3 className="mb-4 text-lg font-bold">
            Model Performance Comparison
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={modelPerformanceData}
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="name" />
                <YAxis domain={[90, 100]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                  }}
                />
                <Legend />
                <Bar dataKey="accuracy" name="Accuracy %" fill="#3b82f6" />
                <Bar dataKey="precision" name="Precision %" fill="#10b981" />
                <Bar dataKey="recall" name="Recall %" fill="#8b5cf6" />
                <Bar dataKey="f1" name="F1-Score %" fill="#f59e0b" />
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
          <h3 className="mb-4 text-lg font-bold">Training History</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsLineChart
                data={trainingHistory}
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="epoch" />
                <YAxis />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="accuracy"
                  name="Training Accuracy %"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="validation"
                  name="Validation Accuracy %"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="loss"
                  name="Loss"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={false}
                />
              </RechartsLineChart>
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
        <h3 className="mb-4 text-lg font-bold">Model Analysis & Insights</h3>
        <div className="grid gap-6 md:grid-cols-3">
          <div className="space-y-2">
            <h4 className="font-medium">Performance Highlights</h4>
            <ul className="space-y-1 text-sm">
              <li className="flex items-center gap-2">
                <Check className="h-3 w-3 text-emerald-500" />
                <span>Consistent high accuracy across classes</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-3 w-3 text-emerald-500" />
                <span>Low false positive rate (3.2%)</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-3 w-3 text-emerald-500" />
                <span>Fast convergence during training</span>
              </li>
            </ul>
          </div>
          <div className="space-y-2">
            <h4 className="font-medium">Technical Details</h4>
            <ul className="space-y-1 text-sm">
              <li className="flex items-center gap-2">
                <Check className="h-3 w-3 text-emerald-500" />
                <span>Transfer learning from ImageNet</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-3 w-3 text-emerald-500" />
                <span>Adam optimizer with lr=0.001</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-3 w-3 text-emerald-500" />
                <span>Batch size: 32, Epochs: 30</span>
              </li>
            </ul>
          </div>
          <div className="space-y-2">
            <h4 className="font-medium">Deployment Benefits</h4>
            <ul className="space-y-1 text-sm">
              <li className="flex items-center gap-2">
                <Check className="h-3 w-3 text-emerald-500" />
                <span>Real-time inference capability</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-3 w-3 text-emerald-500" />
                <span>Mobile-friendly architecture</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-3 w-3 text-emerald-500" />
                <span>Easy integration with APIs</span>
              </li>
            </ul>
          </div>
        </div>
      </motion.div>
    </div>
  ),
};
