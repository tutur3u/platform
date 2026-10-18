import { z } from 'zod';
import { digest } from '../cli/operational-schema';

export const artifactSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    repository: z.string().regex(/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/),
    revision: z.string().regex(/^[0-9a-f]{40}$/),
    filename: z.string().regex(/^[a-zA-Z0-9_.-]+$/),
    bytes: z
      .number()
      .int()
      .positive()
      .max(2 * 1024 ** 3),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    format: z.enum(['gguf', 'litertlm', 'safetensors']),
    license: z.literal('Apache-2.0'),
    gated: z.literal(false),
    evidence: z.array(z.url()).min(1),
  })
  .strict();
export type ModelArtifact = z.infer<typeof artifactSchema>;

export const TEXT_GGUF = artifactSchema.parse({
  id: 'embeddinggemma-2-text-q8',
  repository: 'ggml-org/embeddinggemma-2-GGUF',
  revision: 'bfcd298762cc34d0357ece5ebdd31791a3a374d8',
  filename: 'embeddinggemma-2-Q8_0.gguf',
  bytes: 309855456,
  sha256: '2188ac1deca4b77dffefd603c2776a9d76d9d74ec01841392982ebb840b09135',
  format: 'gguf',
  license: 'Apache-2.0',
  gated: false,
  evidence: [
    'https://blog.google/innovation-and-ai/technology/developers-tools/embeddinggemma-2/',
    'https://huggingface.co/ggml-org/embeddinggemma-2-GGUF/commit/bfcd298762cc34d0357ece5ebdd31791a3a374d8',
    'https://huggingface.co/ggml-org/embeddinggemma-2-GGUF/blob/bfcd298762cc34d0357ece5ebdd31791a3a374d8/embeddinggemma-2-Q8_0.gguf',
  ],
});

export const EMBEDDING_RECIPE = Object.freeze({
  version: 'google-card-2-search-v1',
  dimensions: 768,
  queryPrefix: 'task: search result | query: ',
  documentTemplate: 'title: {title} | text: {content}',
  pooling: 'mean',
  normalization: 'l2',
  evidence: 'https://ai.google.dev/gemma/docs/embeddinggemma/model_card_2',
  limitation:
    'LiteRT documentation publishes different prefixes; this recipe follows the Google model card. Local relevance has not been measured.',
});

export function artifactUrl(input: ModelArtifact) {
  const artifact = artifactSchema.parse(input);
  return `https://huggingface.co/${artifact.repository}/resolve/${artifact.revision}/${artifact.filename}`;
}

export const TEXT_LITERT = artifactSchema.parse({
  id: 'embeddinggemma-2-text-litert',
  repository: 'litert-community/embeddinggemma-2-text-270m-litert-lm',
  revision: '9be6e8b90982095dc05c2bd162e4b954ee4dbac7',
  filename: 'embeddinggemma-2-text-270m.litertlm',
  bytes: 164626432,
  sha256: '2d079ee2f6f066b1f368e8d7c819f55214eaef1d0513b312321901f30ab286fb',
  format: 'litertlm',
  license: 'Apache-2.0',
  gated: false,
  evidence: [
    'https://huggingface.co/litert-community/embeddinggemma-2-text-270m-litert-lm/commit/9be6e8b90982095dc05c2bd162e4b954ee4dbac7',
    'https://huggingface.co/litert-community/embeddinggemma-2-text-270m-litert-lm/blob/9be6e8b90982095dc05c2bd162e4b954ee4dbac7/embeddinggemma-2-text-270m.litertlm',
    'https://github.com/google-ai-edge/LiteRT-LM/releases/tag/v0.18.0',
  ],
});

export const LITERT_RECIPE = Object.freeze({
  version: 'litert-docs-0.18-text-v1',
  dimensions: 768,
  queryPrefix: 'task: search query | text: ',
  documentPrefix: 'task: search result | text: ',
  normalization: 'l2',
  overflow: 'error',
  maxTokens: 512,
  evidence: 'https://developers.google.com/edge/litert-lm/embedding_models',
  limitation:
    'LiteRT documentation uses different prefixes from the Google model card. This artifact-specific recipe is versioned; no local accuracy claim is made.',
});

export function modelFingerprint(
  artifact: ModelArtifact,
  runtimeHash: string,
  recipe: unknown = EMBEDDING_RECIPE
) {
  z.string()
    .regex(/^[0-9a-f]{64}$/)
    .parse(runtimeHash);
  return digest({
    artifact: artifactSchema.parse(artifact),
    runtimeHash,
    recipe,
  });
}

export const SEMANTIC_ADMISSION = Object.freeze({
  allowed: true,
  reason:
    'Only pinned LiteRT-LM 0.18.0 on verified Python 3.12 darwin arm64 and the exact text-only artifact are admitted. GGUF runtime remains unsupported. Explicit model preparation is required.',
});
