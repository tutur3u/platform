"use client";

import { Bot, Hash, MessageCircle, Users } from "@tuturuuu/icons";
import type { ChatConversationType } from "@tuturuuu/internal-api";
import { cn } from "@tuturuuu/utils/format";
import { useTranslations } from "next-intl";

const conversationTypes: ChatConversationType[] = [
  "direct",
  "group",
  "channel",
  "ai",
];

export function ConversationTypeSelector({
  allowedTypes = conversationTypes,
  onTypeChange,
  type,
}: {
  allowedTypes?: ChatConversationType[];
  onTypeChange: (type: ChatConversationType) => void;
  type: ChatConversationType;
}) {
  const t = useTranslations("chat");

  return (
    <div className="grid grid-cols-2 gap-2">
      {allowedTypes.map((item) => (
        <button
          className={cn(
            "flex h-24 flex-col items-center justify-center gap-2 rounded-md border bg-background text-sm transition-colors hover:bg-accent",
            item === type && "border-primary bg-accent",
          )}
          key={item}
          onClick={() => onTypeChange(item)}
          type="button"
        >
          {getTypeIcon(item)}
          <span>{t(`type_${item}`)}</span>
        </button>
      ))}
    </div>
  );
}

function getTypeIcon(type: ChatConversationType) {
  if (type === "direct") return <MessageCircle className="size-5" />;
  if (type === "group") return <Users className="size-5" />;
  if (type === "channel") return <Hash className="size-5" />;
  return <Bot className="size-5" />;
}
