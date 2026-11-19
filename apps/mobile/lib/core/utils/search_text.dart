const _folds = {
  'a': 'àáạảãâầấậẩẫăằắặẳẵ',
  'e': 'èéẹẻẽêềếệểễ',
  'i': 'ìíịỉĩ',
  'o': 'òóọỏõôồốộổỗơờớợởỡ',
  'u': 'ùúụủũưừứựửữ',
  'y': 'ỳýỵỷỹ',
  'd': 'đ',
};

final Map<String, String> _foldTable = {
  for (final fold in _folds.entries)
    for (final char in fold.value.split('')) char: fold.key,
};

/// Lowercase and strip Vietnamese diacritics so "mui gio" finds "Múi giờ".
/// Keyboards may send decomposed text (a base letter plus combining marks,
/// U+0300 to U+036F); those marks are dropped before the precomposed table.
String foldSearchText(String value) => String.fromCharCodes(
  value.toLowerCase().runes.where((rune) => rune < 0x0300 || rune > 0x036F),
).split('').map((char) => _foldTable[char] ?? char).join().trim();
