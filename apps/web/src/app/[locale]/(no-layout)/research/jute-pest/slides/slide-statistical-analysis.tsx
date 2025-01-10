import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Brain,
  ChartBar,
  Check,
  Scale,
  TestTube,
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

const featureData = [
  { name: 'Area', fValue: 24.3, pValue: 0.001, significance: 'High' },
  { name: 'Perimeter', fValue: 19.8, pValue: 0.001, significance: 'High' },
  {
    name: 'Major/Minor Axis',
    fValue: 16.5,
    pValue: 0.001,
    significance: 'High',
  },
  { name: 'Aspect Ratio', fValue: 21.2, pValue: 0.001, significance: 'High' },
  { name: 'Circularity', fValue: 18.7, pValue: 0.001, significance: 'High' },
  { name: 'Solidity', fValue: 15.9, pValue: 0.001, significance: 'High' },
];

const speciesPairData = [
  { name: 'Size Features', distinctPairs: 89, totalPairs: 100 },
  { name: 'Shape Features', distinctPairs: 94, totalPairs: 100 },
  { name: 'Color Features', distinctPairs: 87, totalPairs: 100 },
];

const AnalysisStep = ({
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
      <h4 className="font-medium">{title}</h4>
      <p className="text-foreground/60 text-sm">{description}</p>
    </div>
  </motion.div>
);

export const statisticalAnalysisSlide = {
  id: 'statistical-analysis',
  title: '📊 Statistical Analysis of Morphological Features',
  subtitle: 'ANOVA & Post-hoc Analysis Results',
  content: (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-foreground/5 rounded-xl p-6"
      >
        <h3 className="mb-6 text-center text-xl font-bold">
          Analysis Pipeline
        </h3>
        <div className="flex items-center justify-center gap-4">
          <AnalysisStep
            icon={TestTube}
            color="text-blue-500"
            title="Feature Selection"
            description="Key morphological features"
          />
          <ArrowRight className="text-foreground/40 h-4 w-4" />
          <AnalysisStep
            icon={ChartBar}
            color="text-purple-500"
            title="ANOVA Testing"
            description="Statistical significance"
          />
          <ArrowRight className="text-foreground/40 h-4 w-4" />
          <AnalysisStep
            icon={Scale}
            color="text-emerald-500"
            title="Post-hoc Analysis"
            description="Pairwise comparisons"
          />
          <ArrowRight className="text-foreground/40 h-4 w-4" />
          <AnalysisStep
            icon={Brain}
            color="text-orange-500"
            title="Interpretation"
            description="Biological implications"
          />
        </div>
      </motion.div>

      <div className="grid gap-6 md:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-foreground/5 rounded-xl p-6"
        >
          <h3 className="mb-4 text-lg font-bold">ANOVA Results by Feature</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={featureData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis type="number" domain={[0, 30]} />
                <YAxis dataKey="name" type="category" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                  }}
                />
                <Legend />
                <Bar
                  dataKey="fValue"
                  name="F-Value"
                  fill="hsl(var(--primary))"
                  radius={[0, 4, 4, 0]}
                />
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
          <h3 className="mb-4 text-lg font-bold">Species Pair Distinction</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={speciesPairData}>
                <defs>
                  <linearGradient
                    id="distinctPairs"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor="hsl(var(--primary))"
                      stopOpacity={0.8}
                    />
                    <stop
                      offset="95%"
                      stopColor="hsl(var(--primary))"
                      stopOpacity={0.2}
                    />
                  </linearGradient>
                </defs>
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
                <Area
                  type="monotone"
                  dataKey="distinctPairs"
                  name="Distinct Pairs %"
                  stroke="hsl(var(--primary))"
                  fillOpacity={1}
                  fill="url(#distinctPairs)"
                />
              </AreaChart>
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
        <h3 className="mb-4 text-lg font-bold">
          Biological Implications & Limitations
        </h3>
        <div className="grid gap-6 md:grid-cols-3">
          <div className="space-y-2">
            <h4 className="font-medium">Biological Significance</h4>
            <ul className="space-y-1 text-sm">
              <li className="flex items-center gap-2">
                <Check className="h-3 w-3 text-emerald-500" />
                <span>Morphological adaptations reflect feeding habits</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-3 w-3 text-emerald-500" />
                <span>Size variations linked to life cycle stages</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-3 w-3 text-emerald-500" />
                <span>Shape features indicate ecological niches</span>
              </li>
            </ul>
          </div>
          <div className="space-y-2">
            <h4 className="font-medium">Analysis Limitations</h4>
            <ul className="space-y-1 text-sm">
              <li className="flex items-center gap-2">
                <Check className="h-3 w-3 text-emerald-500" />
                <span>Environmental condition variations</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-3 w-3 text-emerald-500" />
                <span>Life stage representation bias</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-3 w-3 text-emerald-500" />
                <span>Sample size variations per species</span>
              </li>
            </ul>
          </div>
          <div className="space-y-2">
            <h4 className="font-medium">Practical Applications</h4>
            <ul className="space-y-1 text-sm">
              <li className="flex items-center gap-2">
                <Check className="h-3 w-3 text-emerald-500" />
                <span>Automated species identification</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-3 w-3 text-emerald-500" />
                <span>Early pest detection systems</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-3 w-3 text-emerald-500" />
                <span>Population monitoring tools</span>
              </li>
            </ul>
          </div>
        </div>
      </motion.div>
    </div>
  ),
};
