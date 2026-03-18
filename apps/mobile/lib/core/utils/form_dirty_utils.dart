class FormDirtyUtils {
  const FormDirtyUtils._();

  static String? normalizeOptionalText(String value) {
    final trimmed = value.trim();
    if (trimmed.isEmpty) {
      return null;
    }
    return trimmed;
  }

  static bool sameUnorderedValues<T>(Set<T> left, Set<T> right) {
    if (left.length != right.length) {
      return false;
    }

    for (final value in left) {
      if (!right.contains(value)) {
        return false;
      }
    }

    return true;
  }

  static bool sameMoment(DateTime? left, DateTime? right) {
    if (left == null || right == null) {
      return left == right;
    }

    return left.isAtSameMomentAs(right);
  }
}
