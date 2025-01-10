# Jute Pest Classification Research Project

## Project Overview

- **Title:** Unveiling the Secrets of Jute Pest Classification with Deep Learning
- **Subtitle:** A Data-Driven Approach to Sustainable Pest Management
- **Team Members:** Doan Huu Quoc, Vo Hoang Phuc, Nguyen Dinh Viet, Phan Trong Nguyen
- **Course:** EEET2485 – Research Methods for Engineers
- **Institution:** RMIT University - Vietnam, School of Technology
- **Semester:** 2024C
- **Presentation Date:** 16/01/2025

## Research Questions

1. What are the morphological features that differentiate Jute pest species, and how do these features vary across the dataset?
2. To what extent do environmental conditions (e.g., lighting, background) affect feature visibility?
3. Which combinations of image features (e.g., colour, texture, shape) show the strongest statistical associations with pest categories?
4. Do morphological features (e.g., size, shape, colour) significantly differ between pest species?

## Task List

### 1. Background Research & Context (Slide 2, 3)

- [ ] Research and document the economic significance of jute, focusing on Bangladesh (Slide 2)
- [ ] Compile statistics on jute's role in the industrial sector (Slide 2)
- [ ] Document environmental benefits (CO2 absorption, biodegradability) (Slide 2)
- [ ] Research and document the impact of pest infestations on jute yield and quality (Slide 3)
- [ ] Calculate economic losses faced by farmers due to pest damage (Slide 3)
- [ ] Review and document limitations of traditional pest control methods (Slide 3)

### 2. Dataset Preparation (Slide 5)

- [ ] Download and verify the UCI Machine Learning Repository dataset (Slide 5)
- [ ] Organize 7235 images into appropriate train/test/validation splits (Slide 5)
- [ ] Implement image standardization pipeline: (Slide 7)
  - [ ] Resize images to 224x224 (Slide 7)
  - [ ] Convert to RGB format (Slide 7)
- [ ] Set up data augmentation pipeline using ImageDataGenerator: (Slide 7)
  - [ ] Implement rotations (Slide 7)
  - [ ] Implement shifts (Slide 7)
  - [ ] Implement zooms (Slide 7)
  - [ ] Implement brightness adjustments (Slide 7)

### 3. Feature Extraction Implementation (Slide 8)

