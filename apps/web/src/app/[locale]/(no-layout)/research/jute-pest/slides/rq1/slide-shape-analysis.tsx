import { motion } from 'framer-motion';
import {
  Box,
  CircleDot,
  Hexagon,
  LineChart,
  Maximize2,
  Ruler,
  ShapesIcon,
  Square,
  Triangle,
} from 'lucide-react';

const MetricCard = ({
  icon: Icon,
  title,
  value,
  unit,
  description,
}: {
  icon: any;
  title: string;
  value: string;
  unit: string;
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
    <div className="mb-2 flex items-baseline gap-1">
      <span className="text-2xl font-bold">{value}</span>
      <span className="text-foreground/60 text-sm">{unit}</span>
    </div>
    <p className="text-foreground/80 text-sm">{description}</p>
  </motion.div>
);

const FeatureDescription = ({
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

export const rq1ShapeAnalysisSlide = {
  title: '📐 Shape Analysis Deep Dive',
  subtitle: 'Morphological Feature Extraction & Analysis',
  content: (
    <div className="space-y-8">
      {/* Key Shape Metrics */}
      <div className="grid gap-6 md:grid-cols-3">
        <MetricCard
          icon={Maximize2}
          title="Area Coverage"
          value="92.5"
          unit="%"
          description="Average pest body area relative to bounding box"
        />
        <MetricCard
          icon={Ruler}
          title="Aspect Ratio"
          value="2.3"
          unit=":1"
          description="Mean length to width ratio of pest specimens"
        />
        <MetricCard
          icon={CircleDot}
          title="Circularity"
          value="0.78"
          unit=""
          description="Shape roundness index (0-1 scale)"
        />
      </div>

      {/* Shape Feature Analysis */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-foreground/5 rounded-xl p-6"
      >
        <h3 className="mb-6 text-xl font-bold">Key Shape Features</h3>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-6">
            <FeatureDescription
              icon={Box}
              title="Contour Analysis"
              description="Advanced edge detection and contour extraction using OpenCV's findContours with CHAIN_APPROX_SIMPLE method"
            />
            <FeatureDescription
              icon={Triangle}
              title="Convex Hull"
              description="Calculation of minimum convex polygon enclosing the pest shape for defect analysis"
            />
            <FeatureDescription
              icon={Square}
              title="Bounding Box"
              description="Minimum rectangle analysis for orientation and principal axes determination"
            />
          </div>
          <div className="space-y-6">
            <FeatureDescription
              icon={Hexagon}
              title="Hu Moments"
              description="Scale, rotation, and translation invariant shape descriptors for robust classification"
            />
            <FeatureDescription
              icon={ShapesIcon}
              title="Morphological Operations"
              description="Advanced erosion and dilation techniques for noise reduction and feature enhancement"
            />
            <FeatureDescription
              icon={LineChart}
              title="Statistical Analysis"
              description="Comprehensive shape metric distribution analysis across pest categories"
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
            <h4 className="mb-2 font-medium">Shape Detection Pipeline</h4>
            <pre className="text-foreground/80 overflow-x-auto text-sm">
              {`1. Grayscale conversion
2. Adaptive thresholding
3. Contour detection
4. Shape feature extraction
5. Statistical analysis`}
            </pre>
          </div>
          <div className="bg-foreground/10 rounded-lg p-4">
            <h4 className="mb-2 font-medium">Key Python Libraries</h4>
            <pre className="text-foreground/80 overflow-x-auto text-sm">
              {`import cv2
import numpy as np
from scipy.spatial import ConvexHull
from skimage.measure import regionprops`}
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
            <h4 className="mb-2 font-medium">Shape Distinctiveness</h4>
            <p className="text-foreground/80 text-sm">
              Significant differences in aspect ratios and convexity measures
              between pest species (p &lt; 0.001)
            </p>
          </div>
          <div className="bg-foreground/10 rounded-lg p-4">
            <h4 className="mb-2 font-medium">Classification Impact</h4>
            <p className="text-foreground/80 text-sm">
              Shape features alone achieved 78.5% accuracy in preliminary
              classification tests
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  ),
};
