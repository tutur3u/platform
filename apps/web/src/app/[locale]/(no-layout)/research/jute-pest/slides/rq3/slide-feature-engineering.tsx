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

const EngineeringMetric = ({
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

const EngineeringDetail = ({
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

export const rq3FeatureEngineeringSlide = {
  title: '🔧 Feature Engineering Analysis',
  subtitle: 'Advanced Feature Creation and Transformation',
  content: (
    <div className="space-y-8">
      {/* Key Engineering Metrics */}
      <div className="grid gap-6 md:grid-cols-3">
        <EngineeringMetric
          icon={Target}
          title="New Features"
          value="64"
          description="Engineered feature count"
        />
        <EngineeringMetric
          icon={Activity}
          title="Performance Gain"
          value="+5.2%"
          description="Accuracy improvement"
        />
        <EngineeringMetric
          icon={Brain}
          title="Feature Quality"
          value="0.892"
          description="Average feature importance"
        />
      </div>

      {/* Engineering Techniques */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-foreground/5 rounded-xl p-6"
      >
        <h3 className="mb-6 text-xl font-bold">Engineering Techniques</h3>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-6">
            <EngineeringDetail
              icon={Brain}
              title="Feature Transformation"
              description="Non-linear transformations and scaling"
            />
            <EngineeringDetail
              icon={Network}
              title="Feature Interaction"
              description="Polynomial and multiplicative features"
            />
            <EngineeringDetail
              icon={GitBranch}
              title="Feature Aggregation"
              description="Statistical aggregations of base features"
            />
          </div>
          <div className="space-y-6">
            <EngineeringDetail
              icon={Sigma}
              title="Domain Features"
              description="Expert-guided feature creation"
            />
            <EngineeringDetail
              icon={BarChart3}
              title="Time-based Features"
              description="Temporal pattern extraction"
            />
            <EngineeringDetail
              icon={LineChart}
              title="Deep Features"
              description="Neural network based feature extraction"
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
            <h4 className="mb-2 font-medium">Engineering Pipeline</h4>
            <pre className="text-foreground/80 overflow-x-auto text-sm">
              {`1. Base feature analysis
2. Feature transformation
3. Interaction creation
4. Quality assessment
5. Feature selection`}
            </pre>
          </div>
          <div className="bg-foreground/10 rounded-lg p-4">
            <h4 className="mb-2 font-medium">Key Libraries</h4>
            <pre className="text-foreground/80 overflow-x-auto text-sm">
              {`from sklearn.preprocessing import PolynomialFeatures
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
import feature_engine as fe`}
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
            <h4 className="mb-2 font-medium">Feature Impact</h4>
            <ul className="text-foreground/80 space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                64 new informative features
              </li>
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                5.2% accuracy improvement
              </li>
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                Enhanced feature interpretability
              </li>
            </ul>
          </div>
          <div className="bg-foreground/10 rounded-lg p-4">
            <h4 className="mb-2 font-medium">Quality Metrics</h4>
            <ul className="text-foreground/80 space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                0.892 average importance
              </li>
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                0.768 correlation score
              </li>
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                0.912 stability score
              </li>
            </ul>
          </div>
        </div>
      </motion.div>
    </div>
  ),
};
