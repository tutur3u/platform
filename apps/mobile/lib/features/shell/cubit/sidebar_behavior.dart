enum SidebarBehavior {
  expanded,
  collapsed,
  hover,
  minimal;

  static SidebarBehavior? parse(Object? value) => switch (value) {
    'expanded' => expanded,
    'collapsed' => collapsed,
    'hover' => hover,
    'minimal' || 'hidden' => minimal,
    _ => null,
  };

  bool get opensAsOverlay => this == hover || this == minimal;

  SidebarBehavior get toggled => switch (this) {
    expanded || minimal => collapsed,
    collapsed || hover => expanded,
  };
}
