import { google } from '@ai-sdk/google';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { consumeStream, gateway, stepCountIs, streamText } from 'ai';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { CreditSource as SharedCreditSource } from '../chat/credit-source';
import { mapToUIMessages } from '../chat/google/chat-request-schema';
import {
  type AiRouteAuthResult,
  resolveAiRouteAuth,
} from '../chat/google/route-auth';
import { performCreditPreflight } from '../chat/google/route-credits';
import { prepareProcessedMessages } from '../chat/google/route-message-preparation';
import { deductAiCredits } from '../credits/check-credits';
import {
  isGoogleModelId,
  normalizeStableModelId,
  toBareModelName,
} from '../credits/model-mapping';
import {
  PlanModelResolutionError,
  resolvePlanModel,
} from '../credits/resolve-plan-model';
import { withAiMemory } from '../memory';
import { createMiraStreamTools } from '../tools/mira-tools';
import { createMindStreamTools, type MindToolCallbacks } from './tools';

type AuthOk = Extract<AiRouteAuthResult, { ok: true }>;

const MindChatBodySchema = z.object({
  boardId: z.guid().nullable().optional(),
  clientRunId: z.string().trim().min(1).max(120).optional(),
  creditSource: z.enum(['personal', 'workspace']).optional(),
  creditWsId: z.string().optional(),
  messages: z.array(z.unknown()).optional(),
  model: z.string().optional(),
  thinkingMode: z.enum(['fast', 'thinking']).optional(),
  threadId: z.guid().optional(),
  timezone: z.string().optional(),
  writeMode: z.enum(['direct', 'review']).optional(),
  wsId: z.string().min(1),
});

export type MindRouteCallbacks = MindToolCallbacks & {
  ensureThread(input: {
    boardId?: string | null;
    model?: string | null;
    threadId?: string | null;
    userId: string;
    writeMode: 'direct' | 'review';
    wsId: string;
  }): Promise<string>;
  persistMessage(input: {
    boardId?: string | null;
    content: string;
    metadata?: Record<string, unknown>;
    model?: string | null;
    role: 'assistant' | 'system' | 'tool' | 'user';
    threadId: string;
    toolCalls?: unknown[];
    toolResults?: unknown[];
    usage?: Record<string, unknown>;
    userId: string;
    wsId: string;
  }): Promise<void>;
  resolveAccess(input: {
    auth: AuthOk;
    request: NextRequest;
    wsId: string;
  }): Promise<{ ok: true; wsId: string } | { ok: false; response: Response }>;
  resolveAuth?: (
    request: NextRequest
  ) => Promise<AuthOk | { ok: false; response: Response }>;
};

function collectTextFromMessages(messages: ReturnType<typeof mapToUIMessages>) {
  const latest = [...messages]
    .reverse()
    .find((message) => message.role === 'user');
  if (!latest) return '';

  return latest.parts
    .map((part) => (part.type === 'text' ? part.text : ''))
    .filter(Boolean)
    .join('\n\n');
}

