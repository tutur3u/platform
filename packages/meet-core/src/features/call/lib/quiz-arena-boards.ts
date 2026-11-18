import {
  type ArenaBoardInput,
  arenaBoardInputSchema,
  arenaQuestionInputSchema,
  DEFAULT_ARENA_TIER_POINTS,
} from '@tuturuuu/realtime/meet/room-quiz-arena';
import { z } from 'zod';
import type { ArenaSubject, MiraBoardRequest } from './quiz-arena-options';

/** Pure board builders shared by the Next server and the live Mira session. */

type Pair = readonly [en: string, vi: string];
const CATEGORIES: Record<ArenaSubject, readonly Pair[]> = {
  math: [
    ['Numbers', 'Số học'],
    ['Geometry', 'Hình học'],
    ['Algebra', 'Đại số'],
    ['Word problems', 'Bài toán có lời văn'],
    ['Mental math', 'Tính nhẩm'],
  ],
  physics: [
    ['Motion', 'Chuyển động'],
    ['Forces', 'Lực'],
    ['Energy', 'Năng lượng'],
    ['Electricity', 'Điện học'],
    ['Light and sound', 'Ánh sáng và âm thanh'],
  ],
  chemistry: [
    ['Atoms', 'Nguyên tử'],
    ['Reactions', 'Phản ứng'],
    ['Elements', 'Nguyên tố'],
    ['Acids and bases', 'Axit và bazơ'],
    ['Lab safety', 'An toàn thí nghiệm'],
  ],
  biology: [
    ['Cells', 'Tế bào'],
    ['Genetics', 'Di truyền'],
    ['Ecology', 'Sinh thái'],
    ['Human body', 'Cơ thể người'],
    ['Plants', 'Thực vật'],
  ],
  writing: [
    ['Grammar', 'Ngữ pháp'],
    ['Vocabulary', 'Từ vựng'],
    ['Punctuation', 'Dấu câu'],
    ['Style', 'Văn phong'],
    ['Structure', 'Bố cục'],
  ],
  general: [
    ['Science', 'Khoa học'],
    ['Culture', 'Văn hóa'],
    ['Nature', 'Tự nhiên'],
    ['Technology', 'Công nghệ'],
    ['Puzzles', 'Câu đố'],
  ],
  history: [
    ['Ancient world', 'Thế giới cổ đại'],
    ['Vietnam', 'Lịch sử Việt Nam'],
    ['Modern era', 'Thời hiện đại'],
    ['People', 'Nhân vật'],
    ['Events', 'Sự kiện'],
  ],
  geography: [
    ['Maps', 'Bản đồ'],
    ['Countries', 'Quốc gia'],
    ['Climate', 'Khí hậu'],
    ['Landforms', 'Địa hình'],
    ['Cities', 'Thành phố'],
  ],
  english: [
    ['Vocabulary', 'Từ vựng'],
    ['Grammar', 'Ngữ pháp'],
    ['Reading', 'Đọc hiểu'],
    ['Idioms', 'Thành ngữ'],
    ['Pronunciation', 'Phát âm'],
  ],
  computer_science: [
    ['Algorithms', 'Thuật toán'],
    ['Data structures', 'Cấu trúc dữ liệu'],
    ['Programming', 'Lập trình'],
    ['Networks', 'Mạng máy tính'],
    ['Big-O', 'Độ phức tạp'],
  ],
};

/**
 * A deterministic board the host runs aloud: each tile is a host-judged
 * short answer, so no question content is invented without Mira.
 */
export function starterArenaBoard(request: MiraBoardRequest): ArenaBoardInput {
  const vi = request.locale === 'vi';
  const categories = CATEGORIES[request.subject]
    .slice(0, request.categoriesCount)
    .map(([en, localized]) => (vi ? localized : en));
  const tierPoints = DEFAULT_ARENA_TIER_POINTS.slice(0, request.tiersCount);
  const prompt = (category: string, points: number) =>
    vi
      ? `${category} · ${points}: trả lời câu hỏi của người dẫn.`
      : `${category} · ${points}: answer the host's question.`;
  return {
    title:
      request.topic?.slice(0, 120) ||
      (vi ? 'Đấu trường kiến thức' : 'Quiz Arena'),
    source: 'starter',
    categories,
    tierPoints,
    tiles: categories.flatMap((category, categoryIndex) =>
      tierPoints.map((points, tierIndex) => ({
        categoryIndex,
        tierIndex,
        isBonusWager: false,
        question: {
          type: 'open_text' as const,
          question: prompt(category, points),
          acceptedAnswers: [],
        },
      }))
    ),
  };
}

const generatedSchema = z.object({
  title: z.string().trim().min(1).max(120),
  categories: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(60),
        questions: z.array(z.unknown()).min(1).max(5),
      })
    )
    .min(1)
    .max(5),
  final: z
    .object({
      category: z.string().trim().min(1).max(60),
      question: z.unknown(),
    })
    .optional(),
});

/** Maps Mira's category/question JSON onto a validated board, dropping invalid questions. */
export function boardFromGenerated(
  raw: unknown,
  request: MiraBoardRequest
): ArenaBoardInput | null {
  const parsed = generatedSchema.safeParse(raw);
  if (!parsed.success) return null;
  const categories = parsed.data.categories.slice(0, request.categoriesCount);
  const rows = Math.max(...categories.map(({ questions }) => questions.length));
  const tierPoints = DEFAULT_ARENA_TIER_POINTS.slice(
    0,
    Math.min(request.tiersCount, rows)
  );
  const tiles = categories.flatMap((category, categoryIndex) =>
    category.questions
      .slice(0, tierPoints.length)
      .flatMap((item, tierIndex) => {
        const question = arenaQuestionInputSchema.safeParse(item);
        return question.success
          ? [
              {
                categoryIndex,
                tierIndex,
                question: question.data,
                isBonusWager: false,
              },
            ]
          : [];
      })
  );
  // One bonus tile in the upper tiers keeps wagers rare and meaningful.
  const bonus = request.bonusTiles
    ? [...tiles].reverse().find(({ tierIndex }) => tierIndex >= 2)
    : undefined;
  if (bonus) bonus.isBonusWager = true;
  const finalQuestion = arenaQuestionInputSchema.safeParse(
    parsed.data.final?.question
  );
  const board = arenaBoardInputSchema.safeParse({
    title: parsed.data.title,
    source: 'mira',
    categories: categories.map(({ name }) => name),
    tierPoints,
    tiles,
    ...(request.includeFinalRound && finalQuestion.success && parsed.data.final
      ? {
          finalRound: {
            category: parsed.data.final.category,
            question: finalQuestion.data,
          },
        }
      : {}),
  });
  return board.success ? board.data : null;
}
