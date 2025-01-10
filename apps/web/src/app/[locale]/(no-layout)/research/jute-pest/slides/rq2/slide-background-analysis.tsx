import { motion } from 'framer-motion';
import {
  BarChart3,
  CircleDot,
  Grid,
  Image,
  Layers,
  LineChart,
  Network,
  Palette,
  Scissors,
  Shapes,
} from 'lucide-react';

const BackgroundMetric = ({
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

export const rq2BackgroundAnalysisSlide = {
  title: '🎯 Background Analysis',
  subtitle: 'Impact of Background Conditions on Feature Extraction',
  content: (
    <div className="space-y-8">
      {/* Key Background Metrics */}
      <div className="grid gap-6 md:grid-cols-3">
        <BackgroundMetric
          icon={Layers}
          title="Background Types"
          value="6 Categories"
          description="Uniform, textured, natural, complex, cluttered, and mixed"
        />
        <BackgroundMetric
          icon={Grid}
          title="Complexity Levels"
          value="4 Scales"
          description="Low, medium, high, and extreme background complexity"
        />
        <BackgroundMetric
          icon={Shapes}
          title="Pattern Types"
          value="5 Classes"
          description="Regular, irregular, organic, geometric, and random"
        />
      </div>

      {/* Analysis Methods */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-foreground/5 rounded-xl p-6"
      >
        <h3 className="mb-6 text-xl font-bold">Analysis Methods</h3>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-6">
            <AnalysisFeature
              icon={Scissors}
              title="Segmentation Analysis"
              description="Advanced background-foreground separation techniques"
            />
            <AnalysisFeature
              icon={Network}
              title="Edge Complexity"
              description="Background edge density and distribution analysis"
            />
            <AnalysisFeature
              icon={Palette}
              title="Color Distribution"
              description="Background color variance and contrast assessment"
            />
          </div>
          <div className="space-y-6">
            <AnalysisFeature
              icon={Image}
              title="Texture Analysis"
              description="Background texture pattern characterization"
            />
            <AnalysisFeature
              icon={LineChart}
              title="Noise Assessment"
              description="Background noise level quantification"
            />
            <AnalysisFeature
              icon={BarChart3}
              title="Feature Impact"
              description="Background influence on feature extraction accuracy"
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
            <h4 className="mb-2 font-medium">Background Analysis Pipeline</h4>
            <pre className="text-foreground/80 overflow-x-auto text-sm">
              {`1. Background characterization
2. Complexity measurement
3. Segmentation analysis
4. Feature extraction impact
5. Statistical evaluation`}
            </pre>
          </div>
          <div className="bg-foreground/10 rounded-lg p-4">
            <h4 className="mb-2 font-medium">Key Python Libraries</h4>
            <pre className="text-foreground/80 overflow-x-auto text-sm">
              {`import cv2
import numpy as np
from skimage.feature import graycomatrix
from scipy.stats import entropy`}
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
            <h4 className="mb-2 font-medium">Complexity Impact</h4>
            <ul className="text-foreground/80 space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                Low complexity: 95.2% accuracy
              </li>
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                Medium complexity: 88.7% accuracy
              </li>
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                High complexity: 82.4% accuracy
              </li>
            </ul>
          </div>
          <div className="bg-foreground/10 rounded-lg p-4">
            <h4 className="mb-2 font-medium">Feature Resilience</h4>
            <ul className="text-foreground/80 space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                Shape features: High resilience
              </li>
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                Color features: Moderate impact
              </li>
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                Texture features: High sensitivity
              </li>
            </ul>
          </div>
        </div>
      </motion.div>
    </div>
  ),
};
