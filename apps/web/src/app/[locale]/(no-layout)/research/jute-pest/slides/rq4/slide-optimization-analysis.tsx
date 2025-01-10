import { motion } from 'framer-motion';
import {
  Activity,
  BarChart3,
  Brain,
  CircleDot,
  Database,
  GitBranch,
  LineChart,
  Network,
  Sigma,
  Timer,
} from 'lucide-react';

const OptimizationMetric = ({
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

const OptimizationDetail = ({
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

export const rq4OptimizationSlide = {
  title: '⚡ Model Optimization Analysis',
  subtitle: 'Performance and Resource Optimization Results',
  content: (
    <div className="space-y-8">
      {/* Key Optimization Metrics */}
      <div className="grid gap-6 md:grid-cols-3">
        <OptimizationMetric
          icon={Timer}
          title="Latency Reduction"
          value="78%"
          description="Inference time improvement"
        />
        <OptimizationMetric
          icon={Database}
          title="Size Reduction"
          value="84%"
          description="Model size compression"
        />
        <OptimizationMetric
          icon={Activity}
          title="Accuracy Impact"
          value="-1.2%"
          description="Minimal accuracy loss"
        />
      </div>

      {/* Optimization Techniques */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-foreground/5 rounded-xl p-6"
      >
        <h3 className="mb-6 text-xl font-bold">Optimization Techniques</h3>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-6">
            <OptimizationDetail
              icon={Brain}
              title="Model Pruning"
              description="72% parameter reduction with structured pruning"
            />
            <OptimizationDetail
              icon={Network}
              title="Quantization"
              description="8-bit quantization with 4x size reduction"
            />
            <OptimizationDetail
              icon={GitBranch}
              title="Architecture Search"
              description="Efficient backbone with MobileNetV3"
            />
          </div>
          <div className="space-y-6">
            <OptimizationDetail
              icon={Sigma}
              title="Knowledge Distillation"
              description="6.2% accuracy recovery with distillation"
            />
            <OptimizationDetail
              icon={BarChart3}
              title="Layer Fusion"
              description="32% latency reduction with operator fusion"
            />
            <OptimizationDetail
              icon={LineChart}
              title="Memory Optimization"
              description="68% reduction in peak memory usage"
            />
          </div>
        </div>
      </motion.div>

      {/* Implementation Details */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-foreground/5 rounded-xl p-6"
      >
        <h3 className="mb-6 text-xl font-bold">Implementation Analysis</h3>
        <div className="space-y-4">
          <div className="bg-foreground/10 rounded-lg p-4">
            <h4 className="mb-2 font-medium">Optimization Results</h4>
            <pre className="text-foreground/80 overflow-x-auto text-sm">
              {`• Original Model: 124MB, 320ms inference
• Pruned Model: 48MB, 180ms inference
• Quantized Model: 12MB, 95ms inference
• Final Model: 8.2MB, 42ms inference`}
            </pre>
          </div>
          <div className="bg-foreground/10 rounded-lg p-4">
            <h4 className="mb-2 font-medium">Performance Analysis</h4>
            <pre className="text-foreground/80 overflow-x-auto text-sm">
              {`• Baseline Accuracy: 96.8%
• Post-optimization: 95.6%
• Memory Usage: 128MB → 42MB
• Battery Impact: 82% reduction`}
            </pre>
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
        <div className="grid gap-4 md:grid-cols-2">
          <div className="bg-foreground/10 rounded-lg p-4">
            <h4 className="mb-2 font-medium">Resource Efficiency</h4>
            <ul className="text-foreground/80 space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                84% model size reduction
              </li>
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                78% latency improvement
              </li>
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                68% memory optimization
              </li>
            </ul>
          </div>
          <div className="bg-foreground/10 rounded-lg p-4">
            <h4 className="mb-2 font-medium">Performance Impact</h4>
            <ul className="text-foreground/80 space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                95.6% final accuracy
              </li>
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                42ms inference time
              </li>
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                82% power efficiency
              </li>
            </ul>
          </div>
        </div>
      </motion.div>
    </div>
  ),
};