- [ ] Implement shape feature extraction: (Slide 8, **New Slide A**)
  - [ ] Edge detection (e.g., Canny) (Slide 8, **New Slide A**)
  - [ ] Contour analysis (e.g., OpenCV's findContours) (Slide 8, **New Slide A**)
  - [ ] Calculate area, perimeter, aspect ratio, circularity, solidity (Slide 8, **New Slide A**)
- [ ] Implement color feature extraction: (Slide 8, **New Slide A**)
  - [ ] Generate color histograms (for each channel R, G, B) (Slide 8, **New Slide A**)
  - [ ] Calculate color statistics (mean, std, skewness, dominant colors, color ratios) (Slide 8, **New Slide A**)
- [ ] Implement texture feature extraction using GLCM: (Slide 8, **New Slide A**)
  - [ ] Calculate GLCM for different angles and distances (Slide 8, **New Slide A**)
  - [ ] Extract contrast, dissimilarity, homogeneity, energy, correlation, ASM (Slide 8, **New Slide A**)

### 4. Statistical Analysis Setup (Slide 9)

- [ ] Implement descriptive statistics calculations (mean, SD, min, max, quartiles) (Slide 9, **New Slide A, New Slide B, New Slide C, New Slide D**)
- [ ] Create visualization scripts for: (Slide 9, **New Slide A, New Slide B, New Slide C, New Slide D**)
  - [ ] Box plots (Slide 9, **New Slide A, New Slide B, New Slide C, New Slide D**)
  - [ ] Scatter plots (Slide 9, **New Slide A, New Slide B, New Slide C, New Slide D**)
- [ ] Set up ANOVA testing pipeline (one-way ANOVA for each feature) (Slide 9, **New Slide A, New Slide B, New Slide C, New Slide D**)
- [ ] Implement post-hoc tests (Tukey's HSD) (Slide 9, **New Slide A, New Slide B, New Slide C, New Slide D**)
- [ ] Set up correlation analysis (Pearson correlation, potentially others) (Slide 9, **New Slide C**)
- [ ] Implement dimensionality reduction (PCA/LDA/DFA) (Slide 9, **New Slide C**)

### 5. Deep Learning Model Implementation (Slide 10)

- [ ] Set up transfer learning pipeline for: (Slide 10)
  - [ ] VGG16 (Slide 10)
  - [ ] ResNet101 (Slide 10)
  - [ ] DenseNet201 (Slide 10)
  - [ ] InceptionV3 (Slide 10)
  - [ ] Xception (Slide 10)
  - [ ] MobileNetV2 (Slide 10)
- [ ] Implement custom dense and softmax layers (Slide 10)
- [ ] Set up model training and evaluation pipeline (Slide 10)

### 6. Research Question Analysis Tasks

#### RQ1: Morphological Features (Slide 11, New Slide A)

- [ ] Extract key morphological features (shape, color, texture) for each image (Slide 8, **New Slide A**)
- [ ] Calculate descriptive statistics for each feature and each species (Slide 9, **New Slide A**)
- [ ] Generate feature distribution plots (box plots, scatter plots) (Slide 9, **New Slide A**)
- [ ] Perform ANOVA for each feature to test for significant differences across species (Slide 9, **New Slide A**)
- [ ] Conduct post-hoc tests (Tukey's HSD) for features with significant ANOVA results (Slide 9, **New Slide A**)
- [ ] Create a table summarizing key morphological features that differentiate each pest species (Slide 11, **New Slide A**)
- [ ] Document significant differentiating features and their variations across species (Slide 11, **New Slide A**)
- [ ] Determine the most discriminative features for each species (Slide 11, **New Slide A**)

#### RQ2: Environmental Impact (Slide 12, New Slide B)

- [ ] Group images based on lighting conditions (e.g., bright, dim, shadows) (Slide 12, **New Slide B**)
- [ ] Group images based on background complexity (e.g., uniform, cluttered) (Slide 12, **New Slide B**)
- [ ] Define clear criteria for group assignments (Slide 12, **New Slide B**)
- [ ] Extract shape, color, and texture features (as in RQ1) for all images (Slide 8, **New Slide B**)
- [ ] Within each species, perform t-tests or ANOVA to compare feature values between lighting groups (Slide 9, **New Slide B**)
- [ ] Within each species, perform t-tests or ANOVA to compare feature values between background groups (Slide 9, **New Slide B**)
- [ ] Conduct post-hoc tests if ANOVA is significant (Slide 9, **New Slide B**)
- [ ] Quantify the impact of lighting and background on feature visibility (using effect sizes, percentage differences) (Slide 12, **New Slide B**)
- [ ] Identify robust features (least affected) and sensitive features (most affected) (Slide 12, **New Slide B**)
- [ ] Document statistical evidence (t-tests or ANOVA results, post-hoc tests) (Slide 12, **New Slide B**)
- [ ] Discuss potential biases or limitations related to environmental factors (Slide 12, **New Slide B**)

#### RQ3: Feature Combinations (Slide 13, New Slide C)

- [ ] Combine all extracted features into a single feature vector for each image (Slide 13, **New Slide C**)
- [ ] Create new features by combining existing ones (e.g., ratios, interactions) (Slide 13, **New Slide C**)
- [ ] Justify the choice of new features created (Slide 13, **New Slide C**)
- [ ] Calculate the correlation matrix (Slide 13, **New Slide C**)
- [ ] Calculate the correlation between each feature and the pest species label (Slide 13, **New Slide C**)
- [ ] Visualize the correlation matrix as a heatmap (Slide 13, **New Slide C**)
- [ ] Perform PCA and examine loadings and correlations with pest species (Slide 13, **New Slide C**)
- [ ] Perform LDA/DFA and examine coefficients to identify feature combinations that best separate species (Slide 13, **New Slide C**)
- [ ] Identify individual features and feature combinations strongly correlated with pest species (Slide 13, **New Slide C**)
- [ ] Rank features/combinations based on their importance for classification (Slide 13, **New Slide C**)
- [ ] Discuss biological or practical reasons for the effectiveness of certain feature combinations (Slide 13, **New Slide C**)

#### RQ4: Statistical Analysis (Slide 14, New Slide D)

- [ ] Select key morphological features (size, shape, color) identified in RQ1 (Slide 14, **New Slide D**)
- [ ] Perform one-way ANOVA for each selected feature to test for significant differences across species (Slide 14, **New Slide D**)
- [ ] Set significance level (alpha) appropriately (e.g., 0.05) (Slide 14, **New Slide D**)
- [ ] Report F-statistic and p-value for each ANOVA (Slide 14, **New Slide D**)
- [ ] Conduct post-hoc tests (e.g., Tukey's HSD) for features with significant ANOVA results (Slide 14, **New Slide D**)
- [ ] Create a table summarizing significant differences between species pairs for each feature (Slide 14, **New Slide D**)
- [ ] Discuss the biological implications of the statistically significant differences (Slide 14, **New Slide D**)
- [ ] Acknowledge limitations of the analysis (e.g., potential confounding factors) (Slide 14, **New Slide D**)

### 7. Model Evaluation (Slide 15)

- [ ] Generate confusion matrices for all models (Slide 15)
- [ ] Calculate performance metrics: (Slide 15)
  - [ ] Accuracy (Slide 15)
  - [ ] Precision (Slide 15)
  - [ ] Recall (Slide 15)
  - [ ] F1-score (Slide 15)
- [ ] Compare model performances (Slide 15)
- [ ] Document DenseNet201 performance (target: 97% accuracy) (Slide 15)

### 8. Comparative Analysis (Slide 16)

- [ ] Research and compile results from previous studies (Slide 16)
- [ ] Create comparison metrics table (Slide 16)
- [ ] Document improvements and advantages (Slide 16)
- [ ] Analyze limitations (Slide 16)

### 9. Documentation & Presentation

- [ ] Write methodology documentation (Slide 7, 8, 9, 10, **New Slide A, New Slide B, New Slide C, New Slide D**)
- [ ] Prepare results visualization (All slides with charts and visualizations)
- [ ] Document practical implications (Slide 17)
- [ ] Prepare future work recommendations (Slide 18)
- [ ] Create presentation slides (All 20 slides completed)
- [ ] Rehearse presentation

## Deliverables

1. [ ] Trained model with 97% accuracy (Slide 15)
2. [ ] Comprehensive analysis report (All slides)
3. [ ] Presentation slides (All 20 slides)
4. [ ] Code repository with documentation
5. [ ] Dataset analysis results (Throughout presentation)
6. [ ] Statistical analysis reports (Throughout presentation)
7. [ ] Comparative study results (Slide 16)

## Conclusion (Slide 19)

- [ ] Write conclusion (Slide 19)
- [ ] Next steps (Slide 18)
- [ ] References

## New Slides for Deep Dive into RQs

- **New Slide A:** RQ1 Methodology Deep Dive - Morphological Feature Analysis Checklist (Insert after Slide 11)
- **New Slide B:** RQ2 Methodology Deep Dive - Environmental Impact Analysis Checklist (Insert after Slide 12)
- **New Slide C:** RQ3 Methodology Deep Dive - Feature Combination Analysis Checklist (Insert after Slide 13)
- **New Slide D:** RQ4 Methodology Deep Dive - Statistical Significance of Morphological Differences Checklist (Insert after Slide 14)
