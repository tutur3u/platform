import { motion } from 'framer-motion';
import {
  BarChart3,
  CircleDot,
  CloudSun,
  Flashlight,
  Lightbulb,
  Moon,
  Sparkles,
  Sun,
  SunDim,
  Zap,
} from 'lucide-react';

const LightingMetric = ({
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

const AnalysisFeature = ({
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

export const rq2LightingAnalysisSlide = {
  title: '💡 Lighting Condition Analysis',
  subtitle: 'Impact of Lighting on Feature Extraction',
  content: (
    <div className="space-y-8">
      {/* Key Lighting Metrics */}
      <div className="grid gap-6 md:grid-cols-3">
        <LightingMetric
          icon={Sun}
          title="Natural Light"
          value="4 Conditions"
          description="Direct sunlight, diffused, shade, and overcast scenarios"
        />
        <LightingMetric
          icon={Lightbulb}
          title="Artificial Light"
          value="3 Settings"
          description="LED, fluorescent, and mixed lighting environments"
        />
        <LightingMetric
          icon={Moon}
          title="Low Light"
          value="2 Scenarios"
          description="Dawn/dusk and indoor low-light conditions"
        />
      </div>

      {/* Lighting Analysis Methods */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-foreground/5 rounded-xl p-6"
      >
        <h3 className="mb-6 text-xl font-bold">Analysis Methods</h3>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-6">
            <AnalysisFeature
              icon={CloudSun}
              title="Illumination Measurement"
              description="Lux meter readings and exposure value (EV) calibration"
            />
            <AnalysisFeature
              icon={SunDim}
              title="Light Distribution"
              description="Spatial illumination mapping and shadow analysis"
            />
            <AnalysisFeature
              icon={Flashlight}
              title="Light Direction"
              description="Angular light source positioning and impact assessment"
            />
          </div>
          <div className="space-y-6">
            <AnalysisFeature
              icon={Zap}
              title="Intensity Analysis"
              description="Pixel intensity distribution and histogram equalization"
            />
            <AnalysisFeature
              icon={BarChart3}
              title="Feature Stability"
              description="Cross-condition feature extraction consistency analysis"
            />
            <AnalysisFeature
              icon={Sparkles}
              title="Enhancement Methods"
              description="Adaptive histogram equalization and gamma correction"
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
            <h4 className="mb-2 font-medium">Lighting Analysis Pipeline</h4>
            <pre className="text-foreground/80 overflow-x-auto text-sm">
              {`1. Light measurement and calibration
2. Image acquisition under conditions
3. Illumination normalization
4. Feature extraction and comparison
5. Statistical analysis`}
            </pre>
          </div>
          <div className="bg-foreground/10 rounded-lg p-4">
            <h4 className="mb-2 font-medium">Key Python Libraries</h4>
            <pre className="text-foreground/80 overflow-x-auto text-sm">
              {`import cv2
import numpy as np
from skimage import exposure
from scipy.stats import variation`}
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
            <h4 className="mb-2 font-medium">Feature Robustness</h4>
            <ul className="text-foreground/80 space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                Shape features: 92.3% stability
              </li>
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                Color features: 76.8% stability
              </li>
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                Texture features: 84.5% stability
              </li>
            </ul>
          </div>
          <div className="bg-foreground/10 rounded-lg p-4">
            <h4 className="mb-2 font-medium">Impact Assessment</h4>
            <ul className="text-foreground/80 space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                Natural light: Minimal impact
              </li>
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                Artificial light: Moderate impact
              </li>
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                Low light: Significant impact
              </li>
            </ul>
          </div>
        </div>
      </motion.div>
    </div>
  ),
};
