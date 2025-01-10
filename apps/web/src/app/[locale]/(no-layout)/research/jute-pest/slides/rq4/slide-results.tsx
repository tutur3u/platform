import { motion } from 'framer-motion';
import {
  Activity,
  Brain,
  CircleDot,
  Cloud,
  Database,
  Network,
  Phone,
  Star,
  Timer,
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

const ResultDetail = ({
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

export const rq4ResultsSlide = {
  title: '📊 Model Optimization Results',
  subtitle: 'Comprehensive Performance and Deployment Analysis',
  content: (
    <div className="space-y-8">
      {/* Key Result Metrics */}
      <div className="grid gap-6 md:grid-cols-3">
        <ResultMetric
          icon={Star}
          title="Overall Performance"
          value="95.6%"
          description="Final model accuracy"
        />
        <ResultMetric
          icon={Timer}
          title="Inference Speed"
          value="42ms"
          description="Average latency per request"
        />
        <ResultMetric
          icon={TrendingUp}
          title="Efficiency Gain"
          value="82%"
          description="Resource utilization improvement"
        />
      </div>

      {/* Detailed Results */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-foreground/5 rounded-xl p-6"
      >
        <h3 className="mb-6 text-xl font-bold">Platform Performance</h3>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-6">
            <ResultDetail
              icon={Phone}
              title="Mobile Devices"
              description="42ms inference, 95.6% accuracy on iOS/Android"
            />
            <ResultDetail
              icon={Cloud}
              title="Cloud Infrastructure"
              description="1200 req/s throughput with auto-scaling"
            />
            <ResultDetail
              icon={Network}
              title="Edge Devices"
              description="48ms inference on IoT devices"
            />
          </div>
          <div className="space-y-6">
            <ResultDetail
              icon={Brain}
              title="Model Efficiency"
              description="8.2MB size with 95.6% accuracy retention"
            />
            <ResultDetail
              icon={Database}
              title="Resource Usage"
              description="68% reduction in memory consumption"
            />
            <ResultDetail
              icon={Activity}
              title="Battery Impact"
              description="82% reduction in power consumption"
            />
          </div>
        </div>
      </motion.div>

      {/* Statistical Analysis */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-foreground/5 rounded-xl p-6"
      >
        <h3 className="mb-6 text-xl font-bold">Performance Analysis</h3>
        <div className="space-y-4">
          <div className="bg-foreground/10 rounded-lg p-4">
            <h4 className="mb-2 font-medium">Optimization Metrics</h4>
            <pre className="text-foreground/80 overflow-x-auto text-sm">
              {`• Model Size: 124MB → 8.2MB (93.4% reduction)
• Inference Time: 320ms → 42ms (86.9% reduction)
• Memory Usage: 128MB → 42MB (67.2% reduction)
• Power Usage: 100% → 18% (82% reduction)`}
            </pre>
          </div>
          <div className="bg-foreground/10 rounded-lg p-4">
            <h4 className="mb-2 font-medium">Accuracy Analysis</h4>
            <pre className="text-foreground/80 overflow-x-auto text-sm">
              {`• Original Accuracy: 96.8%
• Post-optimization: 95.6%
• Confidence Score: 0.92
• F1-Score: 0.946`}
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
            <h4 className="mb-2 font-medium">Optimization Impact</h4>
            <ul className="text-foreground/80 space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                Minimal accuracy trade-off
              </li>
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                Significant size reduction
              </li>
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                Enhanced deployment flexibility
              </li>
            </ul>
          </div>
          <div className="bg-foreground/10 rounded-lg p-4">
            <h4 className="mb-2 font-medium">Deployment Success</h4>
            <ul className="text-foreground/80 space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                98% device compatibility
              </li>
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                Seamless cross-platform performance
              </li>
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                Cost-effective scaling solution
              </li>
            </ul>
          </div>
        </div>
      </motion.div>
    </div>
  ),
};
