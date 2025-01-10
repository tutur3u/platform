import { motion } from 'framer-motion';
import {
  Activity,
  BarChart3,
  CircleDot,
  CloudSun,
  Gauge,
  LineChart,
  Microscope,
  Scale,
  Target,
  Thermometer,
} from 'lucide-react';

const ImpactMetric = ({
  icon: Icon,
  title,
  value,
  description,
}: {
  icon: any;
  title: string;
  value: string;
  description: string;
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
    <div className="mb-2">
      <span className="text-2xl font-bold">{value}</span>
    </div>
    <p className="text-foreground/80 text-sm">{description}</p>
  </motion.div>
);

const ConditionAnalysis = ({
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
    className="flex items-start gap-4"
  >
    <div className="bg-foreground/5 text-primary mt-1 rounded-lg p-2">
      <Icon className="h-5 w-5" />
    </div>
    <div>
      <h4 className="font-medium">{title}</h4>
      <p className="text-foreground/60 text-sm">{description}</p>
    </div>
  </motion.div>
);

export const rq2ConditionImpactSlide = {
  title: '🌡️ Environmental Condition Impact',
  subtitle: 'Analysis of Environmental Factors on Feature Extraction',
  content: (
    <div className="space-y-8">
      {/* Key Impact Metrics */}
      <div className="grid gap-6 md:grid-cols-3">
        <ImpactMetric
          icon={Thermometer}
          title="Temperature Range"
          value="20-35°C"
          description="Optimal temperature range for feature stability"
        />
        <ImpactMetric
          icon={CloudSun}
          title="Light Intensity"
          value="500-1000 lux"
          description="Ideal illumination range for accurate detection"
        />
        <ImpactMetric
          icon={Gauge}
          title="Humidity Impact"
          value="±12.4%"
          description="Feature variation due to humidity changes"
        />
      </div>

      {/* Condition Analysis */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-foreground/5 rounded-xl p-6"
      >
        <h3 className="mb-6 text-xl font-bold">Environmental Analysis</h3>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-6">
            <ConditionAnalysis
              icon={Target}
              title="Temperature Effects"
              description="Impact of temperature variations on feature consistency"
            />
            <ConditionAnalysis
              icon={Scale}
              title="Humidity Analysis"
              description="Correlation between humidity levels and feature stability"
            />
            <ConditionAnalysis
              icon={Activity}
              title="Time of Day"
              description="Feature variation patterns across different times"
            />
          </div>
          <div className="space-y-6">
            <ConditionAnalysis
              icon={Microscope}
              title="Seasonal Impact"
              description="Long-term seasonal effects on feature extraction"
            />
            <ConditionAnalysis
              icon={LineChart}
              title="Trend Analysis"
              description="Environmental condition impact trends and patterns"
            />
            <ConditionAnalysis
              icon={BarChart3}
              title="Comparative Study"
              description="Cross-condition performance comparison"
            />
          </div>
        </div>
      </motion.div>

      {/* Implementation Details */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-foreground/5 rounded-xl p-6"
      >
        <h3 className="mb-6 text-xl font-bold">Implementation Highlights</h3>
        <div className="space-y-4">
          <div className="bg-foreground/10 rounded-lg p-4">
            <h4 className="mb-2 font-medium">
              Environmental Analysis Pipeline
            </h4>
            <pre className="text-foreground/80 overflow-x-auto text-sm">
              {`1. Environmental data collection
2. Condition categorization
3. Feature extraction analysis
4. Impact quantification
5. Statistical correlation`}
            </pre>
          </div>
          <div className="bg-foreground/10 rounded-lg p-4">
            <h4 className="mb-2 font-medium">Key Python Libraries</h4>
            <pre className="text-foreground/80 overflow-x-auto text-sm">
              {`import numpy as np
from scipy.stats import pearsonr
from sklearn.preprocessing import StandardScaler
from statsmodels.tsa.seasonal import seasonal_decompose`}
            </pre>
          </div>
        </div>
      </motion.div>

      {/* Key Findings */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-foreground/5 rounded-xl p-6"
      >
        <h3 className="mb-6 text-xl font-bold">Key Findings</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="bg-foreground/10 rounded-lg p-4">
            <h4 className="mb-2 font-medium">Temperature Impact</h4>
            <ul className="text-foreground/80 space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                Optimal range: 20-35°C
              </li>
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                Feature degradation: &gt;35°C
              </li>
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                Low temp impact: &lt;15°C
              </li>
            </ul>
          </div>
          <div className="bg-foreground/10 rounded-lg p-4">
            <h4 className="mb-2 font-medium">Humidity Effects</h4>
            <ul className="text-foreground/80 space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                Optimal range: 40-60%
              </li>
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                High humidity: -15.2% accuracy
              </li>
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                Low humidity: -8.7% accuracy
              </li>
            </ul>
          </div>
        </div>
      </motion.div>
    </div>
  ),
};
