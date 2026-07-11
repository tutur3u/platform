export interface VocabularyItem {
  id: string;
  word: string;
  pronunciation: string;
  definition: string;
  examples: string[];
  imageUrl: string;
}

export interface VocabularySuggestion {
  beta: boolean;
  definition?: string;
  url: string | null;
  word: string;
}

export interface VocabularySectionProps {
  moduleId: string;
  wsId: string;
}

export function emptyVocabulary(): VocabularyItem {
  return {
    id: '',
    word: '',
    pronunciation: '',
    definition: '',
    examples: [],
    imageUrl: '',
  };
}

export function normalizeVocabulary(value: unknown): VocabularyItem[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;

      const record = entry as Record<string, unknown>;
      const word = typeof record.word === 'string' ? record.word.trim() : '';
      const definition =
        typeof record.definition === 'string' ? record.definition.trim() : '';

      if (!word || !definition) return null;

      const examples = Array.isArray(record.examples)
        ? record.examples
            .filter((example): example is string => typeof example === 'string')
            .map((example) => example.trim())
            .filter(Boolean)
        : typeof record.examples === 'string'
          ? record.examples
              .split('\n')
              .map((example) => example.trim())
              .filter(Boolean)
          : [];

      return {
        id:
          typeof record.id === 'string' && record.id.trim().length > 0
            ? record.id
            : crypto.randomUUID(),
        word,
        pronunciation:
          typeof record.pronunciation === 'string'
            ? record.pronunciation.trim()
            : '',
        definition,
        examples,
        imageUrl:
          typeof record.imageUrl === 'string'
            ? record.imageUrl
            : typeof record.image_url === 'string'
              ? record.image_url
              : '',
      } satisfies VocabularyItem;
    })
    .filter((entry): entry is VocabularyItem => entry !== null);
}

function blobAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Could not read image.'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Upload failed.'));
    reader.readAsDataURL(blob);
  });
}

export async function readImageAsDataUrl(file: File) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1280 / bitmap.width, 720 / bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');

    if (!context) {
      bitmap.close();
      return blobAsDataUrl(file);
    }

    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const resized = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/webp', 0.82);
    });

    return blobAsDataUrl(resized ?? file);
  } catch {
    return blobAsDataUrl(file);
  }
}
