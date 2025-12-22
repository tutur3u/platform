# Plan: Smart Scheduling Algorithm Lab

This plan outlines the implementation of a dedicated lab environment for visualizing and stress-testing the smart scheduling calendar algorithm.

## Phase 1: Environment & Access Control [checkpoint: 4045909]
Establish the secure route and a baseline layout that mirrors the production calendar.

- [x] Task: Create lab route and implement Tuturuuu employee-only access check 9be2fb2
- [x] Task: Scaffold `CalendarLabPage` by adapting `CalendarPage` structure d721d0d
- [x] Task: Implement a "Read-Only" state wrapper to ensure no database writes from the lab f070b07
- [x] Task: Conductor - User Manual Verification 'Phase 1: Environment & Access Control' (Protocol in workflow.md) 4045909

## Phase 2: Simulation Engine & Data Management
Build the core state management for handling volatile scenarios and data generators.

- [x] Task: Define JSON schema for calendar scenarios (tasks, habits, events, settings) 41e6185
- [~] Task: Implement "Real Data Import" to pull current workspace state into the lab simulation
- [ ] Task: Create a "Scenario Loader" to switch between multiple preset JSON configurations
- [ ] Task: Implement a "Realistic Scenario Generator" for procedurally creating relatable test data
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Simulation Engine & Data Management' (Protocol in workflow.md)

## Phase 3: Enhanced Visualization & Overlays
Refactor calendar components to support algorithm-specific visual debugging.

- [ ] Task: Refactor `CalendarClientPage` and sub-components to support an "overlay" layer
- [ ] Task: Implement "Score Heatmap" visualization showing time slot fitness
- [ ] Task: Create "Decision Tooltips" that explain the 'why' behind task placement
- [ ] Task: Implement constraint violation highlighting (e.g., overlapping events, missed habits)
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Enhanced Visualization & Overlays' (Protocol in workflow.md)

## Phase 4: Algorithm Control & Interactivity
Integrate the scheduling algorithm with playback controls and real-time parameter tuning.

- [ ] Task: Integrate the `TuPlan` algorithm into a step-by-step playback controller
- [ ] Task: Implement Play/Pause/Next/Prev controls for the scheduling execution
- [ ] Task: Build a "Parameter Tuning" side panel for real-time algorithm weight adjustment
- [ ] Task: Implement "Scenario Diff" to compare schedule outputs between two sets of parameters
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Algorithm Control & Interactivity' (Protocol in workflow.md)

## Phase 5: Final Polishing & Extensive Scenarios
Create high-value test cases and ensure a premium developer experience.

- [ ] Task: Develop 5-10 "Full-Blown" scenarios (e.g., "The Overwhelmed CEO", "The Streak Maintainer")
- [ ] Task: Polish Lab UX/UI to meet Tuturuuu's design standards
- [ ] Task: Final performance optimization for complex simulations
- [ ] Task: Conductor - User Manual Verification 'Phase 5: Final Polishing & Extensive Scenarios' (Protocol in workflow.md)