function buildMindSystemPrompt({
  boardId,
  compactContext,
  timezone,
  writeMode,
}: {
  boardId?: string | null;
  compactContext: string;
  timezone?: string;
  writeMode: 'direct' | 'review';
}) {
  return `You are Mind, Tuturuuu's internal planning copilot for mindboards and long-horizon knowledge graphs.

Current selected board: ${boardId ?? 'none'}.
Current timezone: ${timezone ?? 'UTC'}.
Current write mode: ${writeMode}.

Compact Mind context:
${compactContext}

Use Mind tools to inspect boards, load snapshots or chunks, search nodes, render visual planning UI, and propose structured graph patches. Use convert_file_to_markdown when attached binary files need conversion before analysis. Prefer small coherent patches over huge rewrites. Treat review mode as Draft mode: create applyable draft patches with propose_mind_patch whenever a useful graph change is implied, and do not claim they were applied. Treat direct mode as Implement mode: you may call apply_mind_patch after proposing a patch when the user's intent is clearly to change the board.

Be autonomous when it helps: if the user asks for a roadmap, plan, breakdown, structure, refinement, consolidation, timeline, risk pass, or elaboration, inspect/search the board, brainstorm the structure internally, then propose one applyable draft patch. Do not devise a non-applyable plan and a separate duplicate draft. Use render_mind_ui only when it adds a compact, nonduplicative preview of the same pending draft; the applyable propose_mind_patch output is the source of truth. Do not end with "would you like me to draft this" when drafting is clearly useful; draft it.

Plan completeness standard: proposals should be concrete enough to apply. When the user asks for a structure, generate the major planning clusters, the important child nodes in each cluster, and the relationships that make the graph useful. Do not stop after one partial cluster when the request clearly spans multiple areas. Prefer 8-24 well-linked operations for normal plans, and more when the board context warrants it. Use parentNodeId plus explicit "contains" edges to form supportive clusters, then add "sequence", "depends_on", "supports", "blocks", or "relates_to" edges between clusters and critical child nodes so the graph is not isolated. Existing graph is authoritative: reuse, update, link, or extend relevant existing nodes by ID before creating replacements. If the existing board already has top-level nodes, enrich all relevant nodes consistently rather than expanding only the first one.

Graph health standard: orphaned nodes are nodes with zero inbound and zero outbound relationships. Treat relevant orphaned nodes from inspect_mind_structure or the compact context as repair candidates, not background noise. When the user asks to expand, refine, consolidate, improve, or connect a board, link, reparent, merge, or explicitly account for relevant orphaned nodes before creating more content. New patch nodes should not be left orphaned: every new node should have at least one explicit edge to a parent, sibling, child, or existing anchor whenever another node is available. parentNodeId is useful hierarchy metadata, but parentNodeId alone is not enough for graph connectivity; include a "contains" edge to the parent when possible. New roots/clusters should connect to an existing anchor or to another new cluster unless the user explicitly asks for unrelated alternatives.

Stream work visibly through tools. For multi-step graph work, first call the smallest inspection/search/neighborhood tool that proves context, then call propose_mind_patch for useful graph changes. A render_mind_ui call is optional and should be limited to a compact preview of the same draft, never a separate plan artifact with duplicated content. Do not silently think through all work and only answer at the end. If a tool returns ok:false, correct the shape once; do not retry the same invalid patch repeatedly. If render_mind_ui rejects a nested object, retry once with the loose outline shape: {"root":"Title","elements":[{"title":"Section","children":[{"title":"Item"}]}]}.

Node statuses are first-class planning state. Use them deliberately:
- backlog: captured but not yet committed
- planned: intended and ordered
- in_progress: actively being executed
- in_review: waiting for validation, walkthrough, or decision
- blocked: cannot progress until dependency/risk is resolved
- completed: done and no longer active
- deferred: intentionally postponed
- cancelled: intentionally removed from the plan

Large-board navigation strategy: never assume full context is available forever. Start with inspect_mind_structure, search_mind_nodes for the user's topic, then load_mind_neighborhood around relevant nodes. Use load_mind_chunk with offset/limit for broad audits. Keep your own working map of board regions, unresolved questions, duplicates, and chunk cursors while iterating.

When showing standalone comparisons, phase maps, or structured planning summaries that do not change the graph, call render_mind_ui instead of pasting large JSON/code blocks. When graph changes are useful, do not make render_mind_ui the main deliverable; use propose_mind_patch as the applyable draft and keep any visual preview compact. Never paste raw patch JSON in the assistant text; the draft patch tool output is rendered by the client with Apply controls.

Graph structure rules:
- Parent/child structure is represented by node.parentNodeId plus a "contains" edge whenever possible. Parent nodes should be higher-level goals, plans, systems, or milestones. Child nodes should be concrete milestones, actions, risks, questions, or resources under that parent.
- Same-level chronological order should use "sequence" edges. Real prerequisites should use "depends_on"; blockers should use "blocks"; enabling or reinforcing relationships should use "supports"; loose associations should use "relates_to".
- Always label non-obvious edges with a short relationship phrase such as "requires", "unblocks", "enables", "feeds", or "validates".
- Build on the current board instead of drafting a detached replacement. If a node already represents the user's topic, use its ID as the parent/anchor; if a related cluster already exists, add missing child nodes and edges into that cluster instead of creating a duplicate root.
- For structure-generation requests, every new child node should have parentNodeId plus a "contains" edge to its parent whenever possible, and every top-level cluster should have at least one meaningful relationship to the root goal or to another cluster. Avoid creating disconnected islands unless the user explicitly asks for unrelated alternatives.
- Before proposing a patch, check the isolated/orphaned node list returned by inspect_mind_structure and the compact context. If any isolated node is relevant to the user request, include relationship or parent updates for it in the same draft. Do not leave existing relevant orphaned nodes disconnected while adding new parallel content.
- When refining relationships, propose update_node parentNodeId changes, create_edge/update_edge operations, and delete_edge operations as needed. Do not solve relationship questions only by adding more isolated nodes.
- For new nodes and edges, include stable short ids whenever possible. If you create edges to nodes in the same patch, reference the created node id or the create_node operation id consistently. Put all create_node operations before any create_edge, update_node, or update_edge operation that depends on those new nodes.
- For update_node and update_edge operations, put editable fields at the top level of the operation. Do not nest update fields under "node" or "edge". For create_node and create_edge, use the nested "node" or "edge" object.
- Use only valid node types: decision, goal, idea, milestone, plan, question, resource, risk, system. Use "idea" for tasks/actions. Use only valid edge types: blocks, contains, contradicts, custom, depends_on, reference, relates_to, sequence, supports. Use "supports" for validates/enables/informs unless it is a real prerequisite.

Valid render_mind_ui examples:
- Full json-render spec:
  {"root":"roadmap","elements":{"roadmap":{"type":"Card","props":{"title":"LMS roadmap"},"children":["phase_1","phase_2"]},"phase_1":{"type":"ListItem","props":{"title":"Phase 1: Foundations","subtitle":"Users, roles, courses, enrollment"},"children":[]},"phase_2":{"type":"ListItem","props":{"title":"Phase 2: Core learning","subtitle":"Quizzes, grading, progress tracking"},"children":[]}}}
- Loose outline, also accepted:
  {"root":"LMS roadmap","elements":[{"title":"Phase 1: Foundations","children":[{"title":"User and role management"},{"title":"Course creation"}]},{"title":"Phase 2: Core learning","children":[{"title":"Quizzes"},{"title":"Progress dashboards"}]}]}
- Loose keyed outline, also accepted when root is a display title:
  {"root":"LMS roadmap","elements":{"phase1":{"title":"Phase 1: Foundations","children":[{"title":"User and role management"},{"title":"Course creation"}]},"phase2":{"title":"Phase 2: Core learning","children":[{"title":"Quizzes"},{"title":"Progress dashboards"}]}}}

Valid propose_mind_patch example:
{"boardId":"current","patch":{"summary":"Initialize LMS roadmap","operations":[{"id":"op1","kind":"create_node","node":{"id":"phase1","title":"Phase 1: Foundations","body":"Users, roles, course shell, enrollment.","nodeType":"milestone","horizon":"quarter","status":"planned","positionX":0,"positionY":0}},{"id":"op2","kind":"create_node","node":{"id":"phase2","title":"Phase 2: Core learning","body":"Quizzes, assignments, grading, progress dashboards.","nodeType":"milestone","horizon":"quarter","status":"planned","positionX":320,"positionY":0}},{"id":"op3","kind":"create_edge","edge":{"id":"edge_phase1_phase2","sourceNodeId":"phase1","targetNodeId":"phase2","edgeType":"sequence","label":"then"}}]}}

Valid relationship refinement patch example:
{"boardId":"current","patch":{"summary":"Clarify compliance baseline relationships","operations":[{"id":"rename_baseline","kind":"update_node","nodeId":"5279e3f1-bf4c-4e95-ac64-0d519e10db83","title":"Compliance Baseline & Data Privacy","body":"Define privacy-by-design requirements, PII handling, encryption, and data classification for MVP launch."},{"id":"relabel_mvp_dependency","kind":"update_edge","edgeId":"9da91129-e15f-4774-9a89-ad40199e2b51","edgeType":"blocks","label":"blocks MVP release until satisfied"},{"id":"add_classification","kind":"create_node","node":{"id":"data_classification_framework","title":"Data Classification Framework","body":"Define PII classes, retention expectations, and handling rules.","nodeType":"idea","horizon":"month","status":"planned","parentNodeId":"5279e3f1-bf4c-4e95-ac64-0d519e10db83","positionX":0,"positionY":260}},{"id":"link_baseline_classification","kind":"create_edge","edge":{"id":"edge_baseline_classification","sourceNodeId":"5279e3f1-bf4c-4e95-ac64-0d519e10db83","targetNodeId":"data_classification_framework","edgeType":"contains","label":"contains"}}]}}`;
}

