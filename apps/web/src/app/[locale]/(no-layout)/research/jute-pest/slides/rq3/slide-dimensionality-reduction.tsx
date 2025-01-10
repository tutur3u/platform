import { motion } from 'framer-motion';
import {
  Activity,
  BarChart3,
  Brain,
  CircleDot,
  GitBranch,
  LineChart,
  Network,
  Sigma,
  Target,
} from 'lucide-react';

const ReductionMetric = ({
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

const ReductionDetail = ({
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

export const rq3DimensionalityReductionSlide = {
  title: '📉 Dimensionality Reduction Analysis',
  subtitle: 'Feature Space Optimization and Visualization',
  content: (
    <div className="space-y-8">
      {/* Key Reduction Metrics */}
      <div className="grid gap-6 md:grid-cols-3">
        <ReductionMetric
          icon={Target}
          title="Dimensions Reduced"
          value="86%"
          description="Feature space compression"
        />
        <ReductionMetric
          icon={Activity}
          title="Variance Retained"
          value="94.2%"
          description="Information preservation"
        />
        <ReductionMetric
          icon={Brain}
          title="Performance Impact"
          value="+2.8%"
          description="Accuracy improvement"
        />
      </div>

      {/* Reduction Techniques */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-foreground/5 rounded-xl p-6"
      >
        <h3 className="mb-6 text-xl font-bold">Reduction Techniques</h3>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-6">
            <ReductionDetail
              icon={Brain}
              title="Principal Component Analysis"
              description="94.2% variance explained with 12 components"
            />
            <ReductionDetail
              icon={Network}
              title="t-SNE"
              description="Non-linear dimensionality reduction for visualization"
            />
            <ReductionDetail
              icon={GitBranch}
              title="UMAP"
              description="Manifold learning for feature space exploration"
            />
          </div>
          <div className="space-y-6">
            <ReductionDetail
              icon={Sigma}
              title="Linear Discriminant Analysis"
              description="Supervised dimensionality reduction"
            />
            <ReductionDetail
              icon={BarChart3}
              title="Autoencoder"
              description="Deep learning based feature compression"
            />
            <ReductionDetail
              icon={LineChart}
              title="Feature Agglomeration"
              description="Hierarchical feature clustering"
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
        <h3 className="mb-6 text-xl font-bold">Implementation Analysis</h3>
        <div className="space-y-4">
          <div className="bg-foreground/10 rounded-lg p-4">
            <h4 className="mb-2 font-medium">Reduction Pipeline</h4>
            <pre className="text-foreground/80 overflow-x-auto text-sm">
              {`1. Feature standardization
2. PCA transformation
3. Component selection
4. Visualization mapping
5. Performance validation`}
            </pre>
          </div>
          <div className="bg-foreground/10 rounded-lg p-4">
            <h4 className="mb-2 font-medium">Key Libraries</h4>
            <pre className="text-foreground/80 overflow-x-auto text-sm">
              {`from sklearn.decomposition import PCA
from sklearn.manifold import TSNE
from umap import UMAP
import tensorflow as tf`}
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
            <h4 className="mb-2 font-medium">Reduction Results</h4>
            <ul className="text-foreground/80 space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                12 principal components selected
              </li>
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                94.2% variance explained
              </li>
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                Clear class separation achieved
              </li>
            </ul>
          </div>
          <div className="bg-foreground/10 rounded-lg p-4">
            <h4 className="mb-2 font-medium">Performance Impact</h4>
            <ul className="text-foreground/80 space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                2.8% accuracy improvement
              </li>
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                86% feature reduction
              </li>
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                68% faster training time
              </li>
            </ul>
          </div>
        </div>
      </motion.div>
    </div>
  ),
};
