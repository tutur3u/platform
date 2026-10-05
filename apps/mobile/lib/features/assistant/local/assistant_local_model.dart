/// Immutable publisher revisions and LFS digests; no floating model downloads.
class AssistantLocalModel {
  const AssistantLocalModel({
    required this.id,
    required this.name,
    required this.repository,
    required this.revision,
    required this.filename,
    required this.sha256,
    required this.bytes,
    required this.licenseUrl,
    this.requiresLicensedImport = false,
  });

  final String id;
  final String name;
  final String repository;
  final String revision;
  final String filename;
  final String sha256;
  final int bytes;
  final String licenseUrl;
  final bool requiresLicensedImport;

  Uri get downloadUri =>
      Uri.https('huggingface.co', '/$repository/resolve/$revision/$filename');
}

const assistantLocalModels = [
  AssistantLocalModel(
    id: 'gemma3-270m-q8',
    name: 'Gemma 3 270M',
    repository: 'litert-community/gemma-3-270m-it',
    revision: '9d2093270fb5aa49a986b49b5779d763dde7b630',
    filename: 'gemma3-270m-it-q8.litertlm',
    sha256: '757e9119fa5bd667a2774fb470ac4afcd3190a21c677f8e69a5d6bc908abdd63',
    bytes: 304005120,
    licenseUrl: 'https://ai.google.dev/gemma/terms',
    requiresLicensedImport: true,
  ),
  AssistantLocalModel(
    id: 'qwen3-600m',
    name: 'Qwen 3 0.6B',
    repository: 'litert-community/Qwen3-0.6B',
    revision: 'a3c5d805ae362dff7f580bc25f2dfb9a5a7eaa76',
    filename: 'Qwen3-0.6B.litertlm',
    sha256: '555579ff2f4fd13379abe69c1c3ab5200f7338bc92471557f1d6614a6e5ab0b4',
    bytes: 614236160,
    licenseUrl: 'https://huggingface.co/Qwen/Qwen3-0.6B/blob/main/LICENSE',
  ),
];
