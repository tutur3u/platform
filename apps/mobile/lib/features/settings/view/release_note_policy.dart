class ReleaseNotePolicy {
  ReleaseNotePolicy._();

  // Keep aligned with packages/utils/src/release-note-policy.json; shared
  // fixtures exercise the Node, web, and installed-history renderers.
  static final _patterns = <RegExp>[
    RegExp(
      '^merge (?:remote-tracking )?(?:branch(?:es)?|tag|commit) '
      r'[\x27\x22][^\x27\x22\n]+[\x27\x22](?: (?:and [\x27\x22][^'
      r'\x27\x22\n]+[\x27\x22]|of \S+|into (?:[\x27\x22][^\x27\x22\n]+[\'
      r'x27\x22]|\S+)))*$',
      caseSensitive: false,
    ),
    RegExp(r'^merge pull request #\d+ from \S+$', caseSensitive: false),
    RegExp(
      '^merge (?:current |latest )?(?:main|production|origin/(?:'
      r'main|production|release-please--branches--\S+))(?: (?:int'
      r'o|to) (?:main|production))?$',
      caseSensitive: false,
    ),
    RegExp(
      '^(?:sync|synchronize) (?:current |latest )?(?:main|produc'
      r'tion)(?: (?:to|into|with|from) (?:main|production))$',
      caseSensitive: false,
    ),
    RegExp(
      r'^address review and integrate current main$',
      caseSensitive: false,
    ),
  ];

  static bool isBookkeeping(String subject) {
    final description = subject
        .replaceFirst(RegExp(r'^\w+(?:\([^)]*\))?!?:\s*'), '')
        .replaceFirst(RegExp(r'^\*\*[^*]+:\*\*\s*'), '')
        .replaceFirst(RegExp(r'\s*\(#\d+\)$'), '')
        .replaceAll(
          RegExp(
            r'\s*\(\[[^\]]+\]\(https://github\.com/tutur3u/platform/'
            r'(?:commit|issues|pull)/[^)]+\)\)',
          ),
          '',
        )
        .trim();
    return _patterns.any((pattern) => pattern.hasMatch(description));
  }
}
