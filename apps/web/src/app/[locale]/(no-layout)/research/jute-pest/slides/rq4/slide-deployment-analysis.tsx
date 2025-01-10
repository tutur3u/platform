import { motion } from 'framer-motion';
import {
  Activity,
  Brain,
  CircleDot,
  Cloud,
  Code2,
  Database,
  Network,
  Phone,
} from 'lucide-react';

const DeploymentMetric = ({
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

const DeploymentDetail = ({
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

export const rq4DeploymentSlide = {
  title: '🚀 Model Deployment Analysis',
  subtitle: 'Cross-platform Deployment and Performance',
  content: (
    <div className="space-y-8">
      {/* Key Deployment Metrics */}
      <div className="grid gap-6 md:grid-cols-3">
        <DeploymentMetric
          icon={Phone}
          title="Mobile Performance"
          value="42ms"
          description="Average inference time on mobile"
        />
        <DeploymentMetric
          icon={Cloud}
          title="Cloud Scalability"
          value="1000+"
          description="Requests per second"
        />
        <DeploymentMetric
          icon={Activity}
          title="Platform Coverage"
          value="98%"
          description="Device compatibility rate"
        />
      </div>

      {/* Deployment Platforms */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-foreground/5 rounded-xl p-6"
      >
        <h3 className="mb-6 text-xl font-bold">Deployment Platforms</h3>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-6">
            <DeploymentDetail
              icon={Phone}
              title="Mobile Deployment"
              description="iOS and Android with TensorFlow Lite"
            />
            <DeploymentDetail
              icon={Cloud}
              title="Cloud Deployment"
              description="Containerized with Kubernetes orchestration"
            />
            <DeploymentDetail
              icon={Network}
              title="Edge Deployment"
              description="Optimized for IoT and edge devices"
            />
          </div>
          <div className="space-y-6">
            <DeploymentDetail
              icon={Brain}
              title="Model Serving"
              description="TensorFlow Serving with REST/gRPC"
            />
            <DeploymentDetail
              icon={Code2}
              title="API Integration"
              description="RESTful API with OpenAPI specification"
            />
            <DeploymentDetail
              icon={Database}
              title="Data Pipeline"
              description="Automated data processing and inference"
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
            <h4 className="mb-2 font-medium">Mobile Performance</h4>
            <pre className="text-foreground/80 overflow-x-auto text-sm">
              {`• iOS (iPhone 13): 38ms inference
• Android (Pixel 6): 42ms inference
• Memory Usage: <50MB
• Battery Impact: <2% per hour`}
            </pre>
          </div>
          <div className="bg-foreground/10 rounded-lg p-4">
            <h4 className="mb-2 font-medium">Cloud Performance</h4>
            <pre className="text-foreground/80 overflow-x-auto text-sm">
              {`• Latency: 28ms average
• Throughput: 1200 req/s
• Autoscaling: 2-10 pods
• Cost: $0.05 per 1000 requests`}
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
            <h4 className="mb-2 font-medium">Platform Performance</h4>
            <ul className="text-foreground/80 space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                Consistent cross-platform accuracy
              </li>
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                Efficient resource utilization
              </li>
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                Scalable cloud deployment
              </li>
            </ul>
          </div>
          <div className="bg-foreground/10 rounded-lg p-4">
            <h4 className="mb-2 font-medium">Deployment Impact</h4>
            <ul className="text-foreground/80 space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                98% device compatibility
              </li>
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                Cost-effective scaling
              </li>
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                Minimal maintenance overhead
              </li>
            </ul>
          </div>
        </div>
      </motion.div>
    </div>
  ),
};
