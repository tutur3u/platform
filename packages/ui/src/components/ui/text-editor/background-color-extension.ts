import { Extension } from '@tiptap/core';

export interface BackgroundColorOptions {
  types: string[];
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    backgroundColor: {
      setBackgroundColor: (color: string) => ReturnType;
      unsetBackgroundColor: () => ReturnType;
    };
  }
}

export const BackgroundColor = Extension.create<BackgroundColorOptions>({
  name: 'backgroundColor',

  addOptions() {
    return {
      types: ['textStyle'],
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          backgroundColor: {
            default: null,
            parseHTML: (element) =>
              element.style.getPropertyValue('background-color') || null,
            renderHTML: (attributes) => {
              if (!attributes.backgroundColor) return {};

              return {
                style: `background-color: ${attributes.backgroundColor}`,
              };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setBackgroundColor:
        (color) =>
        ({ chain }) =>
          chain().setMark('textStyle', { backgroundColor: color }).run(),
      unsetBackgroundColor:
        () =>
        ({ chain }) =>
          chain()
            .setMark('textStyle', { backgroundColor: null })
            .removeEmptyTextStyle()
            .run(),
    };
  },
});
