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

export {
  comparativeAnalysisSlide,
  conclusionSlide,
  datasetSlide,
  featureExtractionSlide,
  industryOverviewSlide,
  limitationsSlide,
  methodologyRQ1Slide,
  methodologyRQ2Slide,
  methodologyRQ3Slide,
  methodologyRQ4Slide,
  modelEvaluationSlide,
  pestImpactSlide,
  practicalImplicationsSlide,
  preprocessingSlide,
  qaSlide,
  referencesSlide,
  researchQuestionsSlide,
  solutionOverviewSlide,
  statisticalAnalysisSlide,
  titleSlide,
};

// Improved slide flow:
// 1. Title & Introduction
// 2. Industry Context
// 3. Problem Statement
// 4. Solution Overview
// 5. Research Questions
// 6. Dataset & Preprocessing
// 7-10. Methodology (RQ1-4)
// 11. Feature Extraction
// 12. Statistical Analysis
// 13. Model Evaluation
// 14. Comparative Analysis
// 15. Practical Implications
// 16. Limitations & Future Work
// 17. Conclusion
// 18. References
// 19. Q&A

export const slides = [
  titleSlide,
  industryOverviewSlide,
  pestImpactSlide,
  solutionOverviewSlide,
  researchQuestionsSlide,
  datasetSlide,
  preprocessingSlide,
  methodologyRQ1Slide,
  methodologyRQ2Slide,
  methodologyRQ3Slide,
  methodologyRQ4Slide,
  featureExtractionSlide,
  statisticalAnalysisSlide,
  modelEvaluationSlide,
  comparativeAnalysisSlide,
  practicalImplicationsSlide,
  limitationsSlide,
  conclusionSlide,
  referencesSlide,
  qaSlide,
] as {
  title?: string;
  subtitle?: string;
  content: React.ReactNode;
}[];
