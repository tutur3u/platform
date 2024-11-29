import { ReactRenderer } from '@tiptap/react'
import tippy from 'tippy.js'
import MentionList from './MentionList';

export default {
  items: ({ query }) => {
    // Filter the list of names based on the user's query
    return [
      'Lea Thompson',
      'Cyndi Lauper',
      'Tom Cruise',
      'Madonna',
      'Jerry Hall',
      'Joan Collins',
      'Winona Ryder',
      'Christina Applegate',
      'Alyssa Milano',
      'Molly Ringwald',
      'Ally Sheedy',
      'Debbie Harry',
      'Olivia Newton-John',
      'Elton John',
      'Michael J. Fox',
      'Axl Rose',
      'Emilio Estevez',
      'Ralph Macchio',
      'Rob Lowe',
      'Jennifer Grey',
      'Mickey Rourke',
      'John Cusack',
      'Matthew Broderick',
      'Justine Bateman',
      'Lisa Bonet',
    ]
      .filter(item => item.toLowerCase().startsWith(query.toLowerCase())) // Filtering by query
      .slice(0, 5);
  },

  render: () => {
    let component;
    let popup;

    return {

      onStart: (props) => {
        // Prevent issues when there's no clientRect available
        if (!props.clientRect) {
          console.error('No clientRect available for mention popup');
          return;
        }

        // Render the mention list component
        component = new ReactRenderer(MentionList, {
          props,
          editor: props.editor,
        });

        // Initialize the Tippy popup with proper settings
        popup = tippy('body', {
          getReferenceClientRect: props.clientRect,
          appendTo: document.body,
          content: component.element,
          showOnCreate: true,
          interactive: true,
          trigger: 'manual',
          placement: 'bottom-start', // Place popup below the reference element
        });
      },

      // onUpdate will update the popup when the query changes or the editor updates
      onUpdate: (props) => {
        if (!props.clientRect) {
          console.error('No clientRect on update');
          return;
        }

        // Update the mention component props when the editor state changes
        component.updateProps(props);

        // Update Tippy popup's position
        popup[0].setProps({
          getReferenceClientRect: props.clientRect,
        });
      },

      // onKeyDown will handle key events (e.g., Esc to close the popup)
      onKeyDown: (props) => {
        // Close the popup if Escape key is pressed
        if (props.event.key === 'Escape') {
          popup[0].hide();
          return true; // Stop the event from propagating further
        }

        // Delegate keydown events to the MentionList component
        return component.ref?.onKeyDown(props);
      },

      // onExit will clean up when the popup is destroyed (e.g., when the editor is destroyed or the user exits)
      onExit: () => {
        // Ensure proper cleanup of popup and component
        if (popup) {
          popup[0].destroy();
        }
        if (component) {
          component.destroy();
        }
      },
    };
  },
}
