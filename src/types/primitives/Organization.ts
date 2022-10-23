import { Project } from './Project';

export interface Organization {
  id: string;
  name?: string;
  projects?: Project[];
}
