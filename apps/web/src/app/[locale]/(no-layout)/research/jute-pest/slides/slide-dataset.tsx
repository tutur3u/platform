import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Camera,
  Database,
  FileImage,
  Filter,
  Image as ImageIcon,
  LineChart,
  Repeat,
  RotateCw,
  Sparkles,
} from 'lucide-react';

const datasetMetrics = [
  {
    icon: <Database className="h-8 w-8" />,
    value: '7,235',
    label: 'Total Images',
    detail: 'High-quality pest specimens',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  {
    icon: <FileImage className="h-8 w-8" />,
    value: '17',
    label: 'Pest Classes',
    detail: 'Distinct species categories',
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10',
  },
  {
    icon: <LineChart className="h-8 w-8" />,
    value: '70/15/15',
    label: 'Data Split',
    detail: 'Train/Val/Test ratio',
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
  },
  {
    icon: <Camera className="h-8 w-8" />,
    value: '224×224',
    label: 'Image Size',
    detail: 'Standardized resolution',
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
  },
];

const ProcessStep = ({
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
    className="flex items-center gap-4"
  >
    <div className="bg-primary/10 text-primary flex h-12 w-12 shrink-0 items-center justify-center rounded-xl">
      <Icon className="h-6 w-6" />
    </div>
    <div>
      <h4 className="font-medium">{title}</h4>
      <p className="text-foreground/60 text-sm">{description}</p>
    </div>
  </motion.div>
);

const AugmentationCard = ({
  icon: Icon,
  title,
  items,
}: {
  icon: any;
  title: string;
  items: string[];
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

export const datasetSlide = {
  id: 'dataset',
  title: '📊 Dataset Characteristics',
  subtitle: 'Dataset and Methodology',
  content: (
    <div className="space-y-8">
      <div className="grid gap-6 md:grid-cols-4">
        {datasetMetrics.map((metric, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.05 }}
            transition={{ delay: i * 0.1 }}
            className="bg-foreground/5 hover:bg-foreground/10 group relative overflow-hidden rounded-xl p-6 transition-colors"
          >
            <div className="flex flex-col items-center gap-2 text-center">
              <div
                className={cn(
                  'mb-2 rounded-lg p-3',
                  metric.bgColor,
                  metric.color
                )}
              >
                {metric.icon}
              </div>
              <div className="text-3xl font-bold">{metric.value}</div>
              <div className="font-medium">{metric.label}</div>
              <div className="text-foreground/60 text-sm">{metric.detail}</div>
            </div>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-foreground/5 rounded-xl p-6"
      >
        <h3 className="mb-6 text-center text-xl font-bold">
          Data Processing Pipeline
        </h3>
        <div className="flex flex-col gap-8">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-6">
              <ProcessStep
                icon={Database}
                title="Collection & Validation"
                description="UCI-validated dataset with expert annotations and balanced class distribution"
              />
              <ProcessStep
                icon={Filter}
                title="Quality Control"
                description="Multiple environmental conditions captured with strict validation protocols"
              />
            </div>
            <div className="space-y-6">
              <ProcessStep
                icon={ImageIcon}
                title="Standardization"
                description="Image resizing to 224×224 with RGB format conversion"
              />
              <ProcessStep
                icon={Sparkles}
                title="Enhancement"
                description="Noise reduction and image quality enhancement techniques"
              />
            </div>
          </div>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.6 }}
            className="flex items-center justify-center"
          >
            <div className="flex items-center gap-3 text-sm">
              <span className="text-foreground/60">Raw Data</span>
              <ArrowRight className="h-4 w-4" />
              <span className="text-blue-500">Collection</span>
              <ArrowRight className="h-4 w-4" />
              <span className="text-purple-500">Validation</span>
              <ArrowRight className="h-4 w-4" />
              <span className="text-emerald-500">Processing</span>
              <ArrowRight className="h-4 w-4" />
              <span className="text-orange-500">Final Dataset</span>
            </div>
          </motion.div>
        </div>
      </motion.div>

      <div className="grid gap-6 md:grid-cols-3">
        <AugmentationCard
          icon={RotateCw}
          title="Geometric Transforms"
          items={[
            'Random rotations (±30°)',
            'Horizontal/vertical flips',
            'Random shifts (±10%)',
          ]}
        />
        <AugmentationCard
          icon={Sparkles}
          title="Intensity Adjustments"
          items={[
            'Brightness variation (±20%)',
            'Contrast adjustments',
            'Random noise addition',
          ]}
        />
        <AugmentationCard
          icon={Repeat}
          title="Scale Variations"
          items={[
            'Random zooms (±15%)',
            'Scale adjustments',
            'Aspect ratio changes',
          ]}
        />
      </div>
    </div>
  ),
};
