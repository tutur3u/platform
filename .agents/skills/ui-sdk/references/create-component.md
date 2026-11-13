# Custom behavior

Reviewed abridgment of upstream create-component.md.

Separate framework-independent interaction policy from rendered markup. Define
state, transitions, slots, roles and key maps explicitly. Read current options
inside callbacks rather than capturing stale values. Bind DOM behavior with
cleanup; keep initial attributes safe for server rendering. Keep focus and
selection distinct. Preserve cancellation and controlled-value ownership.
