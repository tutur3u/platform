export interface Organization {
  id: string;
  name: string;
  description: string;
  color?: string;
  bgColor?: string;
}

export interface Person {
  id: string;
  fullName: string;
  email: string;
  photoUrl: string;
}

export interface Role {
  id: string;
  name: string;
}

export interface Responsibility {
  id: string;
  description: string;
}

export interface RoleResponsibility {
  id: string;
  role_id: string;
  responsibility_id: string;
}

export interface PerformanceReview {
  id: string;
  employment_id: string;
  date: string;
  outcome: 'positive' | 'negative' | 'neutral';
  notes: string;
}

export interface EmploymentHistory {
  id: string;
  person_id: string;
  role_id: string;
  organization_id: string;
  salary: number;
  start_date: string;
  end_date?: string | null;
  type: 'full_time' | 'part_time' | 'contracted';
  is_current: boolean;
}

export interface Supervisor {
  employee_id: string;
  supervisor_id: string;
}

export interface Collaboration {
  internal_id: string;
  external_id: string;
}

export interface OrganizationRelationship {
  id: string;
  parent_id: string;
  child_id: string;
  relationship_type: string;
}

// Extended employment for rendering with computed properties
export interface EmploymentNode extends EmploymentHistory {
  children: EmploymentNode[];
  depth: number;
  siblings: EmploymentNode[];
  relX: number;
  relY: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DepartmentLayout {
  nodes: EmploymentNode[];
  width: number;
  height: number;
  x: number;
  y: number;
  offsetX: number;
}

export interface ChatMessage {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: Date;
}

export interface OrganizationalData {
  organizations: Organization[];
  people: Person[];
  roles: Role[];
  responsibilities: Responsibility[];
  role_responsibilities: RoleResponsibility[];
  performance_reviews: PerformanceReview[];
  employment_history: EmploymentHistory[];
  supervisors: Supervisor[];
  collaborations: Collaboration[];
  organization_relationships: OrganizationRelationship[];
}

export type ModalDataType = 'organizations' | 'roles' | 'org_relationships';
