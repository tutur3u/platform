import { type RefObject, useCallback, useEffect } from 'react';
import { findById } from '../../mock-data';
import type {
  DepartmentLayout,
  EmploymentNode,
  OrganizationalData,
} from '../../types';
import { CHART_CONFIG, EXECUTIVE_ORG_IDS } from '../constants';
import { useThemeColors } from './use-theme-colors';

interface UseCanvasRendererProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  data: OrganizationalData;
  nodes: EmploymentNode[];
  departmentLayouts: Record<string, DepartmentLayout>;
  images: Record<string, HTMLImageElement>;
  scale: number;
  offsetX: number;
  offsetY: number;
  selectedEmployeeId?: string;
}

/**
 * Custom hook for canvas rendering operations
 * Handles all drawing logic for the organizational chart
 */
export function useCanvasRenderer({
  canvasRef,
  data,
  nodes,
  departmentLayouts,
  images,
  scale,
  offsetX,
  offsetY,
  selectedEmployeeId,
}: UseCanvasRendererProps) {
  const themeColors = useThemeColors();
  const setupCanvas = useCallback(
    (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();

      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;

      ctx.scale(dpr, dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      return { width: rect.width, height: rect.height };
    },
    []
  );

  const drawDepartmentBoxes = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      for (const orgId in departmentLayouts) {
        const org = findById(data.organizations, orgId);
        if (!org || (EXECUTIVE_ORG_IDS as readonly string[]).includes(orgId))
          continue;

        const layout = departmentLayouts[orgId];

        // Department background
        ctx.fillStyle = org.bgColor || themeColors.muted;
        ctx.strokeStyle = org.color || themeColors.border;
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);

        ctx.beginPath();
        ctx.roundRect(layout.x, layout.y, layout.width, layout.height, 10);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);

        // Department title
        ctx.fillStyle = org.color || themeColors.textPrimary;
        ctx.font = 'bold 16px Inter';
        ctx.textAlign = 'left';
        ctx.fillText(org.name, layout.x + 20, layout.y + 25);
      }
    },
    [data.organizations, departmentLayouts, themeColors]
  );

  const drawConnections = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      // Draw collaborations (dashed lines)
      ctx.strokeStyle = themeColors.collaborationLine;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);

      data.collaborations.forEach((collaboration) => {
        const internalNode = nodes.find(
          (n) => n.id === collaboration.internal_id
        );
        const externalNode = nodes.find(
          (n) => n.id === collaboration.external_id
        );

        if (internalNode && externalNode) {
          const startX = internalNode.x + internalNode.width / 2;
          const startY = internalNode.y + internalNode.height / 2;
          const endX = externalNode.x + externalNode.width / 2;
          const endY = externalNode.y + externalNode.height / 2;

          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.lineTo(endX, endY);
          ctx.stroke();
        }
      });

      ctx.setLineDash([]);

      // Draw reporting lines (solid lines)
      ctx.strokeStyle = themeColors.reportingLine;
      ctx.lineWidth = 2;

      data.supervisors.forEach((supervisor) => {
        const empNode = nodes.find((n) => n.id === supervisor.employee_id);
        const supNode = nodes.find((n) => n.id === supervisor.supervisor_id);

        if (empNode && supNode) {
          const startX = supNode.x + supNode.width / 2;
          const startY = supNode.y + supNode.height;
          const endX = empNode.x + empNode.width / 2;
          const endY = empNode.y;
          const midY = startY + (endY - startY) / 2;

          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.lineTo(startX, midY);
          ctx.lineTo(endX, midY);
          ctx.lineTo(endX, endY);
          ctx.stroke();
        }
      });
    },
    [data.collaborations, data.supervisors, nodes, themeColors]
  );

  const drawProfileImage = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      personId: string,
      x: number,
      y: number,
      size: number
    ) => {
      const img = images[personId];
      if (img) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2, true);
        ctx.clip();
        ctx.drawImage(img, x, y, size, size);
        ctx.restore();
      }
    },
    [images]
  );

  const drawEmployeeNodes = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      nodes.forEach((node) => {
        const person = findById(data.people, node.person_id);
        const role = findById(data.roles, node.role_id);
        const org = findById(data.organizations, node.organization_id);

        if (!person || !role || !org) return;

        ctx.save();
        ctx.translate(node.x, node.y);

        const isSelected = selectedEmployeeId === node.id;

        // Node background with shadow
        ctx.fillStyle = themeColors.cardBackground;
        ctx.strokeStyle = isSelected
          ? themeColors.selectedBorder
          : themeColors.cardBorder;
        ctx.lineWidth = isSelected ? 4 : 2;

        ctx.shadowColor = themeColors.shadow;
        ctx.shadowBlur = CHART_CONFIG.SHADOW_BLUR;
        ctx.shadowOffsetY = CHART_CONFIG.SHADOW_OFFSET_Y;

        ctx.beginPath();
        ctx.roundRect(
          0,
          0,
          node.width,
          node.height,
          CHART_CONFIG.BORDER_RADIUS
        );
        ctx.fill();

        ctx.shadowColor = 'transparent';
        ctx.stroke();

        // Organization color bar
        ctx.fillStyle = org.color || themeColors.primary;
        ctx.beginPath();
        ctx.roundRect(0, 0, 6, node.height, [
          CHART_CONFIG.BORDER_RADIUS,
          0,
          0,
          CHART_CONFIG.BORDER_RADIUS,
        ]);
        ctx.fill();

        // Profile image
        drawProfileImage(ctx, person.id, 15, 20, 40);

        // Name
        ctx.fillStyle = themeColors.textPrimary;
        ctx.font = 'bold 14px Inter';
        ctx.textAlign = 'left';
        ctx.fillText(person.fullName, 65, 35, node.width - 70);

        // Role
        ctx.fillStyle = themeColors.textSecondary;
        ctx.font = '12px Inter';
        ctx.fillText(role.name, 65, 55, node.width - 70);

        ctx.restore();
      });
    },
    [
      nodes,
      data.people,
      data.roles,
      data.organizations,
      selectedEmployeeId,
      drawProfileImage,
      themeColors,
    ]
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    try {
      const { width, height } = setupCanvas(canvas, ctx);

      // Clear canvas
      ctx.clearRect(0, 0, width, height);

      // Apply transformations
      ctx.save();
      ctx.translate(offsetX, offsetY);
      ctx.scale(scale, scale);

      // Draw in order: departments → connections → nodes
      drawDepartmentBoxes(ctx);
      drawConnections(ctx);
      drawEmployeeNodes(ctx);

      ctx.restore();
    } catch (error) {
      console.error('Canvas drawing error:', error);
    }
  }, [
    canvasRef,
    setupCanvas,
    offsetX,
    offsetY,
    scale,
    drawDepartmentBoxes,
    drawConnections,
    drawEmployeeNodes,
  ]);

  // Auto-redraw when dependencies change
  useEffect(() => {
    draw();
  }, [draw]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      // Debounce resize events
      setTimeout(draw, 100);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

  return { draw };
}
