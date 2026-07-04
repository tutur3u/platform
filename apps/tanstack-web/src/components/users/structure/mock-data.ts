import type {
  Collaboration,
  EmploymentHistory,
  Organization,
  OrganizationalData,
  OrganizationRelationship,
  PerformanceReview,
  Person,
  Responsibility,
  Role,
  RoleResponsibility,
  Supervisor,
} from './types';

type OrganizationRow = [
  id: string,
  name: string,
  description: string,
  color?: string,
  bgColor?: string,
];
type PersonRow = [
  id: string,
  fullName: string,
  email: string,
  color: string,
  text: string,
];
type RoleRow = [id: string, name: string];
type ResponsibilityRow = [id: string, description: string];
type RoleResponsibilityRow = [
  id: string,
  roleId: string,
  responsibilityId: string,
];
type ReviewRow = [
  id: string,
  employmentId: string,
  outcome: PerformanceReview['outcome'],
  notes: string,
];
type EmploymentRow = [
  id: string,
  personId: string,
  roleId: string,
  organizationId: string,
  salary: number,
  type: EmploymentHistory['type'],
];
type SupervisorRow = [employeeId: string, supervisorId: string];
type CollaborationRow = [internalId: string, externalId: string];
type OrganizationRelationshipRow = [
  id: string,
  parentId: string,
  childId: string,
  relationshipType: string,
];

const organizations: Organization[] = (
  [
    ['org1', 'Innovate Inc.', 'Parent company'],
    [
      'org2',
      'Technology',
      'Handles all software and hardware development.',
      '#10b981',
      'rgba(16, 185, 129, 0.05)',
    ],
    [
      'org3',
      'Marketing & Sales',
      'Manages product promotion, branding, and sales.',
      '#f59e0b',
      'rgba(245, 158, 11, 0.05)',
    ],
    [
      'org4',
      'Product',
      'Drives product strategy and design.',
      '#3b82f6',
      'rgba(59, 130, 246, 0.05)',
    ],
    [
      'org5',
      'External Partners',
      'Third-party collaborators.',
      '#8b5cf6',
      'rgba(139, 92, 246, 0.05)',
    ],
    [
      'org6',
      'Finance & Operations',
      'Manages finance, HR, and legal.',
      '#14b8a6',
      'rgba(20, 184, 166, 0.05)',
    ],
  ] satisfies OrganizationRow[]
).map(([id, name, description, color, bgColor]) => ({
  bgColor,
  color,
  description,
  id,
  name,
}));

const people: Person[] = (
  [
    ['p1', 'Alice Johnson', 'alice@innovate.com', 'e2e8f0', 'AJ'],
    ['p2', 'Bob Williams', 'bob@innovate.com', 'a7f3d0', 'BW'],
    ['p3', 'Charlie Brown', 'charlie@innovate.com', 'fde68a', 'CB'],
    ['p4', 'David Lee', 'david@innovate.com', 'a7f3d0', 'DL'],
    ['p5', 'Emily Chen', 'emily@innovate.com', 'a7f3d0', 'EC'],
    ['p6', 'Frank Miller', 'frank@innovate.com', 'bfdbfe', 'FM'],
    ['p7', 'Grace Hall', 'grace@innovate.com', 'bfdbfe', 'GH'],
    ['p8', 'Henry Wilson', 'henry@innovate.com', 'fde68a', 'HW'],
    ['p9', 'Ivy Green', 'ivy@innovate.com', 'a7f3d0', 'IG'],
    ['p10', 'Jack Black', 'jack@external.com', 'c4b5fd', 'JB'],
    ['p11', 'Nina Patel', 'nina@innovate.com', 'fde68a', 'NP'],
    ['p12', 'Oscar Wilde', 'oscar@innovate.com', 'ccfbf1', 'OW'],
    ['p13', 'Penny Lane', 'penny@innovate.com', 'ccfbf1', 'PL'],
    ['p14', 'Quincy Jones', 'quincy@innovate.com', 'a7f3d0', 'QJ'],
    ['p15', 'Rita Moreno', 'rita@innovate.com', 'fde68a', 'RM'],
    ['p16', 'Sam Cooke', 'sam@external.com', 'c4b5fd', 'SC'],
    ['p17', 'Tina Turner', 'tina@innovate.com', 'a7f3d0', 'TT'],
    ['p18', 'Uma Thurman', 'uma@innovate.com', 'a7f3d0', 'UT'],
    ['p19', 'Vince Gill', 'vince@innovate.com', 'ccfbf1', 'VG'],
  ] satisfies PersonRow[]
).map(([id, fullName, email, color, text]) => ({
  email,
  fullName,
  id,
  photoUrl: `https://placehold.co/100x100/${color}/1e293b?text=${text}`,
}));

