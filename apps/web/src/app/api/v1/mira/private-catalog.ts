export type MiraAchievementRow = {
  category: string;
  code: string;
  created_at: string;
  description: string;
  icon: string;
  id: string;
  name: string;
  sort_order: number;
  unlock_condition: unknown;
  xp_reward: number;
};

export type MiraAccessoryRow = {
  category: string;
  code: string;
  created_at: string;
  description: string | null;
  id: string;
  is_premium: boolean;
  name: string;
  sort_order: number;
  unlock_condition: unknown;
};

export function getPrivateMiraCatalogClient(client: {
  schema: (schema: 'private') => any;
}) {
  return client.schema('private');
}
