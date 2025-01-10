import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import {
  Activity,
  Check,
  Code2,
  Factory,
  Globe,
  Laptop,
  Shield,
  Target,
  TrendingUp,
  Users,
  Users2,
  Wallet,
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

const economicImpact = [
  {
    year: 2024,
    savings: 25,
    efficiency: 30,
    adoption: 20,
  },
  {
    year: 2025,
    savings: 45,
    efficiency: 55,
    adoption: 40,
  },
  {
    year: 2026,
    savings: 70,
    efficiency: 75,
    adoption: 65,
  },
  {
    year: 2027,
    savings: 85,
    efficiency: 90,
    adoption: 85,
  },
];

const stakeholderBenefits = [
  {
    group: 'Farmers',
    productivity: 85,
    cost: 75,
    sustainability: 90,
  },
  {
    group: 'Researchers',
    productivity: 95,
    cost: 85,
    sustainability: 80,
  },
  {
    group: 'Industry',
    productivity: 80,
    cost: 90,
    sustainability: 85,
  },
  {
    group: 'Government',
    productivity: 75,
    cost: 80,
    sustainability: 95,
  },
];

const ImpactMetric = ({
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

const BenefitCard = ({
  icon: Icon,
  color,
  title,
  description,
  items,
}: {
  icon: any;
  color: string;
  title: string;
  description: string;
  items: string[];
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
      {items.map((item, i) => (
        <motion.li
          key={item}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 + i * 0.1 }}
          className="flex items-center gap-2"
        >
          <Check className="h-4 w-4 text-emerald-500" />
          <span className="text-foreground/80 text-sm">{item}</span>
        </motion.li>
      ))}
    </ul>
  </motion.div>
);

export const practicalImplicationsSlide = {
  id: 'practical-implications',
  title: '💡 Practical Implications',
  subtitle: 'Real-world Impact & Applications',
  content: (
    <div className="space-y-8">
      <div className="grid gap-6 md:grid-cols-4">
        <ImpactMetric
          icon={TrendingUp}
          color="text-blue-500"
          title="Yield Increase"
          value="+35%"
          detail="Expected Growth"
        />
        <ImpactMetric
          icon={Shield}
          color="text-emerald-500"
          title="Loss Prevention"
          value="-45%"
          detail="Pest Damage"
        />
        <ImpactMetric
          icon={Wallet}
          color="text-amber-500"
          title="Cost Savings"
          value="$2.5M"
          detail="Per Season"
        />
        <ImpactMetric
          icon={Users}
          color="text-violet-500"
          title="Adoption"
          value="85%"
          detail="Target Rate"
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-foreground/5 rounded-xl p-6"
        >
          <h3 className="mb-4 text-lg font-bold">Economic Impact Projection</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={economicImpact}
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="year" />
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
                  dataKey="savings"
                  name="Cost Savings %"
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  fillOpacity={0.3}
                />
                <Area
                  type="monotone"
                  dataKey="efficiency"
                  name="Efficiency %"
                  stroke="#10b981"
                  fill="#10b981"
                  fillOpacity={0.3}
                />
                <Area
                  type="monotone"
                  dataKey="adoption"
                  name="Adoption Rate %"
                  stroke="#8b5cf6"
                  fill="#8b5cf6"
                  fillOpacity={0.3}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-foreground/5 rounded-xl p-6"
        >
          <h3 className="mb-4 text-lg font-bold">Stakeholder Benefits</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={stakeholderBenefits}
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="group" />
                <YAxis domain={[0, 100]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                  }}
                />
                <Legend />
                <Bar
                  dataKey="productivity"
                  name="Productivity"
                  fill="#3b82f6"
                />
                <Bar dataKey="cost" name="Cost Benefit" fill="#10b981" />
                <Bar
                  dataKey="sustainability"
                  name="Sustainability"
                  fill="#8b5cf6"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <BenefitCard
          icon={Factory}
          color="text-blue-500"
          title="Industry Applications"
          description="Transforming agricultural practices with AI-powered solutions"
          items={[
            'Automated pest monitoring systems',
            'Early warning detection',
            'Integrated pest management',
            'Yield optimization tools',
          ]}
        />
        <BenefitCard
          icon={Globe}
          color="text-emerald-500"
          title="Environmental Impact"
          description="Promoting sustainable and eco-friendly farming practices"
          items={[
            'Reduced pesticide usage',
            'Targeted treatment approach',
            'Biodiversity preservation',
            'Resource optimization',
          ]}
        />
        <BenefitCard
          icon={Users2}
          color="text-violet-500"
          title="Social Benefits"
          description="Empowering farmers and agricultural communities"
          items={[
            'Knowledge transfer',
            'Skill development',
            'Community engagement',
            'Economic empowerment',
          ]}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-foreground/5 rounded-xl p-6"
      >
        <h3 className="mb-6 text-lg font-bold">Implementation Roadmap</h3>
        <div className="grid gap-6 md:grid-cols-4">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-500/10 p-2 text-blue-500">
                <Activity className="h-5 w-5" />
              </div>
              <h4 className="font-medium">Phase 1: Research</h4>
            </div>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <Check className="h-3 w-3 text-emerald-500" />
                <span>Data collection</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-3 w-3 text-emerald-500" />
                <span>Feature analysis</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-3 w-3 text-emerald-500" />
                <span>Model development</span>
              </li>
            </ul>
          </div>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-500">
                <Code2 className="h-5 w-5" />
              </div>
              <h4 className="font-medium">Phase 2: Development</h4>
            </div>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <Check className="h-3 w-3 text-emerald-500" />
                <span>System architecture</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-3 w-3 text-emerald-500" />
                <span>API integration</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-3 w-3 text-emerald-500" />
                <span>UI/UX design</span>
              </li>
            </ul>
          </div>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-amber-500/10 p-2 text-amber-500">
                <Target className="h-5 w-5" />
              </div>
              <h4 className="font-medium">Phase 3: Testing</h4>
            </div>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <Check className="h-3 w-3 text-emerald-500" />
                <span>Field trials</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-3 w-3 text-emerald-500" />
                <span>Performance validation</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-3 w-3 text-emerald-500" />
                <span>User feedback</span>
              </li>
            </ul>
          </div>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-violet-500/10 p-2 text-violet-500">
                <Laptop className="h-5 w-5" />
              </div>
              <h4 className="font-medium">Phase 4: Deployment</h4>
            </div>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <Check className="h-3 w-3 text-emerald-500" />
                <span>System rollout</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-3 w-3 text-emerald-500" />
                <span>Training programs</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-3 w-3 text-emerald-500" />
                <span>Support system</span>
              </li>
            </ul>
          </div>
        </div>
      </motion.div>
    </div>
  ),
};
