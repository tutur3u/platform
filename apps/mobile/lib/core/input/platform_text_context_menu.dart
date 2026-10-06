import 'package:flutter/cupertino.dart' as cupertino;
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart' as material;
import 'package:flutter/widgets.dart'
    show
        BuildContext,
        EditableTextContextMenuBuilder,
        EditableTextState,
        TextSelectionControls;

EditableTextContextMenuBuilder platformTextContextMenuBuilder() {
  return (BuildContext context, EditableTextState editableTextState) {
    switch (defaultTargetPlatform) {
      case TargetPlatform.iOS:
      case TargetPlatform.macOS:
        return cupertino.CupertinoAdaptiveTextSelectionToolbar.editableText(
          editableTextState: editableTextState,
        );
      case TargetPlatform.android:
      case TargetPlatform.fuchsia:
      case TargetPlatform.linux:
      case TargetPlatform.windows:
        return material.AdaptiveTextSelectionToolbar.editableText(
          editableTextState: editableTextState,
        );
    }
  };
}

/// Native handles without the deprecated toolbar-building controls path.
/// Keep capability checks on EditableText, including obscured/read-only fields.
TextSelectionControls platformTextSelectionControls() {
  return switch (defaultTargetPlatform) {
    TargetPlatform.iOS => cupertino.cupertinoTextSelectionHandleControls,
    TargetPlatform.macOS =>
      cupertino.cupertinoDesktopTextSelectionHandleControls,
    TargetPlatform.android ||
    TargetPlatform.fuchsia => material.materialTextSelectionHandleControls,
    TargetPlatform.linux ||
    TargetPlatform.windows => material.desktopTextSelectionHandleControls,
  };
}
