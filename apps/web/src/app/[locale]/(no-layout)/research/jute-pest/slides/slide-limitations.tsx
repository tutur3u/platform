import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Brain,
  Cloud,
  Code2,
  Database,
  Globe,
  Network,
  Settings,
  Shield,
  Target,
  Variable,
  XCircle,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const limitationMetrics = [
  {
    category: 'Data',
    severity: 75,
    impact: 85,
    mitigation: 65,
  },
  {
    category: 'Model',
    severity: 65,
    impact: 70,
    mitigation: 80,
  },
  {
    category: 'Environment',
    severity: 80,
    impact: 75,
    mitigation: 60,
  },
  {
    category: 'Technical',
    severity: 60,
    impact: 65,
    mitigation: 85,
  },
];

const improvementPlan = [
  {
    quarter: 'Q1 2024',
    data: 30,
    model: 25,
    tech: 20,
  },
  {
    quarter: 'Q2 2024',
    data: 50,
    model: 45,
    tech: 40,
  },
  {
    quarter: 'Q3 2024',
    data: 75,
    model: 70,
    tech: 65,
  },
  {
    quarter: 'Q4 2024',
    data: 90,
    model: 85,
    tech: 80,
  },
];

const LimitationCard = ({
  icon: Icon,
  color,
  title,
  description,
  limitations,
  solutions,
}: {
  icon: any;
  color: string;
  title: string;
  description: string;
  limitations: string[];
  solutions: string[];
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
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <h5 className="mb-2 text-sm font-medium">Current Limitations:</h5>
        <ul className="space-y-2">
          {limitations.map((item, i) => (
            <motion.li
              key={item}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 + i * 0.1 }}
              className="flex items-center gap-2"
            >
              <XCircle className="h-3 w-3 text-red-500" />
              <span className="text-foreground/80 text-sm">{item}</span>
            </motion.li>
          ))}
        </ul>
      </div>
      <div>
        <h5 className="mb-2 text-sm font-medium">Proposed Solutions:</h5>
        <ul className="space-y-2">
          {solutions.map((item, i) => (
            <motion.li
              key={item}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 + i * 0.1 }}
              className="flex items-center gap-2"
            >
              <ArrowRight className="h-3 w-3 text-emerald-500" />
              <span className="text-foreground/80 text-sm">{item}</span>
            </motion.li>
          ))}
        </ul>
      </div>
    </div>
  </motion.div>
);

const FutureWork = ({
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

export const limitationsSlide = {
  id: 'limitations',
  title: '⚠️ Limitations & Future Work',
  subtitle: 'Current Challenges & Improvement Plans',
  content: (
    <div className="space-y-8">
      <div className="grid gap-6 md:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-foreground/5 rounded-xl p-6"
        >
          <h3 className="mb-4 text-lg font-bold">Limitation Analysis</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={limitationMetrics}
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="category" />
                <YAxis domain={[0, 100]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                  }}
                />
                <Legend />
                <Bar dataKey="severity" name="Severity" fill="#ef4444" />
                <Bar dataKey="impact" name="Impact" fill="#f59e0b" />
                <Bar dataKey="mitigation" name="Mitigation" fill="#10b981" />
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
          <h3 className="mb-4 text-lg font-bold">Improvement Timeline</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={improvementPlan}
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="quarter" />
                <YAxis domain={[0, 100]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                  }}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="data"
                  name="Data Quality"
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  fillOpacity={0.3}
                />
                <Area
                  type="monotone"
                  dataKey="model"
                  name="Model Performance"
                  stroke="#10b981"
                  fill="#10b981"
                  fillOpacity={0.3}
                />
                <Area
                  type="monotone"
                  dataKey="tech"
                  name="Technical Infrastructure"
                  stroke="#8b5cf6"
                  fill="#8b5cf6"
                  fillOpacity={0.3}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <LimitationCard
          icon={Database}
          color="text-blue-500"
          title="Data Limitations"
          description="Current challenges in data collection and quality"
          limitations={[
            'Limited sample diversity',
            'Imbalanced class distribution',
            'Annotation inconsistencies',
            'Environmental bias',
          ]}
          solutions={[
            'Expand data collection scope',
            'Implement data augmentation',
            'Standardize annotation process',
            'Diverse environment sampling',
          ]}
        />
        <LimitationCard
          icon={Brain}
          color="text-purple-500"
          title="Model Limitations"
          description="Constraints in current model architecture"
          limitations={[
            'Computational complexity',
            'Feature interpretation',
            'Generalization issues',
            'Real-time performance',
          ]}
          solutions={[
            'Model optimization',
            'Explainable AI integration',
            'Transfer learning',
            'Hardware acceleration',
          ]}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <LimitationCard
          icon={Globe}
          color="text-emerald-500"
          title="Environmental Factors"
          description="Challenges related to environmental conditions"
          limitations={[
            'Lighting variations',
            'Background complexity',
            'Weather conditions',
            'Seasonal changes',
          ]}
          solutions={[
            'Robust preprocessing',
            'Background segmentation',
            'Weather-invariant features',
            'Seasonal calibration',
          ]}
        />
        <LimitationCard
          icon={Settings}
          color="text-orange-500"
          title="Technical Constraints"
          description="Infrastructure and deployment challenges"
          limitations={[
            'Resource requirements',
            'Deployment complexity',
            'Integration issues',
            'Maintenance overhead',
          ]}
          solutions={[
            'Resource optimization',
            'Containerized deployment',
            'API standardization',
            'Automated maintenance',
          ]}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-foreground/5 rounded-xl p-6"
      >
        <h3 className="mb-6 text-lg font-bold">Future Research Directions</h3>
        <div className="grid gap-6 md:grid-cols-3">
          <div className="space-y-6">
            <FutureWork
              icon={Network}
              color="text-blue-500"
              title="Advanced Architecture"
              description="Explore novel deep learning architectures and ensemble methods"
            />
            <FutureWork
              icon={Variable}
              color="text-emerald-500"
              title="Feature Engineering"
              description="Investigate advanced feature extraction techniques"
            />
          </div>
          <div className="space-y-6">
            <FutureWork
              icon={Cloud}
              color="text-purple-500"
              title="Cloud Integration"
              description="Develop cloud-based processing and storage solutions"
            />
            <FutureWork
              icon={Target}
              color="text-orange-500"
              title="Cross-validation"
              description="Expand validation across different regions and conditions"
            />
          </div>
          <div className="space-y-6">
            <FutureWork
              icon={Shield}
              color="text-amber-500"
              title="Robustness"
              description="Enhance model resilience to environmental variations"
            />
            <FutureWork
              icon={Code2}
              color="text-violet-500"
              title="Automation"
              description="Implement automated monitoring and updating systems"
            />
          </div>
        </div>
      </motion.div>
    </div>
  ),
};
