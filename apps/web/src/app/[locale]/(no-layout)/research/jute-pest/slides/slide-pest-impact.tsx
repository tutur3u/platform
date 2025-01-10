import { motion } from 'framer-motion';
import {
  AlertTriangle,
  Brain,
  Bug,
  Clock,
  DollarSign,
  Leaf,
  LineChart,
  Microscope,
  Shield,
  Smartphone,
  Sprout,
  Target,
} from 'lucide-react';

const ImpactCard = ({
  icon: Icon,
  value,
  label,
  trend,
}: {
  icon: any;
  value: string;
  label: string;
  trend: 'up' | 'down';
}) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.9 }}
    animate={{ opacity: 1, scale: 1 }}
    whileHover={{ scale: 1.05 }}
    className="bg-foreground/5 hover:bg-foreground/10 flex items-center gap-4 rounded-xl p-4 transition-colors"
  >
    <div
      className={`${trend === 'up' ? 'bg-red-500/10 text-red-500' : 'bg-amber-500/10 text-amber-500'} rounded-lg p-2`}
    >
      <Icon className="h-6 w-6" />
    </div>
    <div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-foreground/60 text-sm">{label}</p>
    </div>
  </motion.div>
);

const ChallengeCard = ({
  icon: Icon,
  title,
  items,
}: {
  icon: any;
  title: string;
  items: string[];
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="bg-foreground/5 hover:bg-foreground/10 rounded-xl p-6 transition-colors"
  >
    <div className="mb-4 flex items-center gap-3">
      <div className="bg-primary/10 text-primary rounded-lg p-2">
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
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500/10 text-xs text-red-500">
            !
          </div>
          <span className="text-foreground/80">{item}</span>
        </motion.li>
      ))}
    </ul>
  </motion.div>
);

const SolutionCard = ({
  icon: Icon,
  title,
  description,
}: {
  icon: any;
  title: string;
  description: string;
}) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.9 }}
    animate={{ opacity: 1, scale: 1 }}
    whileHover={{ scale: 1.05 }}
    className="bg-foreground/5 hover:bg-foreground/10 flex flex-col items-center gap-3 rounded-xl p-6 text-center transition-colors"
  >
    <div className="rounded-lg bg-emerald-500/10 p-3 text-emerald-500">
      <Icon className="h-6 w-6" />
    </div>
    <h4 className="font-medium">{title}</h4>
    <p className="text-foreground/60 text-sm">{description}</p>
  </motion.div>
);

export const pestImpactSlide = {
  id: 'background-2',
  title: '🐛 Pest Impact Analysis',
  subtitle: 'Economic Losses & Current Challenges',
  content: (
    <div className="space-y-8">
      <div className="grid gap-4 md:grid-cols-4">
        <ImpactCard
          icon={Bug}
          value="30%"
          label="Annual Crop Loss"
          trend="up"
        />
        <ImpactCard
          icon={DollarSign}
          value="$500M+"
          label="Economic Damage"
          trend="up"
        />
        <ImpactCard
          icon={Sprout}
          value="40%"
          label="Income Reduction"
          trend="down"
        />
        <ImpactCard
          icon={LineChart}
          value="60%"
          label="Market Value Loss"
          trend="down"
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <ChallengeCard
          icon={AlertTriangle}
          title="Traditional Method Limitations"
          items={[
            'Manual pest identification process',
            'Significant response delays',
            'Limited access to expertise',
            'High error rates in identification',
          ]}
        />
        <ChallengeCard
          icon={Shield}
          title="Control Challenges"
          items={[
            'Growing pesticide resistance',
            'Environmental impact concerns',
            'Escalating treatment costs',
            'Ineffective prevention methods',
          ]}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <SolutionCard
          icon={Brain}
          title="AI-Powered Detection"
          description="Automated pest identification using deep learning models with 97% accuracy"
        />
        <SolutionCard
          icon={Clock}
          title="Early Warning System"
          description="Real-time monitoring and alerts for immediate pest detection"
        />
        <SolutionCard
          icon={Leaf}
          title="Sustainable Control"
          description="Eco-friendly pest management strategies with reduced pesticide use"
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="bg-foreground/5 rounded-xl p-6"
      >
        <h3 className="mb-6 text-center text-lg font-bold">
          Innovation Roadmap
        </h3>
        <div className="grid gap-6 md:grid-cols-4">
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="rounded-lg bg-blue-500/10 p-2 text-blue-500">
              <Microscope className="h-5 w-5" />
            </div>
            <p className="font-medium">Research</p>
            <p className="text-foreground/60 text-sm">
              Data collection and analysis
            </p>
          </div>
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="rounded-lg bg-purple-500/10 p-2 text-purple-500">
              <Brain className="h-5 w-5" />
            </div>
            <p className="font-medium">Development</p>
            <p className="text-foreground/60 text-sm">AI model training</p>
          </div>
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-500">
              <Smartphone className="h-5 w-5" />
            </div>
            <p className="font-medium">Deployment</p>
            <p className="text-foreground/60 text-sm">Mobile app integration</p>
          </div>
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="rounded-lg bg-amber-500/10 p-2 text-amber-500">
              <Target className="h-5 w-5" />
            </div>
            <p className="font-medium">Impact</p>
            <p className="text-foreground/60 text-sm">
              Sustainable agriculture
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  ),
};
