import 'package:flutter/cupertino.dart' as cupertino;
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart' as material;
import 'package:flutter/widgets.dart'
    show BuildContext, EditableTextContextMenuBuilder, EditableTextState;

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
