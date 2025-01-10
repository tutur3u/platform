// RQ1 Deep Dive Slides
import { rq1ColorAnalysisSlide } from './rq1/slide-color-analysis';
import { rq1FeatureImportanceSlide } from './rq1/slide-feature-importance';
import { rq1ResultsSlide } from './rq1/slide-results';
import { rq1ShapeAnalysisSlide } from './rq1/slide-shape-analysis';
import { rq1TextureAnalysisSlide } from './rq1/slide-texture-analysis';
// RQ2 Deep Dive Slides
import { rq2BackgroundAnalysisSlide } from './rq2/slide-background-analysis';
import { rq2ConditionImpactSlide } from './rq2/slide-condition-impact';
import { rq2FeatureStabilitySlide } from './rq2/slide-feature-stability';
import { rq2LightingAnalysisSlide } from './rq2/slide-lighting-analysis';
import { rq2ResultsSlide } from './rq2/slide-results';
// RQ3 Deep Dive Slides
import { rq3CorrelationAnalysisSlide } from './rq3/slide-correlation-analysis';
import { rq3DimensionalityReductionSlide } from './rq3/slide-dimensionality-reduction';
import { rq3FeatureEngineeringSlide } from './rq3/slide-feature-engineering';
import { rq3FeatureSelectionSlide } from './rq3/slide-feature-selection';
import { rq3ResultsSlide } from './rq3/slide-results';
// RQ4 Deep Dive Slides
import { rq4DeploymentSlide } from './rq4/slide-deployment-analysis';
import { rq4OptimizationSlide } from './rq4/slide-optimization-analysis';
import { rq4ResultsSlide } from './rq4/slide-results';
// Core Slides
import { comparativeAnalysisSlide } from './slide-comparative-analysis';
import { conclusionSlide } from './slide-conclusion';
import { datasetSlide } from './slide-dataset';
import { featureExtractionSlide } from './slide-feature-extraction';
import { industryOverviewSlide } from './slide-industry-overview';
import { limitationsSlide } from './slide-limitations';
import { methodologyRQ1Slide } from './slide-methodology-rq1';
import { methodologyRQ2Slide } from './slide-methodology-rq2';
import { methodologyRQ3Slide } from './slide-methodology-rq3';
import { methodologyRQ4Slide } from './slide-methodology-rq4';
import { modelEvaluationSlide } from './slide-model-evaluation';
import { pestImpactSlide } from './slide-pest-impact';
import { practicalImplicationsSlide } from './slide-practical-implications';
import { preprocessingSlide } from './slide-preprocessing';
import { qaSlide } from './slide-qa';
import { referencesSlide } from './slide-references';
import { researchQuestionsSlide } from './slide-research-questions';
import { solutionOverviewSlide } from './slide-solution-overview';
import { statisticalAnalysisSlide } from './slide-statistical-analysis';
import { titleSlide } from './slide-title';

// Comprehensive slide flow
export const slides = [
  // Introduction
  titleSlide,
  industryOverviewSlide,
  pestImpactSlide,
  solutionOverviewSlide,

  // Research Overview
  researchQuestionsSlide,
  datasetSlide,

  // General Methodology
  preprocessingSlide,
  featureExtractionSlide,
  statisticalAnalysisSlide,
  modelEvaluationSlide,
  comparativeAnalysisSlide,

  // RQ1: Morphological Feature Analysis
  methodologyRQ1Slide,
  rq1ShapeAnalysisSlide,
  rq1ColorAnalysisSlide,
  rq1TextureAnalysisSlide,
  rq1FeatureImportanceSlide,
  rq1ResultsSlide,

  // RQ2: Environmental Impact Analysis
  methodologyRQ2Slide,
  rq2LightingAnalysisSlide,
  rq2BackgroundAnalysisSlide,
  rq2FeatureStabilitySlide,
  rq2ConditionImpactSlide,
  rq2ResultsSlide,

  // RQ3: Feature Correlation Analysis
  methodologyRQ3Slide,
  rq3CorrelationAnalysisSlide,
  rq3FeatureEngineeringSlide,
  rq3DimensionalityReductionSlide,
  rq3FeatureSelectionSlide,
  rq3ResultsSlide,

  // RQ4: Model Optimization
  methodologyRQ4Slide,
  rq4OptimizationSlide,
  rq4DeploymentSlide,
  rq4ResultsSlide,

  // Conclusion Section
  practicalImplicationsSlide,
  limitationsSlide,
  conclusionSlide,
  referencesSlide,

  // Q&A
  qaSlide,
] as Slide[];

export type Slide = {
  title?: string;
  subtitle?: string;
  content: React.ReactNode;
};
