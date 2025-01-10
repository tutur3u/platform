import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import {
  Award,
  Brain,
  Clock,
  Code2,
  Database,
  FileText,
  Globe,
  Scale,
  Shield,
  Star,
  Target,
  Trophy,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const researchProgress = [
  {
    milestone: 'Data Collection',
    completion: 100,
    impact: 95,
    confidence: 90,
  },
  {
    milestone: 'Feature Analysis',
    completion: 100,
    impact: 92,
    confidence: 88,
  },
  {
    milestone: 'Model Development',
    completion: 100,
    impact: 97,
    confidence: 95,
  },
  {
    milestone: 'Validation',
    completion: 100,
    impact: 94,
    confidence: 92,
  },
];

const AchievementMetric = ({
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

const FindingCard = ({
  icon: Icon,
  color,
  title,
  description,
  findings,
}: {
  icon: any;
  color: string;
  title: string;
  description: string;
  findings: string[];
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="bg-foreground/5 hover:bg-foreground/10 group relative overflow-hidden rounded-xl p-6 transition-colors"
  >
    <div className="absolute right-0 top-0 -translate-y-1/4 translate-x-1/4 opacity-5">
      <Icon className="h-32 w-32" />
    </div>
    <div className="mb-4">
      <div className="mb-2 flex items-center gap-3">
        <div
          className={cn(
            'rounded-lg p-2',
            color.replace('text-', 'bg-') + '/10'
          )}
        >
          <Icon className={cn('h-5 w-5', color)} />
        </div>
        <h4 className="font-medium">{title}</h4>
      </div>
      <p className="text-foreground/60 text-sm">{description}</p>
    </div>
    <ul className="space-y-2">
      {findings.map((item, i) => (
        <motion.li
          key={item}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 + i * 0.1 }}
          className="flex items-center gap-2"
        >
          <Star className="h-3 w-3 text-amber-500" />
          <span className="text-foreground/80 text-sm">{item}</span>
        </motion.li>
      ))}
    </ul>
  </motion.div>
);

const ImpactArea = ({
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

export const conclusionSlide = {
  id: 'conclusion',
  title: '🎯 Conclusion',
  subtitle: 'Key Findings & Future Outlook',
  content: (
    <div className="space-y-8">
      <div className="grid gap-6 md:grid-cols-4">
        <AchievementMetric
          icon={Trophy}
          color="text-blue-500"
          title="Accuracy"
          value="97.2%"
          detail="Classification Rate"
        />
        <AchievementMetric
          icon={Clock}
          color="text-emerald-500"
          title="Processing"
          value="45ms"
          detail="Per Image"
        />
        <AchievementMetric
          icon={Users}
          color="text-amber-500"
          title="Validation"
          value="1,000+"
          detail="Test Cases"
        />
        <AchievementMetric
          icon={Award}
          color="text-violet-500"
          title="Features"
          value="24"
          detail="Key Indicators"
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-foreground/5 rounded-xl p-6"
      >
        <h3 className="mb-4 text-lg font-bold">Research Milestones</h3>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={researchProgress}
              margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="milestone" />
              <YAxis domain={[0, 100]} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                }}
              />
              <Legend />
              <Bar dataKey="completion" name="Completion %" fill="#3b82f6" />
              <Bar dataKey="impact" name="Impact Score" fill="#10b981" />
              <Bar
                dataKey="confidence"
                name="Confidence Level"
                fill="#8b5cf6"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      <div className="grid gap-6 md:grid-cols-2">
        <FindingCard
          icon={Brain}
          color="text-blue-500"
          title="Technical Achievements"
          description="Key technical breakthroughs and innovations"
          findings={[
            'State-of-the-art classification accuracy',
            'Robust feature extraction pipeline',
            'Efficient real-time processing',
            'Scalable system architecture',
          ]}
        />
        <FindingCard
          icon={Globe}
          color="text-emerald-500"
          title="Practical Impact"
          description="Real-world applications and benefits"
          findings={[
            'Early pest detection capability',
            'Reduced crop damage and losses',
            'Optimized resource utilization',
            'Enhanced farming practices',
          ]}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <FindingCard
          icon={Target}
          color="text-amber-500"
          title="Research Contributions"
          description="Novel methodologies and findings"
          findings={[
            'Advanced feature selection approach',
            'Environmental impact analysis',
            'Statistical validation framework',
            'Comprehensive evaluation metrics',
          ]}
        />
        <FindingCard
          icon={Shield}
          color="text-violet-500"
          title="Future Potential"
          description="Opportunities for further development"
          findings={[
            'Cross-crop adaptation potential',
            'Integration with IoT systems',
            'Automated monitoring solutions',
            'Extended geographical coverage',
          ]}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-foreground/5 rounded-xl p-6"
      >
        <h3 className="mb-6 text-lg font-bold">Impact Areas</h3>
        <div className="grid gap-6 md:grid-cols-3">
          <div className="space-y-6">
            <ImpactArea
              icon={Database}
              color="text-blue-500"
              title="Research Community"
              description="Novel methodologies and reproducible framework"
            />
            <ImpactArea
              icon={Users}
              color="text-emerald-500"
              title="Agricultural Sector"
              description="Enhanced pest management and crop protection"
            />
          </div>
          <div className="space-y-6">
            <ImpactArea
              icon={Globe}
              color="text-amber-500"
              title="Environmental"
              description="Sustainable farming practices and reduced chemical usage"
            />
            <ImpactArea
              icon={Scale}
              color="text-violet-500"
              title="Economic"
              description="Improved yield and reduced crop losses"
            />
          </div>
          <div className="space-y-6">
            <ImpactArea
              icon={Code2}
              color="text-purple-500"
              title="Technology"
              description="Advanced AI applications in agriculture"
            />
            <ImpactArea
              icon={FileText}
              color="text-orange-500"
              title="Policy Making"
              description="Evidence-based agricultural policies"
            />
          </div>
        </div>
      </motion.div>
    </div>
  ),
};
