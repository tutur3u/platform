import { Workspace } from '../types/primitives/Workspace';

export const getUsersLabel = (ws: Workspace) =>
  !ws?.preset || ws?.preset === 'ALL' || ws?.preset === 'GENERAL'
    ? 'Users'
    : ws?.preset === 'EDUCATION'
    ? 'Students'
    : ws?.preset === 'PHARMACY'
    ? 'Patients'
    : 'Users';