const roles: Role[] = (
  [
    ['r1', 'CEO'],
    ['r2', 'CTO'],
    ['r3', 'Software Engineer'],
    ['r4', 'Marketing Director'],
    ['r5', 'Senior Software Engineer'],
    ['r6', 'VP of Product'],
    ['r7', 'UX/UI Designer'],
    ['r8', 'Sales Lead'],
    ['r9', 'QA Engineer'],
    ['r10', 'External Consultant'],
    ['r11', 'Product Manager'],
    ['r12', 'CFO'],
    ['r13', 'HR Manager'],
    ['r14', 'DevOps Engineer'],
    ['r15', 'Content Strategist'],
    ['r16', 'External Legal Counsel'],
    ['r17', 'Data Scientist'],
    ['r18', 'Data Analyst'],
    ['r19', 'Paralegal'],
  ] satisfies RoleRow[]
).map(([id, name]) => ({ id, name }));

const responsibilities: Responsibility[] = (
  [
    ['resp1', 'Strategic planning and company vision'],
    ['resp2', 'Technology architecture and development oversight'],
    ['resp3', 'Software development and code quality'],
    ['resp4', 'Marketing strategy and brand management'],
    ['resp5', 'Product roadmap and user experience design'],
    ['resp6', 'Sales operations and customer relationships'],
    ['resp7', 'Quality assurance and testing'],
    ['resp8', 'External partnerships and consulting'],
    ['resp9', 'Financial planning and analysis'],
    ['resp10', 'Human resources and legal compliance'],
    ['resp11', 'DevOps and infrastructure management'],
    ['resp12', 'Content creation and marketing communications'],
    ['resp13', 'Data analysis and business intelligence'],
    ['resp14', 'Legal counsel and risk management'],
  ] satisfies ResponsibilityRow[]
).map(([id, description]) => ({ description, id }));

const role_responsibilities: RoleResponsibility[] = (
  [
    ['rr1', 'r1', 'resp1'],
    ['rr2', 'r2', 'resp2'],
    ['rr3', 'r3', 'resp3'],
    ['rr4', 'r4', 'resp4'],
    ['rr5', 'r5', 'resp3'],
    ['rr6', 'r6', 'resp5'],
    ['rr7', 'r7', 'resp5'],
    ['rr8', 'r8', 'resp6'],
    ['rr9', 'r9', 'resp7'],
    ['rr10', 'r10', 'resp8'],
    ['rr11', 'r11', 'resp5'],
    ['rr12', 'r12', 'resp9'],
    ['rr13', 'r13', 'resp10'],
    ['rr14', 'r14', 'resp11'],
    ['rr15', 'r15', 'resp12'],
    ['rr16', 'r16', 'resp14'],
    ['rr17', 'r17', 'resp13'],
    ['rr18', 'r18', 'resp13'],
    ['rr19', 'r19', 'resp10'],
  ] satisfies RoleResponsibilityRow[]
).map(([id, role_id, responsibility_id]) => ({
  id,
  responsibility_id,
  role_id,
}));

const performance_reviews: PerformanceReview[] = (
  [
    ['pr1', 'eh1', 'positive', 'Excellent leadership and strategic vision'],
    [
      'pr2',
      'eh2',
      'positive',
      'Strong technical leadership and team management',
    ],
    [
      'pr3',
      'eh3',
      'positive',
      'Outstanding marketing campaigns and ROI improvements',
    ],
    ['pr4', 'eh5', 'positive', 'Solid technical contributions and mentoring'],
    [
      'pr5',
      'eh6',
      'positive',
      'Great product intuition and strategic thinking',
    ],
    [
      'pr6',
      'eh7',
      'positive',
      'Excellent user experience designs and team collaboration',
    ],
    [
      'pr7',
      'eh8',
      'neutral',
      'Good performance, needs improvement in client communication',
    ],
    [
      'pr8',
      'eh9',
      'positive',
      'Thorough testing processes and quality improvements',
    ],
    [
      'pr9',
      'eh12',
      'positive',
      'Strong financial management and cost optimization',
    ],
    [
      'pr10',
      'eh13',
      'positive',
      'Effective HR policies and employee satisfaction improvements',
    ],
  ] satisfies ReviewRow[]
).map(([id, employment_id, outcome, notes]) => ({
  date: '2023-06-15',
  employment_id,
  id,
  notes,
  outcome,
}));

