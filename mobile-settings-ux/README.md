# Mobile settings UX renders

Synthetic fixtures only. 390x844 logical, 2x pixel ratio.

- `before/`: origin/main a0cdd049df, `settings_compact_navigation_test.dart` with SETTINGS_RENDER_DIR.
- `after/`: feat/mobile-settings-pages 7c7405ca72, same test plus `settings_forms_render_test.dart` (DESIGN_RENDER_DIR).
- Device "before" for Finance offline, Mail, Feedback and Settings: the user's iPhone screenshots (not committed).

Key pairs: settings-classic-{light,dark}, settings-{en,vi}-*-large-text, mail-settings-form-{light,dark},
after-only: feedback-{en,vi}-{light,dark}, feedback-errors-*, offline-finance-{en,vi}-{light,dark}, offline-finance-details-*.
