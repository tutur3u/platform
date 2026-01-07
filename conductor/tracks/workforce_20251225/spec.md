# Track Specification: Workspace Workforce & Payroll System

## 1. Overview
This track implements a comprehensive "Workforce Management & Payroll" system within the workspace. It aims to bridge the gap between "Workspace Members" (active platform users) and "Workspace Users" (historical/virtual records for HR). The system will manage contracts, compensation, benefits, and leave, while deeply integrating with the existing Time Tracker to automate payroll calculations based on hourly rates, overtime rules, and project specifics.

## 2. Functional Requirements

### 2.1. Workforce Identity Management
*   **Dual-Layer Identity:**
    *   **Workspace Member:** The active authentication account (Platform User).
    *   **Workspace User (Virtual):** The HR record containing sensitive data, contract history, and financial details.
    *   **Relationship:** 1:1 Link. A `WorkspaceUser` can exist without a `WorkspaceMember` (e.g., historical records, external contractors).
*   **Smart Linking:**
    *   **Auto-Creation:** Automatically create a `WorkspaceUser` profile when a new `WorkspaceMember` joins.
    *   **Smart Re-linking:** When a member re-joins (same User ID or verified email), automatically prompt to re-link to their existing dormant `WorkspaceUser` record to preserve history.
*   **Profile Data Fields:**
    *   **Identity:** Employee ID, Employee Username (internal), Job Title, Department, Working Location.
    *   **Contact:** Internal Email(s) (list), Personal Email.
    *   **Financial (Encrypted):** Tax Identification Number (TIN), Bank Account Details.
    *   **Status:** Active, On Leave, Terminated, Rehired.

### 2.2. Contracts & Compensation
*   **Multi-Term Contracts:** Support multiple contract periods for a single user (e.g., Intern -> Full-time -> Left -> Rehired as Contractor).
*   **Contract Details:** Start/End Dates, Type (Full-time, Part-time, Contract), Job Title, Department.
*   **File Attachment:** Capability to upload and store digital contract files (PDFs) securely linked to the contract record.
*   **Compensation Structure:**
    *   Base Salary (Monthly/Annual).
    *   Base Hourly Rate (for time-tracking calculations).
    *   Overtime Rules (e.g., 1.5x after 8h/day, 2x on weekends).
    *   Currency and Payment Frequency.
*   **Benefits & Bonuses:**
    *   Recurring benefits (Health Insurance, Stipends).
    *   One-off bonuses (Performance, Signing).
    *   Leave Allowance (Vacation days, Sick leave balances).

### 2.3. Time Tracker Integration & Calculation Engine
*   **Integration Source:** Deep integration with `@apps/web/src/app/api/v1/workspaces/[wsId]/time-tracker/**`.
*   **Calculation Logic:**
    *   Aggregates *Approved* time logs for a given period.
    *   Applies the specific *Hourly Rate* effective at the time of the log.
    *   Supports Project-specific rates (overriding base rate if defined).
    *   Applies Overtime multipliers automatically based on workspace rules.
*   **Manual Adjustments:** Allow admins to inject manual time entries or monetary adjustments (e.g., "Missed Clock-in Adjustment") into the calculation context.

### 2.4. Payroll & Payout Workflows
*   **Mode A: Period-Based Run (Standard):**
    *   Select Date Range (e.g., Oct 1-31).
    *   System generates a "Payroll Run" snapshot aggregating all Salary + Calculated Hours + Bonuses - Deductions.
    *   Review & Finalize step to "Lock" the run and generate records.
*   **Mode B: Continuous/Real-time:**
    *   Live view of "Current Due" balance updating as time logs are approved.
    *   "Payout Now" action to clear the balance and record a transaction immediately.

### 2.5. User Interface (UI)
*   **Workforce Directory:** Searchable table of all Workspace Users with status filters.
*   **Employee Profile (Tabbed View):**
    *   *Overview:* Basic info, current status.
    *   *Contracts:* Timeline of employment terms with file uploads.
    *   *Financial:* Compensation, Bank info (masked), Benefits.
    *   *Payroll History:* List of past payslips and payouts.
*   **Payroll Dashboard:** High-level metrics (Total Cost, Pending Payouts), "Start Payroll Run" wizard.
*   **Self-Service Portal:** View-only access for linked Workspace Members to see their own Contract info, Leave Balance, and Payslip history.

## 3. Non-Functional Requirements
*   **Security:** All "Financial" fields (TIN, Bank Info, Salary details) must be stored encrypted at rest or strictly row-level permission gated (Admins/HR only).
*   **Auditability:** Every change to a Contract or Compensation record must be logged (Who changed it, Old Value, New Value, Timestamp).
*   **Scalability:** Payroll calculation must handle thousands of time logs efficiently without timing out the request.

## 4. Out of Scope
*   Direct Integration with Banking APIs for actual money transfer (System records the *intent* to pay and generates the report/file, but actual transfer is external).
*   Automatic Tax Filing (System records tax IDs and amounts, but does not submit to government portals).