function truncateValue(value: string, maxLength = 160) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}...`;
}

async function buildCompactMindContext({
  boardId,
  callbacks,
  wsId,
}: {
  boardId?: string | null;
  callbacks: MindRouteCallbacks;
  wsId: string;
}) {
  const boards = await callbacks.listBoards(wsId);
  const snapshot = boardId ? await callbacks.getSnapshot(wsId, boardId) : null;
  const boardLines = boards
    .slice(0, 12)
    .map((board) =>
      [
        board.title,
        `${board.nodeCount} nodes`,
        `${board.edgeCount} edges`,
        `${board.tagCount} tags`,
        board.defaultHorizon,
      ].join(' | ')
    );

  if (!snapshot) {
    return [
      `Workspace boards: ${boards.length}`,
      boardLines.length ? boardLines.join('\n') : 'No boards yet.',
      boardId ? 'Selected board snapshot was not found.' : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  const degree = new Map<string, number>();
  for (const edge of snapshot.edges) {
    degree.set(edge.sourceNodeId, (degree.get(edge.sourceNodeId) ?? 0) + 1);
    degree.set(edge.targetNodeId, (degree.get(edge.targetNodeId) ?? 0) + 1);
  }
  const nodeById = new Map(snapshot.nodes.map((node) => [node.id, node]));
  const highDegreeNodes = [...snapshot.nodes]
    .sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0))
    .slice(0, 10)
    .map(
      (node) =>
        `${node.title} [${node.id}] (${degree.get(node.id) ?? 0}, ${node.status}, ${node.horizon})`
    );
  const recentNodes = [...snapshot.nodes]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 12)
    .map(
      (node) =>
        `${node.title} [${node.id}] | ${node.horizon} | ${node.status} | ${node.nodeType}`
    );
  const statusCounts = snapshot.nodes.reduce<Record<string, number>>(
    (acc, node) => {
      acc[node.status] = (acc[node.status] ?? 0) + 1;
      return acc;
    },
    {}
  );
  const isolatedNodes = snapshot.nodes
    .filter((node) => (degree.get(node.id) ?? 0) === 0)
    .slice(0, 20)
    .map(
      (node) =>
        `${node.title} [${node.id}] | ${node.nodeType} | ${node.status} | ${node.horizon}`
    );
  const relationshipLines = snapshot.edges.slice(0, 30).map((edge) => {
    const source = nodeById.get(edge.sourceNodeId);
    const target = nodeById.get(edge.targetNodeId);
    const label = edge.label ? ` "${edge.label}"` : '';
    return `${edge.edgeType}${label}: ${source?.title ?? edge.sourceNodeId} -> ${
      target?.title ?? edge.targetNodeId
    }`;
  });

  return [
    `Workspace boards: ${boards.length}`,
    boardLines.length ? `Boards:\n${boardLines.join('\n')}` : 'No boards yet.',
    `Selected board: ${snapshot.board.title}`,
    `Selected board counts: ${snapshot.nodes.length} nodes, ${snapshot.edges.length} edges, ${snapshot.tags.length} tags, ${snapshot.groups.length} groups`,
    snapshot.tags.length
      ? `Tags: ${snapshot.tags
          .slice(0, 30)
          .map((tag) => tag.name)
          .join(', ')}`
      : 'Tags: none',
    snapshot.groups.length
      ? `Groups: ${snapshot.groups
          .slice(0, 20)
          .map((group) => group.name)
          .join(', ')}`
      : 'Groups: none',
    highDegreeNodes.length
      ? `High-degree nodes: ${truncateValue(highDegreeNodes.join(', '), 800)}`
      : 'High-degree nodes: none',
    `Graph health: ${isolatedNodes.length} orphaned nodes in context sample; ${
      snapshot.nodes.filter((node) => (degree.get(node.id) ?? 0) === 0).length
    } total nodes have zero inbound and zero outbound relationships. Treat relevant orphaned nodes as repair candidates in expansion/refinement drafts.`,
    isolatedNodes.length
      ? `Orphaned nodes: ${truncateValue(isolatedNodes.join('; '), 1000)}`
      : 'Orphaned nodes: none',
    `Status counts: ${JSON.stringify(statusCounts)}`,
    relationshipLines.length
      ? `Relationship sample: ${truncateValue(relationshipLines.join('; '), 1200)}`
      : 'Relationship sample: none',
    recentNodes.length
      ? `Recent nodes: ${truncateValue(recentNodes.join('; '), 1000)}`
      : 'Recent nodes: none',
    'Large-board strategy: use inspect_mind_structure first, then search_mind_nodes, load_mind_neighborhood for relevant nodes, and load_mind_chunk with offset/limit only for broad audits.',
  ].join('\n');
}

function getMindStreamErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return `Mind AI could not finish: ${error.message}`;
  }

  return 'Mind AI could not finish this request.';
}

export function createPOST(callbacks: MindRouteCallbacks) {
  return async function POST(request: NextRequest): Promise<Response> {
    let parsedBody: z.infer<typeof MindChatBodySchema>;
    try {
      parsedBody = MindChatBodySchema.parse(await request.json());
    } catch (error) {
      return NextResponse.json(
        {
          error: 'Invalid Mind AI payload',
          issues: error instanceof z.ZodError ? error.issues : undefined,
        },
        { status: 400 }
      );
    }

    try {
      const auth = callbacks.resolveAuth
        ? await callbacks.resolveAuth(request)
        : await resolveAiRouteAuth(request);
      if (!auth.ok) return auth.response;

      const access = await callbacks.resolveAccess({
        auth,
        request,
        wsId: parsedBody.wsId,
      });
      if (!access.ok) return access.response;

      const sbAdmin = await createAdminClient();
      const requestedCreditSource: SharedCreditSource =
        parsedBody.creditSource ?? 'workspace';
      let requestedCreditWsId: string | undefined;
      try {
        requestedCreditWsId = parsedBody.creditWsId
          ? await normalizeWorkspaceId(
              parsedBody.creditWsId,
              auth.supabase,
              request
            )
          : undefined;
      } catch {
        return NextResponse.json(
          { error: 'Invalid credit workspace identifier' },
          { status: 422 }
        );
      }

      let billingWsId: string | null = access.wsId;
      if (requestedCreditSource === 'personal') {
        const { data: personalWorkspace, error: personalWorkspaceError } =
          await sbAdmin
            .from('workspaces')
            .select('id, workspace_members!inner(user_id)')
            .eq('personal', true)
            .eq('workspace_members.user_id', auth.user.id)
            .maybeSingle();

        if (personalWorkspaceError) {
          return NextResponse.json(
            { error: 'Internal error resolving personal workspace' },
            { status: 500 }
          );
        }

        if (!personalWorkspace?.id) {
          return NextResponse.json(
            {
              code: 'PERSONAL_WORKSPACE_NOT_FOUND',
              error: 'Personal workspace not found.',
            },
            { status: 403 }
          );
        }

        if (
          requestedCreditWsId &&
          requestedCreditWsId !== personalWorkspace.id
        ) {
          return NextResponse.json(
            {
              code: 'INVALID_CREDIT_SOURCE',
              error: 'Invalid credit workspace for personal credit source.',
            },
            { status: 403 }
          );
        }

        billingWsId = personalWorkspace.id;
      } else if (requestedCreditWsId) {
        if (requestedCreditWsId !== access.wsId) {
          const membership = await verifyWorkspaceMembershipType({
            requiredType: 'MEMBER',
            supabase: sbAdmin,
            userId: auth.user.id,
            wsId: requestedCreditWsId,
          });

          if (membership.error === 'membership_lookup_failed') {
            return NextResponse.json(
              { error: 'Internal server error' },
              { status: 500 }
            );
          }

          if (!membership.ok) {
            return NextResponse.json(
              {
                code: 'INVALID_CREDIT_SOURCE',
                error: 'Workspace access denied for selected credit workspace.',
              },
              { status: 403 }
            );
          }
        }

        billingWsId = requestedCreditWsId;
      }

      const writeMode = parsedBody.writeMode ?? 'review';
      const model = normalizeStableModelId(
        parsedBody.model ?? 'google/gemini-2.5-flash'
      );
      let resolvedModelId: string;
      try {
        const resolvedPlanModel = await resolvePlanModel({
          capability: 'language',
          requestedModel: model,
          wsId: billingWsId,
        });
        resolvedModelId = normalizeStableModelId(resolvedPlanModel.modelId);
      } catch (error) {
        if (error instanceof PlanModelResolutionError) {
          return NextResponse.json(
            { code: error.code, error: error.message },
            { status: error.code === 'NO_ALLOCATION' ? 503 : 500 }
          );
        }

        return NextResponse.json(
          { error: 'Failed to resolve Mind AI model' },
          { status: 500 }
        );
      }

      const threadId = await callbacks.ensureThread({
        boardId: parsedBody.boardId ?? null,
        model: resolvedModelId,
        threadId: parsedBody.threadId ?? null,
        userId: auth.user.id,
        writeMode,
        wsId: access.wsId,
      });

      const messages = mapToUIMessages(parsedBody.messages as never);
      const latestUserText = collectTextFromMessages(messages);
      if (latestUserText) {
        await callbacks.persistMessage({
          boardId: parsedBody.boardId ?? null,
          content: latestUserText,
          model: resolvedModelId,
          role: 'user',
          threadId,
          userId: auth.user.id,
          wsId: access.wsId,
        });
      }

      const creditPreflight = await performCreditPreflight({
        model: resolvedModelId,
        sbAdmin,
        userId: auth.user.id,
        wsId: billingWsId ?? access.wsId,
      });
      if ('error' in creditPreflight) return creditPreflight.error;

      const supportsThinking =
        resolvedModelId.includes('gemini-2.5') ||
        resolvedModelId.includes('gemini-3');
      const thinkingConfig = supportsThinking
        ? parsedBody.thinkingMode === 'thinking'
          ? { thinkingConfig: { includeThoughts: true } }
          : { thinkingConfig: { includeThoughts: false, thinkingBudget: 0 } }
        : {};
      const compactContext = await buildCompactMindContext({
        boardId: parsedBody.boardId ?? null,
        callbacks,
        wsId: access.wsId,
      });
      const mindTools = createMindStreamTools(
        {
          boardId: parsedBody.boardId ?? null,
          threadId,
          userId: auth.user.id,
          writeMode,
          wsId: access.wsId,
        },
        callbacks
      );
      const permissions = await getPermissions({
        user: auth.user,
        wsId: access.wsId,
      });
      const userGroupStorageAccessCache = new Map<string, boolean>();
      const miraFileTools = createMiraStreamTools({
        chatId: threadId,
        creditWsId: billingWsId ?? access.wsId,
        canReadUserGroupStorage: async ({ groupId, storagePath, wsId }) => {
          if (wsId !== access.wsId || storagePath.includes('..')) {
            return false;
          }

          if (
            !permissions ||
            permissions.withoutPermission('view_user_groups')
          ) {
            return false;
          }

          const expectedPrefix = `${access.wsId}/user-groups/${groupId}/`;
          if (!storagePath.startsWith(expectedPrefix)) {
            return false;
          }

          const cachedAccess = userGroupStorageAccessCache.get(groupId);
          if (cachedAccess !== undefined) {
            return cachedAccess;
          }

          const { data, error } = await sbAdmin
            .from('workspace_user_groups')
            .select('id')
            .eq('ws_id', access.wsId)
            .eq('id', groupId)
            .maybeSingle();
          const allowed = !error && Boolean(data);
          userGroupStorageAccessCache.set(groupId, allowed);
          return allowed;
        },
        supabase: sbAdmin as never,
        timezone: parsedBody.timezone,
        userId: auth.user.id,
        wsId: access.wsId,
      });
      const streamTools = {
        ...mindTools,
        ...(miraFileTools.convert_file_to_markdown
          ? { convert_file_to_markdown: miraFileTools.convert_file_to_markdown }
          : {}),
      };
      type PrepareStep = NonNullable<
        NonNullable<Parameters<typeof streamText>[0]>['prepareStep']
      >;
      const prepareStep: PrepareStep = ({ stepNumber }) => {
        if (stepNumber === 0) {
          return {
            activeTools: [
              'list_mindboards',
              'inspect_mind_structure',
              'get_mindboard_snapshot',
              'load_mind_neighborhood',
              'search_mind_nodes',
              'render_mind_ui',
              'convert_file_to_markdown',
            ],
          };
        }

        return {
          activeTools: [
            'list_mindboards',
            'inspect_mind_structure',
            'get_mindboard_snapshot',
            'load_mind_chunk',
            'load_mind_neighborhood',
            'search_mind_nodes',
            'propose_mind_patch',
            'render_mind_ui',
            'convert_file_to_markdown',
            ...(writeMode === 'direct' ? ['apply_mind_patch'] : []),
          ],
        };
      };
      const useGoogleNativeModel = isGoogleModelId(resolvedModelId);
      const preparedMessages = await prepareProcessedMessages(
        messages,
        access.wsId,
        threadId,
        request,
        { attachYoutubeVideoInput: useGoogleNativeModel }
      );
      if ('error' in preparedMessages) return preparedMessages.error;

      const modelWithMemory = await withAiMemory({
        customId: threadId,
        model: useGoogleNativeModel
          ? google(toBareModelName(resolvedModelId))
          : gateway(resolvedModelId),
        product: 'mind',
        source: 'mind_chat',
        surface: 'mind_chat',
        userId: auth.user.id,
        wsId: access.wsId,
      });

      const result = streamText({
        abortSignal: request.signal,
        experimental_telemetry: {
          functionId: 'mind.ai.stream',
          isEnabled: true,
          metadata: {
            boardId: parsedBody.boardId ?? 'none',
            clientRunId: parsedBody.clientRunId ?? 'none',
            creditSource: requestedCreditSource,
            creditWsId: billingWsId ?? access.wsId,
            model: resolvedModelId,
            threadId,
            thinkingMode: parsedBody.thinkingMode ?? 'fast',
            writeMode,
            wsId: access.wsId,
          },
        },
        maxRetries: 0,
        maxOutputTokens: creditPreflight.cappedMaxOutput ?? undefined,
        messages: preparedMessages.processedMessages,
        model: modelWithMemory,
        ...(useGoogleNativeModel
          ? { providerOptions: { google: thinkingConfig } }
          : {}),
        stopWhen: stepCountIs(8),
        system: buildMindSystemPrompt({
          boardId: parsedBody.boardId,
          compactContext,
          timezone: parsedBody.timezone,
          writeMode,
        }),
        prepareStep,
        timeout: {
          chunkMs: 20_000,
          stepMs: 45_000,
          totalMs: 120_000,
        },
        toolChoice: 'auto',
        tools: streamTools,
        onFinish: async (response) => {
          const toolCalls = response.steps?.flatMap(
            (step) => step.toolCalls ?? []
          );
          const toolResults = response.steps?.flatMap(
            (step) => step.toolResults ?? []
          );
          const usage = response.totalUsage ?? response.usage ?? {};
          await callbacks.persistMessage({
            boardId: parsedBody.boardId ?? null,
            content: response.text || '',
            metadata: {
              clientRunId: parsedBody.clientRunId ?? null,
              finishReason: response.finishReason,
              threadId,
            },
            model: resolvedModelId,
            role: 'assistant',
            threadId,
            toolCalls,
            toolResults,
            usage: {
              inputTokens: usage.inputTokens ?? 0,
              outputTokens: usage.outputTokens ?? 0,
              reasoningTokens: usage.reasoningTokens ?? 0,
              totalTokens: usage.totalTokens ?? 0,
            },
            userId: auth.user.id,
            wsId: access.wsId,
          });
          await deductAiCredits({
            feature: 'chat',
            inputTokens: usage.inputTokens ?? 0,
            modelId: resolvedModelId,
            outputTokens: usage.outputTokens ?? 0,
            reasoningTokens: usage.reasoningTokens ?? 0,
            userId: auth.user.id,
            wsId: billingWsId ?? access.wsId,
          });
        },
      });

      return result.toUIMessageStreamResponse({
        consumeSseStream: consumeStream,
        onError: getMindStreamErrorMessage,
        sendReasoning: true,
        sendSources: true,
      });
    } catch {
      return NextResponse.json(
        { error: 'Mind AI could not start this request.' },
        { status: 500 }
      );
    }
  };
}
