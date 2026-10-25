import 'package:flutter/widgets.dart';
import 'package:mobile/features/assistant/bridge/assistant_secret_scan.dart';

export 'package:mobile/features/assistant/bridge/assistant_secret_scan.dart'
    show redactedFieldValue;

/// A visible record Mira may look up with its workspace tools. Ids are hints:
/// the server re-reads every record with the user's own permissions.
class AssistantScreenEntity {
  const AssistantScreenEntity({required this.type, required this.id});

  final String type;
  final String id;

  Map<String, dynamic> toJson() => {'type': type, 'id': id};
}

/// A form field on the current screen. Values are read lazily, only when the
/// user has enabled Live while browsing and Mira asks for screen context.
///
/// The default constructor is for structured values only ([structuredTypes]):
/// it cannot inspect a rendered control, so a value of any other type, or one
/// that does not have its type's shape, is never shared.
class AssistantFormFieldContext {
  const AssistantFormFieldContext({
    required this.key,
    required this.label,
    required String Function() value,
    this.type = 'text',
    this.obscured = false,
  }) : _value = value,
       controller = null;

  /// A text field. Obscuring and keyboard type are read from the rendered
  /// control bound to [controller], not declared by the screen. When no
  /// rendered control uses [controller] (for example a custom widget with its
  /// own internal controller), the value is never shared.
  AssistantFormFieldContext.text({
    required this.key,
    required this.label,
    required TextEditingController this.controller,
  }) : _value = null,
       type = 'text',
       obscured = false;

  final String key;
  final String label;
  final String type;
  final bool obscured;
  final TextEditingController? controller;
  final String Function()? _value;

  static const structuredTypes = {'boolean', 'date', 'time', 'datetime'};

  String read() => controller?.text ?? _value?.call() ?? '';
}

final _timeShape = RegExp(r'^\d{1,2}:\d{2}(:\d{2})?$');

/// Whether a structured field's value has its declared type's shape.
bool _hasStructuredShape(String type, String value) => switch (type) {
  'boolean' => value == 'true' || value == 'false',
  'date' || 'datetime' => DateTime.tryParse(value) != null,
  'time' => _timeShape.hasMatch(value),
  _ => false,
};

class AssistantScreenContextEntry {
  const AssistantScreenContextEntry({
    this.entities = const [],
    this.formTitle,
    this.fields = const [],
  });

  final List<AssistantScreenEntity> entities;
  final String? formTitle;
  final List<AssistantFormFieldContext> fields;
}

/// Metadata of the rendered text control bound to a field's controller.
class AssistantFieldControl {
  const AssistantFieldControl({
    required this.obscureText,
    required this.keyboardType,
  });

  final bool obscureText;
  final TextInputType keyboardType;
}

const _maxEntities = 20;
const _maxFields = 30;
const _maxValueLength = 500;
// Each ordered field pair is also scanned across its boundary, so a secret
// split over two fields is found; the window bounds that work.
const _crossFieldWindow = 256;
const _sensitiveTypes = {'password', 'visiblepassword', 'secret', 'pin', 'otp'};

final _sensitiveName = RegExp(
  'pass(word|code|phrase)?|secret|token|otp|pin|cvv|cvc|card|iban|'
  'account.?number|ssn|api.?key|private',
  caseSensitive: false,
);

String _normalizeType(String type) =>
    type.replaceAll(RegExp('[^A-Za-z]'), '').toLowerCase();

String _keyboardTypeName(TextInputType type) =>
    (type.toJson()['name'] as String? ?? 'text').split('.').last;

/// Whether a field's value must never be shared. [control] comes from the
/// rendered widget, so a misleading key or label cannot unredact it.
bool isSensitiveAssistantField(
  AssistantFormFieldContext field, {
  AssistantFieldControl? control,
}) =>
    field.obscured ||
    (control?.obscureText ?? false) ||
    control?.keyboardType == TextInputType.visiblePassword ||
    _sensitiveTypes.contains(_normalizeType(field.type)) ||
    _sensitiveName.hasMatch(field.key) ||
    _sensitiveName.hasMatch(field.label);

typedef _ControlLookup =
    AssistantFieldControl? Function(TextEditingController controller);

class _Registration {
  _Registration(this.entry, this.isVisible, this.lookup);

  AssistantScreenContextEntry entry;
  final bool Function() isVisible;
  final _ControlLookup? lookup;
}

/// Screens register what is visible while they are mounted. The most recently
/// registered visible entry describes the foreground screen; offstage shell
/// pages stay mounted but report themselves hidden.
class AssistantScreenContextRegistry {
  AssistantScreenContextRegistry._();

  static final instance = AssistantScreenContextRegistry._();

  final _entries = <Object, _Registration>{};

  void Function() register(
    Object owner,
    AssistantScreenContextEntry entry, {
    bool Function()? isVisible,
    AssistantFieldControl? Function(TextEditingController)? lookupControl,
  }) {
    _entries.remove(owner);
    final registration = _Registration(
      entry,
      isVisible ?? () => true,
      lookupControl,
    );
    _entries[owner] = registration;
    return () {
      if (identical(_entries[owner], registration)) _entries.remove(owner);
    };
  }

  void update(Object owner, AssistantScreenContextEntry entry) {
    _entries[owner]?.entry = entry;
  }

