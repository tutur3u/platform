import { create } from 'zustand';
import type { Visualization } from '../types/visualizations';

interface VisualizationStoreState {
  visualizations: Visualization[];
  maxVisualizations: number;
  nextSide: 'left' | 'right';

  // Add a new visualization (returns the generated ID)
  addVisualization: (
    vis: Omit<Visualization, 'id' | 'createdAt' | 'dismissed' | 'side'>
  ) => string;

  // Mark a visualization as dismissed (triggers exit animation)
  dismissVisualization: (id: string) => void;

  // Dismiss all active visualizations
  dismissAllVisualizations: () => void;

  // Remove a visualization from the array (call after exit animation)
  removeVisualization: (id: string) => void;

  // Clear all visualizations immediately
  clearAllVisualizations: () => void;
}

export const useVisualizationStore = create<VisualizationStoreState>(
  (set, get) => ({
    visualizations: [],
    maxVisualizations: 5,
    nextSide: 'left' as const,

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

    dismissVisualization: (id) => {
      set((state) => ({
        visualizations: state.visualizations.map((v) =>
          v.id === id ? { ...v, dismissed: true } : v
        ),
      }));
    },

    dismissAllVisualizations: () => {
      set((state) => ({
        visualizations: state.visualizations.map((v) => ({
          ...v,
          dismissed: true,
        })),
      }));
    },

    removeVisualization: (id) => {
      set((state) => ({
        visualizations: state.visualizations.filter((v) => v.id !== id),
      }));
    },

    clearAllVisualizations: () => {
      set({ visualizations: [] });
    },
  })
);
