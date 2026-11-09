import { create } from 'zustand';
import type { Visualization } from '../types/visualizations';

interface VisualizationStoreState {
  visualizations: Visualization[];
  maxVisualizations: number;
  nextSide: 'left' | 'right';
  centerVisualization: Visualization | null;

  // Add a new visualization (returns the generated ID)
  addVisualization: (
    vis: Omit<Visualization, 'id' | 'createdAt' | 'dismissed' | 'side'>
  ) => string;

  // Set the center visualization (replaces previous, only one at a time)
  setCenterVisualization: (
    vis: Omit<Visualization, 'id' | 'createdAt' | 'dismissed' | 'side'> | null
  ) => string | null;

  // Mark a visualization as dismissed (triggers exit animation)
  dismissVisualization: (id: string) => void;

  // Dismiss the center visualization
  dismissCenterVisualization: () => void;

  // Dismiss all active visualizations (including center)
  dismissAllVisualizations: () => void;

  // Remove a visualization from the array (call after exit animation)
  removeVisualization: (id: string) => void;

  // Remove the center visualization after animation
  removeCenterVisualization: () => void;

  // Clear all visualizations immediately
  clearAllVisualizations: () => void;
}

export const useVisualizationStore = create<VisualizationStoreState>(
  (set, get) => ({
    visualizations: [],
    maxVisualizations: 5,
    nextSide: 'left' as const,
    centerVisualization: null,

    addVisualization: (vis) => {
      const id = crypto.randomUUID();
      const currentSide = get().nextSide;
      const newVis: Visualization = {
        ...vis,
        id,
        createdAt: Date.now(),
        dismissed: false,
        side: currentSide,
      } as Visualization;

      set((state) => ({
        visualizations: [
          newVis,
          ...state.visualizations
            .filter((v) => !v.dismissed)
            .slice(0, state.maxVisualizations - 1),
        ],
        // Alternate side for next visualization
        nextSide: currentSide === 'left' ? 'right' : 'left',
      }));

      return id;
    },

    setCenterVisualization: (vis) => {
      if (vis === null) {
        set({ centerVisualization: null });
        return null;
      }

      const id = crypto.randomUUID();
      const newVis: Visualization = {
        ...vis,
        id,
        createdAt: Date.now(),
        dismissed: false,
        side: 'center',
      } as Visualization;

      set({ centerVisualization: newVis });
      return id;
    },

    dismissVisualization: (id) => {
      set((state) => ({
        visualizations: state.visualizations.map((v) =>
          v.id === id ? { ...v, dismissed: true } : v
        ),
      }));
    },

    dismissCenterVisualization: () => {
      set((state) => ({
        centerVisualization: state.centerVisualization
          ? { ...state.centerVisualization, dismissed: true }
          : null,
      }));
    },

    dismissAllVisualizations: () => {
      set((state) => ({
        visualizations: state.visualizations.map((v) => ({
          ...v,
          dismissed: true,
        })),
        centerVisualization: state.centerVisualization
          ? { ...state.centerVisualization, dismissed: true }
          : null,
      }));
    },

    removeVisualization: (id) => {
      set((state) => ({
        visualizations: state.visualizations.filter((v) => v.id !== id),
      }));
    },

    removeCenterVisualization: () => {
      set({ centerVisualization: null });
    },

    clearAllVisualizations: () => {
      set({ visualizations: [], centerVisualization: null });
    },
  })
);