  /// Bounded, redacted snapshot of the foreground entry.
  Map<String, dynamic> snapshot() {
    final visible = _entries.values.where((item) => item.isVisible());
    if (visible.isEmpty) return const {};
    final registration = visible.last;
    final entry = registration.entry;
    final result = <String, dynamic>{};
    if (entry.entities.isNotEmpty) {
      result['visibleRecords'] = [
        for (final entity in entry.entities.take(_maxEntities)) entity.toJson(),
      ];
    }
    if (entry.fields.isNotEmpty) {
      result['form'] = {
        if (entry.formTitle != null) 'title': entry.formTitle,
        'fields': _fieldsJson(
          entry.fields.take(_maxFields).toList(),
          registration.lookup,
        ),
      };
    }
    return result;
  }

  List<Map<String, dynamic>> _fieldsJson(
    List<AssistantFormFieldContext> fields,
    _ControlLookup? lookup,
  ) {
    final rows = <Map<String, dynamic>>[];
    // Free-text values only: structured values are shape-checked, and joining
    // dates or booleans would make spurious card or token runs.
    final sharedText = <int, String>{};
    final sharedRaw = <String>[];
    for (final (index, field) in fields.indexed) {
      final controller = field.controller;
      final control = controller == null ? null : lookup?.call(controller);
      final value = _shareableValue(field, control);
      if (value != null && field.controller != null) {
        // What is actually sent: the bounded prefix without the ellipsis.
        sharedText[index] = _prefix(value);
        sharedRaw.add(value);
      }
      rows.add({
        'key': field.key,
        'label': field.label,
        'type': control == null
            ? field.type
            : _keyboardTypeName(control.keyboardType),
        'value': value == null ? redactedFieldValue : _bounded(value),
      });
    }
    // Fail closed: a secret only visible across fields redacts every text
    // field that was going to be shared.
    if (_secretAcrossFields(sharedText.values.toList(), sharedRaw)) {
      for (final index in sharedText.keys) {
        rows[index]['value'] = redactedFieldValue;
      }
    }
    return rows;
  }

  /// The value to share, or null when it must be redacted.
  String? _shareableValue(
    AssistantFormFieldContext field,
    AssistantFieldControl? control,
  ) {
    if (isSensitiveAssistantField(field, control: control)) return null;
    final value = field.read();
    if (field.controller != null) {
      // Without the rendered control, obscuring cannot be verified.
      if (control == null) return null;
    } else if (!_hasStructuredShape(_normalizeType(field.type), value)) {
      return null;
    }
    return assistantTextContainsSecret(value) ? null : value;
  }

  @visibleForTesting
  void clear() => _entries.clear();
}

/// Whether a secret is recoverable only by combining fields. Checks the
/// outgoing prefixes joined in order and in reverse (unbounded: at most
/// 30 x 500 characters), and every ordered pair across its boundary, both for
/// the outgoing prefixes and for the full values.
bool _secretAcrossFields(List<String> outgoing, List<String> raw) {
  if (outgoing.length < 2) return false;
  String head(String value) => value.length <= _crossFieldWindow
      ? value
      : value.substring(0, _crossFieldWindow);
  String tail(String value) => value.length <= _crossFieldWindow
      ? value
      : value.substring(value.length - _crossFieldWindow);
  bool scanAll(String joined) =>
      assistantTextContainsSecret(joined, scanLimit: joined.length);
  if (scanAll(outgoing.join()) || scanAll(outgoing.reversed.join())) {
    return true;
  }
  for (final values in [outgoing, raw]) {
    for (final (i, first) in values.indexed) {
      for (final (j, second) in values.indexed) {
        if (i != j && assistantTextContainsSecret(tail(first) + head(second))) {
          return true;
        }
      }
    }
  }
  return false;
}

String _prefix(String value) => value.length <= _maxValueLength
    ? value
    : value.substring(0, _maxValueLength);

String _bounded(String value) =>
    value.length <= _maxValueLength ? value : '${_prefix(value)}…';

/// Registers [entry] while this widget is mounted.
class AssistantScreenContextScope extends StatefulWidget {
  const AssistantScreenContextScope({
    required this.entry,
    required this.child,
    this.isCurrentScope,
    super.key,
  });

  final AssistantScreenContextEntry entry;
  final Widget child;

  /// Checked on every snapshot, before reading this scope's records or fields.
  final bool Function()? isCurrentScope;

  @override
  State<AssistantScreenContextScope> createState() =>
      _AssistantScreenContextScopeState();
}

class _AssistantScreenContextScopeState
    extends State<AssistantScreenContextScope> {
  late final void Function() _unregister;
  bool _tickerEnabled = true;

  @override
  void initState() {
    super.initState();
    _unregister = AssistantScreenContextRegistry.instance.register(
      this,
      widget.entry,
      isVisible: () =>
          mounted && _tickerEnabled && (widget.isCurrentScope?.call() ?? true),
      lookupControl: _lookupControl,
    );
  }

  /// Reads obscuring and keyboard type from the EditableText actually bound
  /// to [controller] in this subtree.
  AssistantFieldControl? _lookupControl(TextEditingController controller) {
    if (!mounted) return null;
    EditableText? found;
    void visit(Element element) {
      if (found != null) return;
      final widget = element.widget;
      if (widget is EditableText && identical(widget.controller, controller)) {
        found = widget;
        return;
      }
      element.visitChildren(visit);
    }

    context.visitChildElements(visit);
    final editable = found;
    if (editable == null) return null;
    return AssistantFieldControl(
      obscureText: editable.obscureText,
      keyboardType: editable.keyboardType,
    );
  }

  @override
  void didUpdateWidget(AssistantScreenContextScope oldWidget) {
    super.didUpdateWidget(oldWidget);
    AssistantScreenContextRegistry.instance.update(this, widget.entry);
  }

  @override
  void dispose() {
    _unregister();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Offstage shell branches disable tickers; rebuilds track the change.
    _tickerEnabled = TickerMode.valuesOf(context).enabled;
    return widget.child;
  }
}
