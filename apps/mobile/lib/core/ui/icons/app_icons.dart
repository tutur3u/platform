/// Icon abstraction for the mobile design system.
///
/// [LucideIcons] and `LucideLabIcons` are generated from the exact
/// `lucide-react` and `@lucide/lab` versions the web uses
/// (scripts/mobile-lucide), so names and glyphs match the web: `arrow-right`
/// is `LucideIcons.arrowRight`, lab `apple-core` is
/// `LucideLabIcons.appleCore`. Web aliases (`home` for `house`) are kept.
/// Lucide no longer ships brand marks; [AppIcons] maps the few the app used
/// to neutral glyphs.
library;

import 'package:flutter/widgets.dart';
import 'package:mobile/core/ui/icons/generated/lucide_icons.g.dart';

export 'package:mobile/core/ui/icons/generated/lucide_icons.g.dart';
export 'package:mobile/core/ui/icons/generated/lucide_lab_icons.g.dart';

/// App-owned icon aliases: semantic names for repeated actions plus neutral
/// fallbacks for brand marks Lucide no longer ships.
abstract final class AppIcons {
  // Semantic actions.
  static const IconData search = LucideIcons.search;
  static const IconData close = LucideIcons.x;
  static const IconData check = LucideIcons.check;
  static const IconData back = LucideIcons.chevronLeft;
  static const IconData forward = LucideIcons.chevronRight;
  static const IconData expand = LucideIcons.chevronsUpDown;
  static const IconData info = LucideIcons.info;
  static const IconData success = LucideIcons.circleCheck;
  static const IconData warning = LucideIcons.triangleAlert;
  static const IconData error = LucideIcons.circleAlert;

  // Brand marks absent from Lucide. Prefer the SVG logos in
  // `assets/logos/` where a real brand mark is required.
  static const IconData codepen = LucideIcons.codeXml;
  static const IconData codesandbox = LucideIcons.box;
  static const IconData dribbble = LucideIcons.circleDot;
  static const IconData facebook = LucideIcons.globe;
  static const IconData figma = LucideIcons.penTool;
  static const IconData framer = LucideIcons.layers;
  static const IconData github = LucideIcons.gitBranch;
  static const IconData gitlab = LucideIcons.gitMerge;
  static const IconData instagram = LucideIcons.camera;
  static const IconData linkedin = LucideIcons.briefcase;
  static const IconData pocket = LucideIcons.bookmark;
  static const IconData railSymbol = LucideIcons.trainFront;
  static const IconData slack = LucideIcons.hash;
  static const IconData trello = LucideIcons.squareKanban;
  static const IconData twitch = LucideIcons.tv;
  static const IconData twitter = LucideIcons.atSign;
  static const IconData youtube = LucideIcons.play;
}
