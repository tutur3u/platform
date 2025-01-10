import { motion } from 'framer-motion';
import {
  ArrowRight,
  Brain,
  ChartBar,
  Cloud,
  Cpu,
  Database,
  Network,
  Server,
  Shield,
  Smartphone,
  Target,
} from 'lucide-react';

const FeatureCard = ({
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
    className="bg-foreground/5 hover:bg-foreground/10 group relative overflow-hidden rounded-xl p-6 transition-colors"
  >
    <div className="absolute right-0 top-0 -translate-y-1/4 translate-x-1/4 opacity-5">
      <Icon className="h-32 w-32" />
    </div>
    <div className="mb-4 flex items-center gap-3">
      <div
        className={`${color} flex h-12 w-12 items-center justify-center rounded-xl bg-opacity-10`}
      >
        <Icon className="h-6 w-6" />
      </div>
      <h4 className="font-medium">{title}</h4>
    </div>
    <p className="text-foreground/60 text-sm">{description}</p>
  </motion.div>
);

const BenefitCard = ({
  icon: Icon,
  color,
  title,
  items,
}: {
  icon: any;
  color: string;
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
      <div
        className={`${color} flex h-12 w-12 items-center justify-center rounded-xl bg-opacity-10`}
      >
        <Icon className="h-6 w-6" />
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
            className={`${color} flex h-5 w-5 items-center justify-center rounded-full bg-opacity-10 text-xs`}
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

export const solutionOverviewSlide = {
  id: 'solution-overview',
  title: '🧠 Deep Learning Solution',
  subtitle: 'A Novel Approach to Pest Detection',
  content: (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-foreground/5 rounded-xl p-6"
      >
        <h3 className="mb-6 text-center text-xl font-bold">
          Solution Pipeline
        </h3>
        <div className="flex items-center justify-center gap-4 text-sm">
          <FeatureCard
            icon={Database}
            color="text-blue-500"
            title="Data Collection"
            description="Comprehensive pest image dataset"
          />
          <ArrowRight className="text-foreground/40 h-4 w-4" />
          <FeatureCard
            icon={Brain}
            color="text-purple-500"
            title="Deep Learning"
            description="Transfer learning with CNNs"
          />
          <ArrowRight className="text-foreground/40 h-4 w-4" />
          <FeatureCard
            icon={Smartphone}
            color="text-emerald-500"
            title="Deployment"
            description="Mobile-first pest detection"
          />
          <ArrowRight className="text-foreground/40 h-4 w-4" />
          <FeatureCard
            icon={Target}
            color="text-orange-500"
            title="Monitoring"
            description="Real-time pest tracking"
          />
        </div>
      </motion.div>

      <div className="grid gap-6 md:grid-cols-2">
        <BenefitCard
          icon={Brain}
          color="text-blue-500"
          title="Deep Learning Approach"
          items={[
            'Automated pest identification',
            'Early detection capabilities',
            'High accuracy and reliability',
            'Real-time processing',
          ]}
        />
        <BenefitCard
          icon={Cpu}
          color="text-purple-500"
          title="Transfer Learning"
          items={[
            'Pre-trained knowledge transfer',
            'Reduced training time',
            'Better generalization',
            'Optimized architecture',
          ]}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="space-y-6">
          <ProcessStep
            icon={Shield}
            color="text-emerald-500"
            title="Sustainable Farming"
            description="Reduced pesticide use and targeted interventions"
          />
          <ProcessStep
            icon={ChartBar}
            color="text-blue-500"
            title="Economic Benefits"
            description="Increased yield and cost reduction"
          />
        </div>
        <div className="space-y-6">
          <ProcessStep
            icon={Cloud}
            color="text-purple-500"
            title="Cloud Integration"
            description="Scalable and accessible pest monitoring"
          />
          <ProcessStep
            icon={Network}
            color="text-orange-500"
            title="Real-time Analysis"
            description="Instant pest detection and alerts"
          />
        </div>
        <div className="space-y-6">
          <ProcessStep
            icon={Smartphone}
            color="text-blue-500"
            title="Mobile Access"
            description="On-the-go pest monitoring and alerts"
          />
          <ProcessStep
            icon={Server}
            color="text-emerald-500"
            title="Automated System"
            description="24/7 monitoring and early warnings"
          />
        </div>
      </div>
    </div>
  ),
};
