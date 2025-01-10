import { motion } from 'framer-motion';
import {
  BarChart3,
  DollarSign,
  Factory,
  Leaf,
  LineChart,
  Sprout,
  TreePine,
} from 'lucide-react';

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const item = {
  hidden: { y: 20, opacity: 0 },
  show: { y: 0, opacity: 1 },
};

const listItem = {
  hidden: { opacity: 0, x: -20 },
  show: { opacity: 1, x: 0 },
};

interface StatCardProps {
  icon: React.ElementType;
  title: string;
  value: string;
  subtitle: string;
}

const StatCard = ({ icon: Icon, title, value, subtitle }: StatCardProps) => (
  <motion.div
    variants={item}
    className="bg-foreground/5 hover:bg-foreground/10 flex flex-col gap-4 rounded-xl p-6 transition-colors"
  >
    <div className="bg-primary/10 text-primary w-fit rounded-lg p-2">
      <Icon className="h-6 w-6" />
    </div>
    <div className="space-y-1">
      <h3 className="text-foreground/60 text-sm">{title}</h3>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-foreground/60 text-sm">{subtitle}</p>
    </div>
  </motion.div>
);

const FeatureCard = ({
  icon: Icon,
  title,
  items,
}: {
  icon: React.ElementType;
  title: string;
  items: string[];
}) => (
  <motion.div
    variants={item}
    className="bg-foreground/5 hover:bg-foreground/10 rounded-xl p-6 transition-colors"
  >
    <div className="mb-4 flex items-center gap-3">
      <div className="bg-primary/10 text-primary rounded-lg p-2">
        <Icon className="h-5 w-5" />
      </div>
      <h4 className="font-medium">{title}</h4>
    </div>
    <ul className="space-y-2">
      {items.map((text) => (
        <motion.li
          key={text}
          variants={listItem}
          className="flex items-center gap-2"
        >
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/10 text-xs text-emerald-500">
            ✓
          </div>
          <span className="text-foreground/80">{text}</span>
        </motion.li>
      ))}
    </ul>
  </motion.div>
);

export const industryOverviewSlide = {
  title: '🌱 Jute Industry Overview',
  subtitle: 'Economic Significance & Environmental Impact',
  content: (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-8"
    >
      <motion.div
        variants={item}
        className="text-foreground/80 text-center text-lg"
      >
        Jute, often called the "golden fiber," plays a crucial role in the
        global textile and packaging industries, particularly in South and
        Southeast Asian economies.
      </motion.div>

      <motion.div
        variants={container}
        className="grid grid-cols-1 gap-4 md:grid-cols-4"
      >
        <StatCard
          icon={DollarSign}
          title="Market Value"
          value="$2.7B"
          subtitle="Global market size (2023)"
        />
        <StatCard
          icon={Factory}
          title="Production"
          value="3.3M"
          subtitle="Annual tonnes produced"
        />
        <StatCard
          icon={Sprout}
          title="Employment"
          value="4M+"
          subtitle="Direct & indirect jobs"
        />
        <StatCard
          icon={BarChart3}
          title="Growth Rate"
          value="4.8%"
          subtitle="Expected CAGR (2024-2030)"
        />
      </motion.div>

      <div className="grid gap-6 md:grid-cols-2">
        <motion.div variants={item}>
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

        <motion.div variants={item}>
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

      <motion.div variants={item} className="grid gap-6 md:grid-cols-2">
        <div className="bg-foreground/5 space-y-4 rounded-xl p-6">
          <h3 className="text-xl font-semibold">Key Markets</h3>
          <ul className="text-foreground/80 space-y-2">
            <li>• Bangladesh (World's largest producer)</li>
            <li>• India (Leading exporter)</li>
            <li>• China (Major consumer)</li>
            <li>• Southeast Asian countries</li>
          </ul>
        </div>

        <FeatureCard
          icon={TreePine}
          title="Sustainability Goals"
          items={[
            'Eco-friendly alternatives',
            'Renewable resource utilization',
            'Carbon footprint reduction',
            'Sustainable farming practices',
          ]}
        />
      </motion.div>
    </motion.div>
  ),
};
