import { motion } from 'framer-motion';
import { BarChart3, Camera, Microscope, Ruler } from 'lucide-react';

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

const AnalysisCard = ({
  icon: Icon,
  title,
  description,
  metrics,
  color = 'text-primary',
  bgColor = 'bg-primary/10',
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  metrics: { label: string; value: string }[];
  color?: string;
  bgColor?: string;
}) => (
  <motion.div
    variants={item}
    className="bg-foreground/5 hover:bg-foreground/10 rounded-xl p-6 transition-colors"
  >
    <div className="mb-4 flex items-center gap-3">
      <div className={`${bgColor} ${color} rounded-lg p-2`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <h4 className="font-medium">{title}</h4>
        <p className="text-foreground/60 text-sm">{description}</p>
      </div>
    </div>
    <div className="space-y-3">
      {metrics.map((metric) => (
        <div key={metric.label} className="flex items-center justify-between">
          <span className="text-foreground/60 text-sm">{metric.label}</span>
          <span className="font-medium">{metric.value}</span>
        </div>
      ))}
    </div>
  </motion.div>
);

export const rq4DeploymentSlide = {
  title: 'RQ4: Morphological Analysis',
  subtitle: 'Quantitative Feature Comparison',
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
        Comprehensive analysis of morphological characteristics reveals
        significant and measurable differences between pest species.
      </motion.div>

      <div className="grid gap-6 md:grid-cols-2">
        <AnalysisCard
          icon={Camera}
          title="Image Quality Metrics"
          description="Analysis of image capture and preprocessing results"
          metrics={[
            { label: 'Image Resolution', value: '4K (3840×2160)' },
            { label: 'Segmentation Accuracy', value: '98.5%' },
            { label: 'Noise Reduction', value: '-45dB' },
            { label: 'Contrast Enhancement', value: '+35%' },
          ]}
          color="text-blue-500"
          bgColor="bg-blue-500/10"
        />

        <AnalysisCard
          icon={Ruler}
          title="Physical Measurements"
          description="Standardized morphometric measurements"
          metrics={[
            { label: 'Length Range', value: '2.5-15mm' },
            { label: 'Width/Length Ratio', value: '0.35-0.45' },
            { label: 'Segment Count', value: '10-14' },
            { label: 'Surface Area', value: '15-75mm²' },
          ]}
          color="text-purple-500"
          bgColor="bg-purple-500/10"
        />

        <AnalysisCard
          icon={Microscope}
          title="Feature Analysis"
          description="Detailed examination of distinguishing features"
          metrics={[
            { label: 'Color Patterns', value: '6 types' },
            { label: 'Texture Classes', value: '4 distinct' },
            { label: 'Shape Descriptors', value: '8 primary' },
            { label: 'Feature Density', value: '65-120/mm²' },
          ]}
          color="text-emerald-500"
          bgColor="bg-emerald-500/10"
        />

        <AnalysisCard
          icon={BarChart3}
          title="Statistical Measures"
          description="Quantitative analysis of feature significance"
          metrics={[
            { label: 'ANOVA p-value', value: '< 0.001' },
            { label: 'Effect Size (η²)', value: '0.82' },
            { label: 'F-statistic', value: '24.6' },
            { label: 'Classification Power', value: '92%' },
          ]}
          color="text-amber-500"
          bgColor="bg-amber-500/10"
        />
      </div>
    </motion.div>
  ),
};
