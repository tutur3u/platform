import { useCallback, useMemo } from 'react';
import type {
  DepartmentLayout,
  EmploymentNode,
  OrganizationalData,
} from '../../types';
import {
  CHART_CONFIG,
  EXECUTIVE_ORG_IDS,
  EXTERNAL_ORG_IDS,
} from '../constants';

interface UseOrgLayoutReturn {
  nodes: EmploymentNode[];
  departmentLayouts: Record<string, DepartmentLayout>;
  contentBounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
  };
}

/**
 * Custom hook for calculating organizational chart layout
 * Handles hierarchy building, positioning, and department grouping
 */
export function useOrgLayout(data: OrganizationalData): UseOrgLayoutReturn {
  const buildHierarchy = useCallback(() => {
    const currentEmployments = data.employment_history.filter(
      (e) => e.is_current
    );
    const supervisors = data.supervisors;

    // Create base hierarchy structure
    const hierarchy: Record<string, EmploymentNode> = {};
    currentEmployments.forEach((emp) => {
      hierarchy[emp.id] = {
        ...emp,
        children: [],
        depth: 0,
        siblings: [],
        relX: 0,
        relY: 0,
        x: 0,
        y: 0,
        width: CHART_CONFIG.NODE_WIDTH,
        height: CHART_CONFIG.NODE_HEIGHT,
      };
    });

    // Build parent-child relationships
    supervisors.forEach((sup) => {
      const employeeNode = hierarchy[sup.employee_id];
      const supervisorNode = hierarchy[sup.supervisor_id];
      if (supervisorNode && employeeNode) {
        supervisorNode.children.push(employeeNode);
      }
    });

    return hierarchy;
  }, [data.employment_history, data.supervisors]);

  const calculateDepartmentLayouts = useCallback(
    (hierarchy: Record<string, EmploymentNode>) => {
      const departmentLayouts: Record<string, DepartmentLayout> = {};
      const departmentNodesByOrg: Record<string, EmploymentNode[]> = {};

      // Group nodes by organization
      Object.values(hierarchy).forEach((node) => {
        const orgId = node.organization_id;
        if (!departmentNodesByOrg[orgId]) {
          departmentNodesByOrg[orgId] = [];
        }
        departmentNodesByOrg[orgId].push(node);
      });

      // Find root nodes for each organization
      const departmentTrees: Record<string, EmploymentNode[]> = {};
      for (const orgId in departmentNodesByOrg) {
        departmentTrees[orgId] = [];
        departmentNodesByOrg[orgId]?.forEach((node) => {
          const supervisorLink = data.supervisors.find(
            (s) => s.employee_id === node.id
          );
          let isRoot = true;
          if (supervisorLink) {
            const supervisorNode = hierarchy[supervisorLink.supervisor_id];
            if (supervisorNode && supervisorNode.organization_id === orgId) {
              isRoot = false;
            }
          }
          if (isRoot) {
            departmentTrees[orgId]?.push(node);
          }
        });
      }

      // Layout each department
      for (const orgId in departmentTrees) {
        const roots = departmentTrees[orgId];
        const nodesInDept: EmploymentNode[] = [];
        let maxDepth = 0;

        const traverse = (
          node: EmploymentNode,
          depth: number,
          siblings: EmploymentNode[]
        ) => {
          node.depth = depth;
          node.siblings = siblings;
          nodesInDept.push(node);
          maxDepth = Math.max(maxDepth, depth);
          for (const child of node.children) {
            traverse(child, depth + 1, node.children);
          }
        };

        roots?.forEach((root) => {
          traverse(root, 0, roots);
        });

        // Position nodes within department
        const startY = CHART_CONFIG.DEPARTMENT_HEADER;
        let y = startY;
        for (let i = 0; i <= maxDepth; i++) {
          const levelNodes = nodesInDept.filter((n) => n.depth === i);
          const levelWidth =
            levelNodes.length *
              (CHART_CONFIG.NODE_WIDTH + CHART_CONFIG.NODE_H_MARGIN) -
            CHART_CONFIG.NODE_H_MARGIN;
          let x = -levelWidth / 2;
          for (const node of levelNodes) {
            node.relX = x;
            node.relY = y;
            x += CHART_CONFIG.NODE_WIDTH + CHART_CONFIG.NODE_H_MARGIN;
          }
          y += CHART_CONFIG.NODE_HEIGHT + CHART_CONFIG.NODE_V_MARGIN;
        }

        // Calculate department bounds
        const bounds = nodesInDept.reduce(
          (acc, n) => ({
            minX: Math.min(acc.minX, n.relX),
            maxX: Math.max(acc.maxX, n.relX + CHART_CONFIG.NODE_WIDTH),
            maxY: Math.max(acc.maxY, n.relY + CHART_CONFIG.NODE_HEIGHT),
          }),
          { minX: Infinity, maxX: -Infinity, maxY: -Infinity }
        );

        departmentLayouts[orgId] = {
          nodes: nodesInDept,
          width:
            bounds.maxX - bounds.minX + CHART_CONFIG.DEPARTMENT_PADDING * 2,
          height: bounds.maxY + CHART_CONFIG.DEPARTMENT_PADDING * 2,
          x: 0,
          y: 0,
          offsetX: -bounds.minX,
        };
      }

      return departmentLayouts;
    },
    [data.supervisors]
  );

  const positionDepartments = useCallback(
    (departmentLayouts: Record<string, DepartmentLayout>) => {
      const executiveOrgs = EXECUTIVE_ORG_IDS as readonly string[];
      const externalOrgs = EXTERNAL_ORG_IDS as readonly string[];
      const departmentOrgs = Object.keys(departmentLayouts).filter(
        (id) => !executiveOrgs.includes(id) && !externalOrgs.includes(id)
      );

      // Position executive level at top
      const executiveLayout = departmentLayouts[executiveOrgs[0] ?? ''];
      if (executiveLayout) {
        executiveLayout.x = 0;
        executiveLayout.y = 0;
      }

      // Position departments in middle
      const departmentsY =
        (executiveLayout ? executiveLayout.height : 0) +
        CHART_CONFIG.DEPARTMENT_SPACING;
      let currentX = 0;
      for (const orgId of departmentOrgs) {
        const layout = departmentLayouts[orgId];
        if (layout) {
          layout.x = currentX;
          layout.y = departmentsY;
          currentX += layout.width + CHART_CONFIG.DEPARTMENT_H_MARGIN;
        }
      }

      // Position external organizations at bottom
      const externalLayout = departmentLayouts[externalOrgs[0] ?? ''];
      if (externalLayout) {
        const totalDeptWidth = currentX - CHART_CONFIG.DEPARTMENT_H_MARGIN;
        externalLayout.x = totalDeptWidth / 2 - externalLayout.width / 2;
        let maxDeptY = 0;
        departmentOrgs.forEach((id) => {
          const layout = departmentLayouts[id];
          if (layout) {
            maxDeptY = Math.max(maxDeptY, layout.y + layout.height);
          }
        });
        externalLayout.y = maxDeptY + CHART_CONFIG.DEPARTMENT_SPACING;
      }

      return departmentLayouts;
    },
    []
  );

  const setAbsolutePositions = useCallback(
    (departmentLayouts: Record<string, DepartmentLayout>) => {
      const allNodes: EmploymentNode[] = [];
      for (const orgId in departmentLayouts) {
        const layout = departmentLayouts[orgId];
        layout?.nodes.forEach((node) => {
          node.x =
            layout.x +
            node.relX +
            CHART_CONFIG.DEPARTMENT_PADDING +
            layout.offsetX;
          node.y = layout.y + node.relY;
          allNodes.push(node);
        });
      }
      return allNodes;
    },
    []
  );

  const calculateContentBounds = useCallback(
    (departmentLayouts: Record<string, DepartmentLayout>) => {
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;

      for (const orgId in departmentLayouts) {
        const layout = departmentLayouts[orgId];
        if (!layout) continue;
        minX = Math.min(minX, layout.x);
        minY = Math.min(minY, layout.y);
        maxX = Math.max(maxX, layout.x + layout.width);
        maxY = Math.max(maxY, layout.y + layout.height);
      }

      return {
        minX,
        minY,
        maxX,
        maxY,
        width: maxX - minX,
        height: maxY - minY,
      };
    },
    []
  );

  return useMemo(() => {
    const hierarchy = buildHierarchy();
    let departmentLayouts = calculateDepartmentLayouts(hierarchy);
    departmentLayouts = positionDepartments(departmentLayouts);
    const nodes = setAbsolutePositions(departmentLayouts);
    const contentBounds = calculateContentBounds(departmentLayouts);

    return {
      nodes,
      departmentLayouts,
      contentBounds,
    };
  }, [
    buildHierarchy,
    calculateDepartmentLayouts,
    positionDepartments,
    setAbsolutePositions,
    calculateContentBounds,
  ]);
}
