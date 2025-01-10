import { motion } from 'framer-motion';
import {
  Activity,
  BarChart3,
  Box,
  Grid,
  Hash,
  Network,
  Repeat,
  ScanLine,
  Waves,
} from 'lucide-react';

const TextureMetric = ({
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

const TextureFeature = ({
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

export const rq1TextureAnalysisSlide = {
  title: '🔍 Texture Analysis Deep Dive',
  subtitle: 'Advanced Texture Feature Extraction & Analysis',
  content: (
    <div className="space-y-8">
      {/* Key Texture Metrics */}
      <div className="grid gap-6 md:grid-cols-3">
        <TextureMetric
          icon={Grid}
          title="GLCM Features"
          value="14 Metrics"
          description="Gray Level Co-occurrence Matrix statistical features"
        />
        <TextureMetric
          icon={Waves}
          title="Wavelet Features"
          value="4 Levels"
          description="Multi-resolution wavelet decomposition analysis"
        />
        <TextureMetric
          icon={Activity}
          title="LBP Features"
          value="256 Points"
          description="Local Binary Pattern histogram features"
        />
      </div>

      {/* Texture Analysis Methods */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-foreground/5 rounded-xl p-6"
      >
        <h3 className="mb-6 text-xl font-bold">Analysis Methods</h3>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-6">
            <TextureFeature
              icon={Hash}
              title="GLCM Analysis"
              description="Contrast, correlation, energy, and homogeneity computation at multiple angles"
            />
            <TextureFeature
              icon={Network}
              title="LBP Computation"
              description="Rotation-invariant uniform patterns for robust texture characterization"
            />
            <TextureFeature
              icon={Box}
              title="Gabor Filtering"
              description="Multi-scale and multi-orientation texture feature extraction"
            />
          </div>
          <div className="space-y-6">
            <TextureFeature
              icon={ScanLine}
              title="Wavelet Transform"
              description="Haar wavelet decomposition for multi-resolution analysis"
            />
            <TextureFeature
              icon={Repeat}
              title="Pattern Analysis"
              description="Statistical analysis of recurring texture patterns"
            />
            <TextureFeature
              icon={BarChart3}
              title="Feature Selection"
              description="Principal component analysis for optimal feature subset selection"
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
            <h4 className="mb-2 font-medium">Texture Analysis Pipeline</h4>
            <pre className="text-foreground/80 overflow-x-auto text-sm">
              {`1. Image preprocessing
2. GLCM computation
3. LBP feature extraction
4. Wavelet decomposition
5. Feature vector compilation`}
            </pre>
          </div>
          <div className="bg-foreground/10 rounded-lg p-4">
            <h4 className="mb-2 font-medium">Key Python Libraries</h4>
            <pre className="text-foreground/80 overflow-x-auto text-sm">
              {`import cv2
import numpy as np
from skimage.feature import local_binary_pattern
from pywt import wavedec2
from sklearn.decomposition import PCA`}
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
            <h4 className="mb-2 font-medium">Texture Patterns</h4>
            <p className="text-foreground/80 text-sm">
              GLCM features showed 87.4% accuracy in distinguishing between
              different pest species
            </p>
          </div>
          <div className="bg-foreground/10 rounded-lg p-4">
            <h4 className="mb-2 font-medium">Feature Importance</h4>
            <p className="text-foreground/80 text-sm">
              LBP and wavelet features contributed to 76.8% of the overall
              classification performance
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  ),
};
