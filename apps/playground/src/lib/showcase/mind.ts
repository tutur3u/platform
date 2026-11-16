import { hasRoom, SHOWCASE_LIMITS } from './limits';

export type DemoNote = { id: number; title: string; body: string };

export type MindState = {
  notes: DemoNote[];
  selectedId: number | null;
  nextId: number;
};

export type MindAction =
  | { type: 'create' }
  | { type: 'select'; id: number }
  | { type: 'edit'; id: number; title?: string; body?: string }
  | { type: 'remove'; id: number }
  | { type: 'reset' };

export const initialMindState: MindState = {
  notes: [
    {
      id: 1,
      title: 'Product ideas',
      body: 'Offline mode for field teams.\nShared templates for recurring projects.',
    },
    {
      id: 2,
      title: 'Reading list',
      body: 'Shape Up, Basecamp.\nThe Design of Everyday Things.',
    },
  ],
  selectedId: 1,
  nextId: 3,
};

/** Title shown in lists; never empty. */
export function noteDisplayTitle(note: DemoNote): string {
  return note.title.trim() || 'Untitled note';
}

export function mindReducer(state: MindState, action: MindAction): MindState {
  switch (action.type) {
    case 'create':
      if (!hasRoom(state.notes, SHOWCASE_LIMITS.listItems)) return state;
      return {
        notes: [{ id: state.nextId, title: '', body: '' }, ...state.notes],
        selectedId: state.nextId,
        nextId: state.nextId + 1,
      };
    case 'select':
      return state.notes.some((note) => note.id === action.id)
        ? { ...state, selectedId: action.id }
        : state;
    case 'edit':
      return {
        ...state,
        notes: state.notes.map((note) =>
          note.id === action.id
            ? {
                ...note,
                title:
                  action.title === undefined
                    ? note.title
                    : action.title.slice(0, SHOWCASE_LIMITS.titleLength),
                body:
                  action.body === undefined
                    ? note.body
                    : action.body.slice(0, SHOWCASE_LIMITS.bodyLength),
              }
            : note
        ),
      };
    case 'remove': {
      const notes = state.notes.filter((note) => note.id !== action.id);
      return {
        ...state,
        notes,
        selectedId:
          state.selectedId === action.id
            ? (notes[0]?.id ?? null)
            : state.selectedId,
      };
    }
    case 'reset':
      return initialMindState;
  }
}
