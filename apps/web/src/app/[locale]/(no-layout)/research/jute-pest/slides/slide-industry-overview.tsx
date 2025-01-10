import { motion } from 'framer-motion';
import {
  DollarSign,
  Factory,
  Leaf,
  LineChart,
  Recycle,
  Sprout,
  TreePine,
  Waves,
} from 'lucide-react';

const StatCard = ({
  icon: Icon,
  value,
  label,
}: {
  icon: any;
  value: string;
  label: string;
}) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.9 }}
    animate={{ opacity: 1, scale: 1 }}
    whileHover={{ scale: 1.05 }}
    className="bg-foreground/5 hover:bg-foreground/10 flex items-center gap-4 rounded-xl p-4 transition-colors"
  >
    <div className="bg-primary/10 text-primary rounded-lg p-2">
      <Icon className="h-6 w-6" />
    </div>
    <div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-foreground/60 text-sm">{label}</p>
    </div>
  </motion.div>
);

const FeatureCard = ({
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
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/10 text-xs text-emerald-500">
            ✓
          </div>
          <span className="text-foreground/80">{item}</span>
        </motion.li>
      ))}
    </ul>
  </motion.div>
);

export const industryOverviewSlide = {
  id: 'background-1',
  title: '🌱 Jute Industry Overview',
  subtitle: 'Economic Significance & Environmental Impact',
  content: (
    <div className="space-y-8">
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          icon={DollarSign}
          value="$1.5B"
          label="Annual Export Earnings"
        />
        <StatCard icon={Factory} value="40%" label="Global Jute Production" />
        <StatCard icon={Sprout} value="3M+" label="Dependent Farmers" />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="space-y-6"
        >
          <FeatureCard
            icon={LineChart}
            title="Economic Impact"
            items={[
              '$3.5B global market size',
              '8.5% annual growth rate',
              'Rising global demand',
              'Technical textile growth',
              'Green packaging demand',
            ]}
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="space-y-6"
        >
          <FeatureCard
            icon={Leaf}
            title="Environmental Benefits"
            items={[
              '11.5 tons CO2/hectare absorption',
              'Natural carbon sequestration',
              '100% biodegradable fiber',
              'Minimal water consumption',
              'Soil health improvement',
            ]}
          />
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="grid gap-6 md:grid-cols-3"
      >
        <FeatureCard
          icon={Recycle}
          title="Sustainability"
          items={[
            'Eco-friendly alternatives',
            'Renewable resource',
            'Low carbon footprint',
          ]}
        />
        <FeatureCard
          icon={TreePine}
          title="Market Growth"
          items={[
            'Plastic alternative market',
            'Growing sustainable markets',
            'Increasing adoption',
          ]}
        />
        <FeatureCard
          icon={Waves}
          title="Innovation Areas"
          items={[
            'Smart agriculture',
            'Pest management',
            'Quality improvement',
          ]}
        />
      </motion.div>
    </div>
  ),
};
