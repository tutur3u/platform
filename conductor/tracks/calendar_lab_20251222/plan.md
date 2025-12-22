# Plan: Smart Scheduling Algorithm Lab

This plan outlines the implementation of a dedicated lab environment for visualizing and stress-testing the smart scheduling calendar algorithm.

## Phase 1: Environment & Access Control [checkpoint: 4045909]
Establish the secure route and a baseline layout that mirrors the production calendar.

- [x] Task: Create lab route and implement Tuturuuu employee-only access check 9be2fb2
- [x] Task: Scaffold `CalendarLabPage` by adapting `CalendarPage` structure d721d0d
- [x] Task: Implement a "Read-Only" state wrapper to ensure no database writes from the lab f070b07
- [x] Task: Conductor - User Manual Verification 'Phase 1: Environment & Access Control' (Protocol in workflow.md) 4045909

## Phase 2: Simulation Engine & Data Management [checkpoint: c985839]
Build the core state management for handling volatile scenarios and data generators.

- [x] Task: Define JSON schema for calendar scenarios (tasks, habits, events, settings) 41e6185
- [x] Task: Implement "Real Data Import" to pull current workspace state into the lab simulation b3d8e45
- [x] Task: Create a "Scenario Loader" to switch between multiple preset JSON configurations 5173907
- [x] Task: Implement a "Realistic Scenario Generator" for procedurally creating relatable test data 5983efc
- [x] Task: Conductor - User Manual Verification 'Phase 2: Simulation Engine & Data Management' (Protocol in workflow.md) c985839

## Phase 3: Enhanced Visualization & Overlays [checkpoint: 2bdaacf]
Refactor calendar components to support algorithm-specific visual debugging.

- [x] Task: Refactor `CalendarClientPage` and sub-components to support an "overlay" layer 9c4b34c
- [x] Task: Implement "Score Heatmap" visualization showing time slot fitness b80c9cb
- [x] Task: Create "Decision Tooltips" that explain the 'why' behind task placement 8fe947b
- [x] Task: Implement constraint violation highlighting (e.g., overlapping events, missed habits) c3b3541
- [x] Task: Conductor - User Manual Verification 'Phase 3: Enhanced Visualization & Overlays' (Protocol in workflow.md) 2bdaacf

## Phase 4: Algorithm Control & Interactivity [checkpoint: cca95e1]
Integrate the scheduling algorithm with playback controls and real-time parameter tuning.

- [x] Task: Integrate the `TuPlan` algorithm into a step-by-step playback controller 5173907
- [x] Task: Implement Play/Pause/Next/Prev controls for the scheduling execution 5173907
- [x] Task: Build a "Parameter Tuning" side panel for real-time algorithm weight adjustment af86db0
- [x] Task: Implement "Scenario Diff" to compare schedule outputs between two sets of parameters 11331d8
- [x] Task: Conductor - User Manual Verification 'Phase 4: Algorithm Control & Interactivity' (Protocol in workflow.md) cca95e1

## Phase 5: Final Polishing & Extensive Scenarios
Create high-value test cases and ensure a premium developer experience.

- [~] Task: Develop 5-10 "Full-Blown" scenarios (e.g., "The Overwhelmed CEO", "The Streak Maintainer")
- [ ] Task: Polish Lab UX/UI to meet Tuturuuu's design standards
- [ ] Task: Final performance optimization for complex simulations
- [ ] Task: Conductor - User Manual Verification 'Phase 5: Final Polishing & Extensive Scenarios' (Protocol in workflow.md)
