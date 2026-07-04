import Highlight from '@tiptap/extension-highlight';

export const ThemeAwareHighlight = Highlight.extend({
  addAttributes() {
    return {
      ...(this.parent?.() ?? {}),
      textColor: {
        default: null,
        parseHTML: (element) => element.style.getPropertyValue('color') || null,
        renderHTML: (attributes) => {
          if (!attributes.textColor) return {};

          return {
            style: `color: ${attributes.textColor}`,
          };
        },
      },
    };
  },
}).configure({
  multicolor: true,
});
