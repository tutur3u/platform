import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';

/// Reports laid-out height without measuring text or guessing shell slot width.
class AssistantComposerSizeReporter extends SingleChildRenderObjectWidget {
  const AssistantComposerSizeReporter({
    required this.onHeightChanged,
    required super.child,
    super.key,
  });

  final ValueChanged<double>? onHeightChanged;

  @override
  RenderObject createRenderObject(BuildContext context) =>
      _ComposerSizeReporter(onHeightChanged);

  @override
  void updateRenderObject(
    BuildContext context,
    covariant RenderObject renderObject,
  ) {
    (renderObject as _ComposerSizeReporter).onHeightChanged = onHeightChanged;
  }
}

class _ComposerSizeReporter extends RenderProxyBox {
  _ComposerSizeReporter(this.onHeightChanged);

  ValueChanged<double>? onHeightChanged;
  double? _height;

  @override
  void performLayout() {
    super.performLayout();
    if (_height == size.height) return;
    _height = size.height;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (attached) onHeightChanged?.call(size.height);
    });
  }
}
