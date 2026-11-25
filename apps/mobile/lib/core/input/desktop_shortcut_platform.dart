import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';

/// Whether application-level keyboard chords are bound on this platform.
///
/// Only desktop operating systems qualify, including a desktop browser. A
/// hardware keyboard attached to a phone or tablet, or a mobile browser, must
/// not trigger routed commands.
bool supportsDesktopShortcuts([TargetPlatform? platform]) =>
    switch (platform ?? defaultTargetPlatform) {
      TargetPlatform.macOS ||
      TargetPlatform.windows ||
      TargetPlatform.linux => true,
      TargetPlatform.iOS ||
      TargetPlatform.android ||
      TargetPlatform.fuchsia => false,
    };

/// Whether the primary focus is inside a text field, where a chord belongs to
/// text editing and the input method rather than to application commands.
bool isTextEditingFocused() {
  final context = FocusManager.instance.primaryFocus?.context;
  return context != null &&
      (context.widget is EditableText ||
          context.findAncestorWidgetOfExactType<EditableText>() != null);
}
