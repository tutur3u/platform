import { WorkspaceCourse } from "@tuturuuu/types/db";
import { v4 as uuidv4 } from "uuid";

export const mockData = (t: (key: string) => string): (WorkspaceCourse & {
  ws_id: string;
  href: string;
  modules: number;
})[] => {
  const now = new Date().toISOString();
  return [
    {
      id: uuidv4(),
      ws_id: uuidv4(),
      name: t("course1.name"),
      description: t("course1.description"),
      is_published: true,
      is_public: true,
      cert_template: "modern",
      created_at: now,
      href: "/courses/ai-intro",
      modules: 12,
    },
    {
      id: uuidv4(),
      ws_id: uuidv4(),
      name: t("course2.name"),
      description: t("course2.description"),
      is_published: true,
      is_public: true,
      cert_template: "original",
      created_at: now,
      href: "/courses/fullstack-web",
      modules: 8,
    },
    {
      id: uuidv4(),
      ws_id: uuidv4(),
      name: t("course3.name"),
      description: t("course3.description"),
      is_published: true,
      is_public: true,
      cert_template: "elegant",
      created_at: now,
      href: "/courses/data-science",
      modules: 10,
    },
  ];
};
