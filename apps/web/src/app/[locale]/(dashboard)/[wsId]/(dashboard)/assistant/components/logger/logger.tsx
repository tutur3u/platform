import type { Part } from '@google/generative-ai';
import { cn } from '@tuturuuu/utils/format';
import type React from 'react';
import type { ReactNode } from 'react';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { vs2015 as dark } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import { useLoggerStore } from '../../audio/store-logger';
import {
  type ClientContentMessage,
  isClientContentMessage,
  isInterrupted,
  isModelTurn,
  isServerContenteMessage,
  isToolCallCancellationMessage,
  isToolCallMessage,
  isToolResponseMessage,
  isTurnComplete,
  type ModelTurn,
  type ServerContentMessage,
  type StreamingLog,
  type ToolCallCancellationMessage,
  type ToolCallMessage,
  type ToolResponseMessage,
} from '../../multimodal-live';

const formatTime = (d: Date) => d.toLocaleTimeString().slice(0, -3);

const LogEntry = ({
  log,
  MessageComponent,
}: {
  log: StreamingLog;
  MessageComponent: ({
    message,
  }: {
    message: StreamingLog['message'];
  }) => ReactNode;
}): React.JSX.Element => (
  <li
    className={cn(
      'flex items-start gap-3 truncate py-3 font-mono text-sm',
      `source-${log.type.slice(0, log.type.indexOf('.'))}`,
      {
        'text-blue-400': log.type.includes('receive'),
        'text-emerald-400': log.type.includes('send'),
      }
    )}
  >
    <span className="shrink-0 text-neutral-500">{formatTime(log.date)}</span>
    <span className="shrink-0 text-neutral-400">{log.type}</span>
    <span className="break-all text-neutral-300">
      <MessageComponent message={log.message} />
    </span>
    {log.count && (
      <span className="rounded bg-neutral-800 px-2 py-0.5 text-neutral-400 text-xs">
        {log.count}
      </span>
    )}
  </li>
);

const PlainTextMessage = ({
  message,
}: {
  message: StreamingLog['message'];
}) => <span>{message as string}</span>;

type Message = { message: StreamingLog['message'] };

const AnyMessage = ({ message }: Message) => (
  <pre>{JSON.stringify(message, null, '  ')}</pre>
);

function tryParseCodeExecutionResult(output: string) {
  try {
    const json = JSON.parse(output);
    return JSON.stringify(json, null, '  ');
  } catch {
    return output;
  }
}

const RenderPart = ({ part }: { part: Part }) =>
  part.text?.length ? (
    <p className="part part-text">{part.text}</p>
  ) : part.executableCode ? (
    <div className="part part-executableCode">
      <h5>executableCode: {part.executableCode.language}</h5>
      <SyntaxHighlighter
        language={part.executableCode.language.toLowerCase()}
        style={dark}
      >
        {part.executableCode.code}
      </SyntaxHighlighter>
    </div>
  ) : part.codeExecutionResult ? (
    <div className="part part-codeExecutionResult">
      <h5>codeExecutionResult: {part.codeExecutionResult.outcome}</h5>
      <SyntaxHighlighter language="json" style={dark}>
        {tryParseCodeExecutionResult(part.codeExecutionResult.output)}
      </SyntaxHighlighter>
    </div>
  ) : (
    <div className="part part-inlinedata">
      <h5>Inline Data: {part.inlineData?.mimeType}</h5>
    </div>
  );

const ClientContentLog = ({ message }: Message) => {
  const { turns, turnComplete } = (message as ClientContentMessage)
    .clientContent;
  return (
    <div className="rich-log client-content user">
      <h4 className="roler-user">User</h4>
      {turns.map((turn, i) => (
        <div key={`message-turn-${i}`}>
          {turn.parts
            .filter((part) => !(part.text && part.text === '\n'))
            .map((part, j) => (
              <RenderPart part={part} key={`message-turh-${i}-part-${j}`} />
            ))}
        </div>
      ))}
      {!turnComplete ? <span>turnComplete: false</span> : ''}
    </div>
  );
};

