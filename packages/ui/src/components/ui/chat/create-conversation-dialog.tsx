"use client";

import { LoaderCircle } from "@tuturuuu/icons";
import type {
  ChatConversation,
  ChatConversationType,
  ChatUserProfile,
} from "@tuturuuu/internal-api";
import { useTranslations } from "next-intl";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Button } from "../button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../dialog";
import { Input } from "../input";
import { toast } from "../sonner";
import { Textarea } from "../textarea";
import { ConversationTypeSelector } from "./conversation-type-selector";
import { DirectoryUserPicker } from "./directory-user-picker";
import {
  useChatDirectory,
  useCreateChatConversation,
  useCreateChatFriendRequest,
} from "./hooks";
import {
  type ChatConversationScope,
  getChatConversationTypesForScope,
} from "./utils";

type CreateConversationStep = "details" | "members" | "type";

interface CreateConversationDialogProps {
  allowedTypes?: ChatConversationType[];
  conversationScope?: ChatConversationScope;
  currentUserId: string;
  defaultType?: ChatConversationType;
  onCreated: (conversation: ChatConversation) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  wsId: string;
}

export function CreateConversationDialog({
  allowedTypes,
  conversationScope,
  currentUserId,
  defaultType,
  onCreated,
  onOpenChange,
  open,
  wsId,
}: CreateConversationDialogProps) {
  const t = useTranslations("chat");
  const createConversation = useCreateChatConversation(wsId);
  const createFriendRequest = useCreateChatFriendRequest(wsId);
  const effectiveAllowedTypes = useMemo(
    () =>
      allowedTypes ??
      (conversationScope
        ? getChatConversationTypesForScope(conversationScope)
        : ([
            "direct",
            "group",
            "channel",
            "ai",
          ] satisfies ChatConversationType[])),
    [allowedTypes, conversationScope],
  );
  const fallbackType = defaultType ?? effectiveAllowedTypes[0] ?? "direct";
  const [type, setType] = useState<ChatConversationType>(fallbackType);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [directoryQuery, setDirectoryQuery] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<ChatUserProfile[]>([]);
  const [step, setStep] = useState<CreateConversationStep>("type");
  const { data: directoryUsers = [], isFetching } = useChatDirectory({
    enabled: open && (type === "direct" || type === "group"),
    query: directoryQuery,
    wsId,
  });

  useEffect(() => {
    if (!effectiveAllowedTypes.includes(type)) {
      setType(fallbackType);
      setSelectedUsers([]);
    }
  }, [effectiveAllowedTypes, fallbackType, type]);

  const filteredUsers = useMemo(
    () =>
      directoryUsers.filter(
        (user) =>
          user.id !== currentUserId &&
          !selectedUsers.some((selected) => selected.id === user.id),
      ),
    [currentUserId, directoryUsers, selectedUsers],
  );

  const requiresTitle = type === "group" || type === "channel";
  const needsMembers = type === "direct" || type === "group";
  const needsDetails = type !== "direct";
  const missingParticipants =
    (type === "direct" && selectedUsers.length !== 1) ||
    (type === "group" && selectedUsers.length < 1);
  const shouldDisableSubmit =
    createConversation.isPending ||
    (requiresTitle && title.trim().length === 0) ||
    missingParticipants;

  function reset() {
    setType(fallbackType);
    setTitle("");
    setDescription("");
    setDirectoryQuery("");
    setSelectedUsers([]);
    setStep("type");
  }

  async function handleCreateFriendRequest(email: string) {
    try {
      await createFriendRequest.mutateAsync(email);
      setDirectoryQuery("");
      toast.success(t("friend_request_sent"));
    } catch {
      toast.error(t("friend_request_failed"));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (shouldDisableSubmit) return;

    try {
      const { conversation } = await createConversation.mutateAsync({
        aiEnabled: type === "ai",
        description: description.trim() || null,
        participantUserIds: selectedUsers.map((user) => user.id),
        title: title.trim() || null,
        type,
      });
      reset();
      onCreated(conversation);
      onOpenChange(false);
    } catch {
      toast.error(t("conversation_create_failed"));
    }
  }

  function getNextStep() {
    if (step === "type") return needsMembers ? "members" : "details";
    if (step === "members" && needsDetails) return "details";
    return null;
  }

  function getPreviousStep() {
    if (step === "details") return needsMembers ? "members" : "type";
    if (step === "members") return "type";
    return null;
  }

  const nextStep = getNextStep();
  const previousStep = getPreviousStep();
  const canContinue =
    step === "type" ||
    (step === "members" &&
      !(
        (type === "direct" && selectedUsers.length !== 1) ||
        (type === "group" && selectedUsers.length < 1)
      ));
  const showSubmit = !nextStep;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) reset();
      }}
    >
      <DialogContent className="max-h-[min(42rem,calc(100vh-2rem))] overflow-hidden sm:max-w-2xl">
        <form className="flex min-h-0 flex-col gap-4" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t("new_conversation")}</DialogTitle>
            <DialogDescription>
              {t("new_conversation_description")}
            </DialogDescription>
          </DialogHeader>

          <CreateConversationSteps
            currentStep={step}
            needsDetails={needsDetails}
            needsMembers={needsMembers}
            t={t}
          />

          {step === "type" ? (
            <ConversationTypeSelector
              allowedTypes={effectiveAllowedTypes}
              onTypeChange={(nextType) => {
                setType(nextType);
                if (nextType === "direct") {
                  setSelectedUsers((current) => current.slice(0, 1));
                }
              }}
              type={type}
            />
          ) : null}

          {step === "members" ? (
            <DirectoryUserPicker
              canCreateFriendRequest={conversationScope !== "workspaces"}
              directoryQuery={directoryQuery}
              filteredUsers={filteredUsers}
              isFetching={isFetching}
              isCreatingFriendRequest={createFriendRequest.isPending}
              onDirectoryQueryChange={setDirectoryQuery}
              onCreateFriendRequest={handleCreateFriendRequest}
              onRemoveUser={(userId) =>
                setSelectedUsers((current) =>
                  current.filter((item) => item.id !== userId),
                )
              }
              onSelectUser={(user) =>
                setSelectedUsers((current) =>
                  type === "direct" ? [user] : [...current, user],
                )
              }
              selectedUsers={selectedUsers}
            />
          ) : null}

          {step === "details" ? (
            <div className="grid gap-3">
              <Input
                onChange={(event) => setTitle(event.target.value)}
                placeholder={
                  type === "channel"
                    ? t("channel_name_placeholder")
                    : type === "ai"
                      ? t("agent_name_placeholder")
                      : t("group_name_placeholder")
                }
                value={title}
              />
              {(type === "group" || type === "channel" || type === "ai") && (
                <Textarea
                  className="min-h-24"
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder={t("conversation_description_placeholder")}
                  value={description}
                />
              )}
            </div>
          ) : null}

          <DialogFooter>
            <Button
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
              type="button"
              variant="outline"
            >
              {t("cancel")}
            </Button>
            {previousStep ? (
              <Button
                onClick={() => setStep(previousStep)}
                type="button"
                variant="outline"
              >
                {t("back")}
              </Button>
            ) : null}
            {showSubmit ? (
              <Button disabled={shouldDisableSubmit} type="submit">
                {createConversation.isPending && (
                  <LoaderCircle className="size-4 animate-spin" />
                )}
                {t("create")}
              </Button>
            ) : (
              <Button
                disabled={!canContinue}
                onClick={() => nextStep && setStep(nextStep)}
                type="button"
              >
                {t("next")}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreateConversationSteps({
  currentStep,
  needsDetails,
  needsMembers,
  t,
}: {
  currentStep: CreateConversationStep;
  needsDetails: boolean;
  needsMembers: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const steps: { id: CreateConversationStep; label: string }[] = [
    { id: "type", label: t("step_type") },
    needsMembers ? { id: "members", label: t("step_members") } : null,
    needsDetails ? { id: "details", label: t("step_details") } : null,
  ].filter((step): step is { id: CreateConversationStep; label: string } =>
    Boolean(step),
  );

  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
    >
      {steps.map((step) => (
        <div
          className={[
            "rounded-md border px-3 py-2 text-center font-medium text-xs",
            currentStep === step.id
              ? "border-primary bg-primary text-primary-foreground"
              : "bg-muted/30 text-muted-foreground",
          ].join(" ")}
          key={step.id}
        >
          {step.label}
        </div>
      ))}
    </div>
  );
}
