'use client';

import { ReactFlowProvider } from '@xyflow/react';
import {
  MindCanvasInner,
  type MindCanvasInnerProps,
} from './mind-canvas-inner';

export function MindCanvas(props: MindCanvasInnerProps) {
  return (
    <ReactFlowProvider>
      <MindCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
