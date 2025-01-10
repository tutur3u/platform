import { motion } from 'framer-motion';
import {
  BarChart3,
  CircleDot,
  Eye,
  Grid,
  Palette,
  PieChart,
  Pipette,
  Sparkles,
  SplitSquareHorizontal,
} from 'lucide-react';

const ColorMetric = ({
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

export const rq1ColorAnalysisSlide = {
  title: '🎨 Color Analysis Deep Dive',
  subtitle: 'Advanced Color Feature Extraction & Analysis',
  content: (
    <div className="space-y-8">
      {/* Key Color Metrics */}
      <div className="grid gap-6 md:grid-cols-3">
        <ColorMetric
          icon={Palette}
          title="Color Spaces"
          value="RGB, HSV, LAB"
          description="Multi-space color analysis for comprehensive feature extraction"
        />
        <ColorMetric
          icon={BarChart3}
          title="Color Channels"
          value="9 Features"
          description="Statistical moments from each channel across color spaces"
        />
        <ColorMetric
          icon={PieChart}
          title="Dominant Colors"
          value="5 per specimen"
          description="K-means clustering for dominant color extraction"
        />
      </div>

      {/* Color Analysis Techniques */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-foreground/5 rounded-xl p-6"
      >
        <h3 className="mb-6 text-xl font-bold">Analysis Techniques</h3>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-6">
            <AnalysisFeature
              icon={Eye}
              title="Color Histogram Analysis"
              description="256-bin histograms for each channel with statistical moment extraction"
            />
            <AnalysisFeature
              icon={Grid}
              title="Color Distribution"
              description="Spatial color distribution analysis using grid-based segmentation"
            />
            <AnalysisFeature
              icon={Pipette}
              title="Color Sampling"
              description="Adaptive color sampling with noise reduction techniques"
            />
          </div>
          <div className="space-y-6">
            <AnalysisFeature
              icon={SplitSquareHorizontal}
              title="Color Space Conversion"
              description="Lossless conversion between RGB, HSV, and LAB color spaces"
            />
            <AnalysisFeature
              icon={CircleDot}
              title="Center-Surround Analysis"
              description="Comparative analysis of central and peripheral color features"
            />
            <AnalysisFeature
              icon={Sparkles}
              title="Feature Enhancement"
              description="Contrast enhancement and color normalization techniques"
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
            <h4 className="mb-2 font-medium">Color Analysis Pipeline</h4>
            <pre className="text-foreground/80 overflow-x-auto text-sm">
              {`1. Color space conversion
2. Histogram computation
3. Statistical moment extraction
4. Dominant color clustering
5. Feature vector generation`}
            </pre>
          </div>
          <div className="bg-foreground/10 rounded-lg p-4">
            <h4 className="mb-2 font-medium">Key Python Libraries</h4>
            <pre className="text-foreground/80 overflow-x-auto text-sm">
              {`import cv2
import numpy as np
from sklearn.cluster import KMeans
from scipy.stats import moment`}
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
            <h4 className="mb-2 font-medium">Color Distribution</h4>
            <p className="text-foreground/80 text-sm">
              HSV color space showed highest discriminative power with 85.2%
              feature importance score
            </p>
          </div>
          <div className="bg-foreground/10 rounded-lg p-4">
            <h4 className="mb-2 font-medium">Species Differentiation</h4>
            <p className="text-foreground/80 text-sm">
              Dominant colors in LAB space achieved 82.3% accuracy in species
              classification
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  ),
};
