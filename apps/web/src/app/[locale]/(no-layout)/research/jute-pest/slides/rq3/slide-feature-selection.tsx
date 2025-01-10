import { motion } from 'framer-motion';
import {
  Activity,
  BarChart3,
  Brain,
  CircleDot,
  Filter,
  GitBranch,
  LineChart,
  Network,
  Sigma,
  Target,
} from 'lucide-react';

const SelectionMetric = ({
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

const SelectionMethod = ({
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

export const rq3FeatureSelectionSlide = {
  title: '🎯 Feature Selection Analysis',
  subtitle: 'Optimal Feature Subset Identification',
  content: (
    <div className="space-y-8">
      {/* Key Selection Metrics */}
      <div className="grid gap-6 md:grid-cols-3">
        <SelectionMetric
          icon={Filter}
          title="Selected Features"
          value="48"
          description="Final optimal feature subset"
        />
        <SelectionMetric
          icon={Target}
          title="Selection Score"
          value="0.924"
          description="Average feature importance score"
        />
        <SelectionMetric
          icon={Activity}
          title="Performance"
          value="+4.2%"
          description="Accuracy improvement after selection"
        />
      </div>

      {/* Selection Methods */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-foreground/5 rounded-xl p-6"
      >
        <h3 className="mb-6 text-xl font-bold">Selection Methods</h3>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-6">
            <SelectionMethod
              icon={Brain}
              title="Random Forest Importance"
              description="Tree-based feature importance ranking"
            />
            <SelectionMethod
              icon={Network}
              title="Recursive Elimination"
              description="Iterative feature elimination with cross-validation"
            />
            <SelectionMethod
              icon={GitBranch}
              title="Mutual Information"
              description="Information-theoretic feature relevance analysis"
            />
          </div>
          <div className="space-y-6">
            <SelectionMethod
              icon={Sigma}
              title="Statistical Tests"
              description="ANOVA and chi-square feature selection"
            />
            <SelectionMethod
              icon={BarChart3}
              title="L1-based Selection"
              description="Lasso regularization for feature selection"
            />
            <SelectionMethod
              icon={LineChart}
              title="Stability Selection"
              description="Randomized feature selection with bootstrapping"
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
            <h4 className="mb-2 font-medium">Selection Pipeline</h4>
            <pre className="text-foreground/80 overflow-x-auto text-sm">
              {`1. Initial feature ranking
2. Cross-validation splits
3. Recursive elimination
4. Stability analysis
5. Final selection`}
            </pre>
          </div>
          <div className="bg-foreground/10 rounded-lg p-4">
            <h4 className="mb-2 font-medium">Key Python Libraries</h4>
            <pre className="text-foreground/80 overflow-x-auto text-sm">
              {`from sklearn.feature_selection import RFE, SelectKBest
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import Lasso
from sklearn.preprocessing import StandardScaler`}
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
            <h4 className="mb-2 font-medium">Selection Results</h4>
            <ul className="text-foreground/80 space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                Shape features: 18 selected
              </li>
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                Color features: 12 selected
              </li>
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                Texture features: 18 selected
              </li>
            </ul>
          </div>
          <div className="bg-foreground/10 rounded-lg p-4">
            <h4 className="mb-2 font-medium">Performance Metrics</h4>
            <ul className="text-foreground/80 space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                Selection stability: 0.892
              </li>
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                Cross-validation: 0.934
              </li>
              <li className="flex items-center gap-2">
                <CircleDot className="text-primary h-4 w-4" />
                Feature redundancy: 0.124
              </li>
            </ul>
          </div>
        </div>
      </motion.div>
    </div>
  ),
};