const ToolCallLog = ({ message }: Message) => {
  const { toolCall } = message as ToolCallMessage;
  return (
    <div className={cn('rich-log tool-call')}>
      {toolCall.functionCalls.map((fc) => (
        <div key={fc.id} className="part part-functioncall">
          <h5>Function call: {fc.name}</h5>
          <SyntaxHighlighter language="json" style={dark}>
            {JSON.stringify(fc, null, '  ')}
          </SyntaxHighlighter>
        </div>
      ))}
    </div>
  );
};

const ToolCallCancellationLog = ({ message }: Message): React.JSX.Element => (
  <div className={cn('rich-log tool-call-cancellation')}>
    <span>
      {' '}
      ids:{' '}
      {(message as ToolCallCancellationMessage).toolCallCancellation.ids.map(
        (id) => (
          <span className="inline-code" key={`cancel-${id}`}>
            &quot;{id}&quot;
          </span>
        )
      )}
    </span>
  </div>
);

const ToolResponseLog = ({ message }: Message): React.JSX.Element => (
  <div className={cn('rich-log tool-response')}>
    {(message as ToolResponseMessage).toolResponse.functionResponses.map(
      (fc) => (
        <div key={`tool-response-${fc.id}`} className="part">
          <h5>Function Response: {fc.id}</h5>
          <SyntaxHighlighter language="json" style={dark}>
            {JSON.stringify(fc.response, null, '  ')}
          </SyntaxHighlighter>
        </div>
      )
    )}
  </div>
);

const ModelTurnLog = ({ message }: Message): React.JSX.Element => {
  const serverContent = (message as ServerContentMessage).serverContent;
  const { modelTurn } = serverContent as ModelTurn;
  const { parts } = modelTurn;

  return (
    <div className="rich-log model-turn model">
      <h4 className="role-model">Model</h4>
      {parts
        .filter((part) => !(part.text && part.text === '\n'))
        .map((part, j) => (
          <RenderPart part={part} key={`model-turn-part-${j}`} />
        ))}
    </div>
  );
};

const CustomPlainTextLog = (msg: string) => () => (
  <PlainTextMessage message={msg} />
);

export type LoggerFilterType = 'conversations' | 'tools' | 'none';

export type LoggerProps = {
  filter: LoggerFilterType;
};

const filters: Record<LoggerFilterType, (log: StreamingLog) => boolean> = {
  tools: (log: StreamingLog) =>
    isToolCallMessage(log.message) ||
    isToolResponseMessage(log.message) ||
    isToolCallCancellationMessage(log.message),
  conversations: (log: StreamingLog) =>
    isClientContentMessage(log.message) || isServerContenteMessage(log.message),
  none: () => true,
};

const component = (log: StreamingLog) => {
  if (typeof log.message === 'string') {
    return PlainTextMessage;
  }
  if (isClientContentMessage(log.message)) {
    return ClientContentLog;
  }
  if (isToolCallMessage(log.message)) {
    return ToolCallLog;
  }
  if (isToolCallCancellationMessage(log.message)) {
    return ToolCallCancellationLog;
  }
  if (isToolResponseMessage(log.message)) {
    return ToolResponseLog;
  }
  if (isServerContenteMessage(log.message)) {
    const { serverContent } = log.message;
    if (isInterrupted(serverContent)) {
      return CustomPlainTextLog('interrupted');
    }
    if (isTurnComplete(serverContent)) {
      return CustomPlainTextLog('turnComplete');
    }
    if (isModelTurn(serverContent)) {
      return ModelTurnLog;
    }
  }
  return AnyMessage;
};

export default function Logger({ filter = 'none' }: LoggerProps) {
  const { logs } = useLoggerStore();

  const filterFn = filters[filter];

  return (
    <div className="logger">
      <ul className="logger-list">
        {logs.filter(filterFn).map((log, key) => {
          return (
            <LogEntry MessageComponent={component(log)} log={log} key={key} />
          );
        })}
      </ul>
    </div>
  );
}
