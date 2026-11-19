part of 'task_board_detail_page.dart';

class _TaskBoardDescriptionDocument extends StatelessWidget {
  const _TaskBoardDescriptionDocument({required this.description});

  final ParsedTipTapDescription description;

  @override
  Widget build(BuildContext context) {
    final normalizedRawJson = description.rawJson?.trim();
    final descriptionPayload =
        (normalizedRawJson != null && normalizedRawJson.isNotEmpty)
        ? normalizedRawJson
        : description.markdown;

    return TaskDescriptionViewer(descriptionJson: descriptionPayload);
  }
}
