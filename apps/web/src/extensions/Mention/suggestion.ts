import { ReactRenderer } from '@tiptap/react'
import tippy, { Instance as TippyInstance } from 'tippy.js'
import MentionList, { MentionListRef } from './MentionList'

interface MentionPluginProps {
  query: string
  clientRect: DOMRect | null
  editor: any // Type this more specifically based on your editor's instance
  event: React.KeyboardEvent // Use React.KeyboardEvent instead of the native KeyboardEvent
}

export default {
  items: ({ query }: { query: string }): string[] => {
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
      .slice(0, 5)
  },

  render: () => {
    let component: ReactRenderer | null = null
    let popup: TippyInstance[] = []

    return {
      onStart: (props: MentionPluginProps): void => {
        // Prevent issues when there's no clientRect available
        if (!props.clientRect) {
          console.error('No clientRect available for mention popup')
          return
        }

        // Render the mention list component
        component = new ReactRenderer(MentionList, {
          props,
          editor: props.editor,
        })

        // Initialize the Tippy popup with proper settings
        popup = tippy('body', {
          getReferenceClientRect: () => {
            // Return clientRect via a function to satisfy tippy's type requirement
            return props.clientRect as DOMRect
          },
          appendTo: document.body,
          content: component.element,
          showOnCreate: true,
          interactive: true,
          trigger: 'manual',
          placement: 'bottom-start', // Place popup below the reference element
        })
      },

      // onUpdate will update the popup when the query changes or the editor updates
      onUpdate: (props: MentionPluginProps): void => {
        if (!props.clientRect) {
          console.error('No clientRect on update')
          return
        }

        // Update the mention component props when the editor state changes
        component?.updateProps(props)

        // Update Tippy popup's position
        if (popup[0]) {
          popup[0].setProps({
            getReferenceClientRect: () => {
              return props.clientRect as DOMRect
            },
          })
        }
      },

      // onKeyDown will handle key events (e.g., Esc to close the popup)
      onKeyDown: (props: MentionPluginProps): boolean | undefined => {
        // Close the popup if Escape key is pressed
        if (props.event.key === 'Escape') {
          popup[0]?.hide()
          return true // Stop the event from propagating further
        }

        // Ensure that component.ref is typed as MentionListRef so TypeScript can recognize onKeyDown
        if (component?.ref) {
          return (component.ref as MentionListRef).onKeyDown(props)
        }

        return undefined
      },

      // onExit will clean up when the popup is destroyed (e.g., when the editor is destroyed or the user exits)
      onExit: (): void => {
        // Ensure proper cleanup of popup and component
        if (popup[0]) {
          popup[0].destroy()
        }
        if (component) {
          component.destroy()
        }
      },
    }
  },
}
