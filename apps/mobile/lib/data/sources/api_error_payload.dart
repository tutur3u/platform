/// Normalizes the issue-array and flattened Zod error contracts used by APIs.
class ApiErrorPayload {
  ApiErrorPayload(Map<String, dynamic>? payload)
    : message =
          _text(payload?['message']) ??
          _text(payload?['error']) ??
          'Request failed',
      validation = _validation(payload?['errors']),
      code = _text(payload?['code']),
      retryAfter = switch (payload?['retryAfter']) {
        final int value when value >= 0 => value,
        _ => null,
      };

  final String message;
  final List<String> validation;
  final String? code;
  final int? retryAfter;

  String get effectiveMessage =>
      validation.isNotEmpty &&
          validation.first.toLowerCase() != message.toLowerCase()
      ? '$message: ${validation.first}'
      : message;

  static String? _text(Object? value) =>
      value is String && value.trim().isNotEmpty ? value.trim() : null;

  static List<String> _validation(Object? value) {
    final result = <String>[];
    void collect(Object? errors) {
      if (errors is! List) return;
      for (final error in errors) {
        final message = _text(error is Map ? error['message'] : error);
        if (message != null) result.add(message);
      }
    }

    if (value is List) {
      collect(value);
    } else if (value is Map) {
      collect(value['formErrors']);
      final fields = value['fieldErrors'];
      if (fields is Map) {
        fields.values.forEach(collect);
      }
    }
    return result;
  }
}
