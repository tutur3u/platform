part of 'task_board_detail_page.dart';

class _AssigneeChip extends StatelessWidget {
  const _AssigneeChip({required this.label, this.avatarUrl});

  final String label;
  final String? avatarUrl;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      decoration: BoxDecoration(
        border: Border.all(color: shad.Theme.of(context).colorScheme.border),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          NetworkAvatar(
            radius: 10,
            avatarUrl: avatarUrl,
            child: Text(
              label.isEmpty ? '?' : label.substring(0, 1).toUpperCase(),
              style: const TextStyle(fontSize: 10),
            ),
          ),
          const shad.Gap(6),
          Text(label, style: shad.Theme.of(context).typography.small),
        ],
      ),
    );
  }
}
