/**
 * Shared focus treatment for form fields (inputs, textareas, select and
 * combobox triggers, field-shaped buttons).
 *
 * A mouse, pen or touch focus only firms up the border toward the theme ring;
 * keyboard focus adds the full `--ring` edge and a soft halo from the same
 * token. `focus-visible:` is gated on keyboard navigation in `globals.css`, so
 * no ring or outline ever follows a click or tap. Invalid fields swap the ring
 * token for the destructive one.
 */
export const fieldFocusClassName =
  'focus:border-ring/60 focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/25 aria-invalid:focus:border-destructive aria-invalid:focus-visible:ring-destructive/20 dark:aria-invalid:focus-visible:ring-destructive/40';
