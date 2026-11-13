# Behavior verification

Reviewed abridgment of upstream testing.md.

Verify accessible roles, names, state and relationships. Exercise Tab/Shift+Tab,
arrows, Home/End, Enter/Space, Escape, disabled items and focus return. Check
controlled updates, canceled changes, server rendering, hydration, right-to-left
layout and cleanup. Assertions must fail when the protected behavior breaks;
include negative cases. A discovered regression remains a failing requirement,
not an expected-failure shortcut. DOM tests do not prove browser layout, contrast
or assistive-technology announcement timing.
