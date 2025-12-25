# Implementation Plan: Workspace Workforce & Payroll System

## Phase 1: Data Foundation and Workspace User Management
*Goal: Establish the core data structures and the link between active members and HR records.*

- [~] Task: Database Migrations for Workforce Tables (`workspace_users`, `workforce_contracts`, `workforce_compensation`, `workforce_benefits`, `payroll_runs`, `payouts`)
- [ ] Task: TDD - Data Access Layer for Workspace Users (DTOs and Repository)
- [ ] Task: TDD - Workforce Identity Linking Service (Logic for auto-creation and smart re-linking of members to users)
- [ ] Task: TDD - Workspace User CRUD API Endpoints (`/api/v1/workspaces/[wsId]/workforce/users`)
- [ ] Task: Conductor - User Manual Verification 'Data Foundation and Workspace User Management' (Protocol in workflow.md)

## Phase 2: Employment Lifecycle (Contracts & Compensation)
*Goal: Manage the "Work" side of the user—contracts, salaries, and benefits.*

- [ ] Task: TDD - Contract Management Service (Support for multi-term contracts and PDF storage integration)
- [ ] Task: TDD - Compensation & Benefits Service (Tracking base rates, salary, and recurring benefits)
- [ ] Task: TDD - Contracts and Compensation API Endpoints (`/api/v1/workspaces/[wsId]/workforce/contracts`)
- [ ] Task: Conductor - User Manual Verification 'Employment Lifecycle (Contracts & Compensation)' (Protocol in workflow.md)

## Phase 3: Time-Tracker Integration & Payroll Engine
*Goal: The core logic for calculating pay based on hours worked and overtime.*

- [ ] Task: TDD - Time-Tracker Integration Layer (Aggregating approved logs from the existing time-tracker API)
- [ ] Task: TDD - Payroll Calculation Engine (Implementation of hourly rates, overtime multipliers, and bonus injection)
- [ ] Task: TDD - Payroll Run Management (Logic for generating period snapshots and real-time balance tracking)
- [ ] Task: TDD - Payroll and Payout API Endpoints (`/api/v1/workspaces/[wsId]/workforce/payroll`)
- [ ] Task: Conductor - User Manual Verification 'Time-Tracker Integration & Payroll Engine' (Protocol in workflow.md)

## Phase 4: Administrative Workforce UI
*Goal: Provide the tools for Admins/HR to manage the workforce.*

- [ ] Task: TDD - Workforce Directory Component (Table view with search/filters)
- [ ] Task: TDD - Employee Profile Management UI (Tabbed view for Personal, Contractual, and Financial data)
- [ ] Task: TDD - Contract Timeline & Document Upload UI
- [ ] Task: Conductor - User Manual Verification 'Administrative Workforce UI' (Protocol in workflow.md)

## Phase 5: Payroll Operations & Employee Self-Service
*Goal: Finalize the financial workflow and expose data to employees.*

- [ ] Task: TDD - Payroll Dashboard & Run Wizard (Interface for period-based payroll processing)
- [ ] Task: TDD - Employee Self-Service Portal (View-only profile, leave balance, and payslip history)
- [ ] Task: TDD - Financial History & Export (Reporting tools for payroll summaries)
- [ ] Task: Conductor - User Manual Verification 'Payroll Operations & Employee Self-Service' (Protocol in workflow.md)