const employment_history: EmploymentHistory[] = (
  [
    ['eh1', 'p1', 'r1', 'org1', 350000, 'full_time'],
    ['eh2', 'p2', 'r2', 'org2', 220000, 'full_time'],
    ['eh3', 'p3', 'r4', 'org3', 180000, 'full_time'],
    ['eh5', 'p4', 'r5', 'org2', 145000, 'full_time'],
    ['eh6', 'p5', 'r3', 'org2', 110000, 'full_time'],
    ['eh7', 'p6', 'r6', 'org4', 210000, 'full_time'],
    ['eh8', 'p7', 'r7', 'org4', 125000, 'full_time'],
    ['eh9', 'p8', 'r8', 'org3', 105000, 'full_time'],
    ['eh10', 'p9', 'r9', 'org2', 95000, 'full_time'],
    ['eh11', 'p10', 'r10', 'org5', 180000, 'contracted'],
    ['eh12', 'p11', 'r8', 'org3', 65000, 'part_time'],
    ['eh13', 'p12', 'r12', 'org6', 215000, 'full_time'],
    ['eh14', 'p13', 'r13', 'org6', 110000, 'full_time'],
    ['eh15', 'p14', 'r14', 'org2', 135000, 'full_time'],
    ['eh16', 'p15', 'r15', 'org3', 92000, 'full_time'],
    ['eh17', 'p16', 'r16', 'org5', 200000, 'contracted'],
    ['eh18', 'p17', 'r17', 'org2', 140000, 'full_time'],
    ['eh19', 'p18', 'r18', 'org2', 98000, 'full_time'],
    ['eh20', 'p19', 'r19', 'org6', 75000, 'full_time'],
  ] satisfies EmploymentRow[]
).map(([id, person_id, role_id, organization_id, salary, type]) => ({
  end_date: null,
  id,
  is_current: true,
  organization_id,
  person_id,
  role_id,
  salary,
  start_date: '2023-01-01',
  type,
}));

const supervisors: Supervisor[] = (
  [
    ['eh2', 'eh1'],
    ['eh3', 'eh1'],
    ['eh7', 'eh1'],
    ['eh13', 'eh1'],
    ['eh5', 'eh2'],
    ['eh6', 'eh2'],
    ['eh10', 'eh2'],
    ['eh15', 'eh2'],
    ['eh18', 'eh2'],
    ['eh19', 'eh18'],
    ['eh8', 'eh7'],
    ['eh9', 'eh3'],
    ['eh12', 'eh3'],
    ['eh16', 'eh3'],
    ['eh14', 'eh13'],
    ['eh20', 'eh13'],
    ['eh17', 'eh11'],
  ] satisfies SupervisorRow[]
).map(([employee_id, supervisor_id]) => ({ employee_id, supervisor_id }));

const collaborations: Collaboration[] = (
  [
    ['eh18', 'eh11'],
    ['eh14', 'eh17'],
  ] satisfies CollaborationRow[]
).map(([internal_id, external_id]) => ({ external_id, internal_id }));

const organization_relationships: OrganizationRelationship[] = (
  [
    ['or1', 'org1', 'org2', 'division'],
    ['or2', 'org1', 'org3', 'division'],
    ['or3', 'org1', 'org4', 'division'],
    ['or4', 'org1', 'org6', 'division'],
    ['or5', 'org1', 'org5', 'external_partnership'],
  ] satisfies OrganizationRelationshipRow[]
).map(([id, parent_id, child_id, relationship_type]) => ({
  child_id,
  id,
  parent_id,
  relationship_type,
}));

export const MOCK_DATA: OrganizationalData = {
  collaborations,
  employment_history,
  organization_relationships,
  organizations,
  people,
  performance_reviews,
  responsibilities,
  role_responsibilities,
  roles,
  supervisors,
};

export const findById = <T extends { id: string }>(
  table: T[],
  id: string
): T | undefined => table.find((item) => item.id === id);
