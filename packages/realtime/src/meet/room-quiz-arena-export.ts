import { spreadsheetCsvCell as csvCell } from './csv-cell';
import type { ArenaTile, RoomQuizArenaState } from './room-quiz-arena-schema';
import {
  arenaWagerKey,
  attendanceCredited,
  playedArenaRounds,
  rankArenaEntries,
} from './room-quiz-arena-scoring';

function correctAnswer(tile: ArenaTile) {
  const { question } = tile;
  if (question.type === 'single_choice')
    return (question.quizMeta.correctOptionIds ?? [])
      .map((id) => question.options?.find((option) => option.id === id)?.label)
      .filter(Boolean)
      .join(', ');
  return (question.acceptedAnswers ?? []).join(', ');
}

function answerLabel(
  tile: ArenaTile,
  answer: ArenaTile['submissions'][number]['answer']
) {
  return 'optionId' in answer
    ? (tile.question.options?.find(({ id }) => id === answer.optionId)?.label ??
        '')
    : answer.text;
}

function rankedPlayers(state: RoomQuizArenaState) {
  return rankArenaEntries(Object.values(state.players), (player) => ({
    score: player.score,
    name: player.displayName,
    id: player.userId,
  }));
}

function rankedTeams(state: RoomQuizArenaState) {
  return rankArenaEntries(state.teams, (team) => ({
    score: team.score,
    name: team.name,
    id: team.id,
  }));
}

const allTiles = (state: RoomQuizArenaState) =>
  state.finalTile ? [...state.tiles, state.finalTile] : state.tiles;

export function exportQuizArenaJson(state: RoomQuizArenaState) {
  const teamName = new Map(state.teams.map(({ id, name }) => [id, name]));
  return {
    title: state.title,
    categories: state.categories,
    finalCategory: state.finalCategory ?? null,
    tierPoints: state.tierPoints,
    config: state.config,
    phase: state.phase,
    playedRounds: playedArenaRounds(state),
    results: allTiles(state).map((tile) => ({
      id: tile.id,
      category: tile.isFinal
        ? (state.finalCategory ?? '')
        : (state.categories[tile.categoryIndex] ?? ''),
      points: tile.points,
      isBonusWager: tile.isBonusWager,
      isFinal: tile.isFinal,
      status: tile.status,
      question: tile.question,
      submissions: tile.submissions.map((entry) => ({
        ...entry,
        answerLabel: answerLabel(tile, entry.answer),
        wager: tile.wagers[arenaWagerKey(state, entry.userId)] ?? null,
        delta: tile.awards[entry.userId] ?? 0,
      })),
      buzzQueue: tile.buzzQueue,
    })),
    individualScores: rankedPlayers(state).map((player) => ({
      rank: player.rank,
      userId: player.userId,
      displayName: player.displayName,
      team: player.teamId ? (teamName.get(player.teamId) ?? '') : null,
      score: player.score,
      participatedRounds: player.participatedRounds,
      attendanceCredited: attendanceCredited(state, player),
    })),
    teamScores: rankedTeams(state).map((team) => ({
      rank: team.rank,
      id: team.id,
      name: team.name,
      score: team.score,
    })),
  };
}

export function exportQuizArenaCsv(state: RoomQuizArenaState) {
  const teamName = new Map(state.teams.map(({ id, name }) => [id, name]));
  const rows: Array<Array<string | number>> = [
    ['title', state.title],
    ['played_rounds', playedArenaRounds(state)],
    [],
    ['section', 'results'],
    [
      'category',
      'points',
      'question',
      'status',
      'correct_answer',
      'answers',
      'correct',
    ],
  ];
  for (const tile of allTiles(state))
    rows.push([
      tile.isFinal
        ? (state.finalCategory ?? '')
        : (state.categories[tile.categoryIndex] ?? ''),
      tile.points,
      tile.question.question,
      tile.status,
      correctAnswer(tile),
      tile.submissions.length,
      tile.submissions.filter(({ correct }) => correct).length,
    ]);
  rows.push(
    [],
    ['section', 'individual_scores'],
    [
      'rank',
      'user_id',
      'display_name',
      'team',
      'score',
      'participated_rounds',
      'attendance_credited',
    ]
  );
  for (const player of rankedPlayers(state))
    rows.push([
      player.rank,
      player.userId,
      player.displayName,
      player.teamId ? (teamName.get(player.teamId) ?? '') : '',
      player.score,
      player.participatedRounds,
      attendanceCredited(state, player) ? 'true' : 'false',
    ]);
  if (state.teams.length) {
    rows.push([], ['section', 'team_scores'], ['rank', 'team', 'score']);
    for (const team of rankedTeams(state))
      rows.push([team.rank, team.name, team.score]);
  }
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
