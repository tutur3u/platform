import { z } from 'zod';

const schema = z
  .object({
    type: z.union([z.string(), z.array(z.string())]).optional(),
    enum: z.array(z.union([z.string(), z.number(), z.boolean()])).optional(),
    const: z.union([z.string(), z.number(), z.boolean()]).optional(),
    properties: z.record(z.string(), z.unknown()).optional(),
    items: z.unknown().optional(),
    required: z.array(z.string()).optional(),
    anyOf: z.array(z.unknown()).optional(),
  })
  .passthrough();
const specSchema = z.object({
  paths: z.record(
    z.string(),
    z.record(
      z.string(),
      z
        .object({
          operationId: z.string(),
          parameters: z.array(
            z.object({ name: z.string(), schema: z.unknown() })
          ),
          responses: z.record(
            z.string(),
            z
              .object({
                content: z
                  .record(z.string(), z.object({ schema: z.unknown() }))
                  .optional(),
              })
              .passthrough()
          ),
        })
        .passthrough()
    )
  ),
});

function tsType(value: unknown): string {
  const parsed = schema.parse(value);
  if (parsed.const !== undefined) return JSON.stringify(parsed.const);
  if (parsed.enum)
    return parsed.enum.map((item) => JSON.stringify(item)).join(' | ');
  if (parsed.anyOf) return parsed.anyOf.map(tsType).join(' | ');
  if (Array.isArray(parsed.type))
    return parsed.type.map((type) => tsType({ type })).join(' | ');
  if (parsed.type === 'object')
    return `{ ${Object.entries(parsed.properties ?? {})
      .map(
        ([key, item]) =>
          `${JSON.stringify(key)}${parsed.required?.includes(key) ? '' : '?'}: ${tsType(item)}`
      )
      .join('; ')} }`;
  if (parsed.type === 'array') {
    if (parsed.items === undefined)
      throw new Error(`Unsupported client schema: ${JSON.stringify(parsed)}`);
    return `${tsType(parsed.items)}[]`;
  }
  if (parsed.type === 'string') return 'string';
  if (parsed.type === 'integer' || parsed.type === 'number') return 'number';
  if (parsed.type === 'boolean') return 'boolean';
  if (parsed.type === 'null') return 'null';
  throw new Error(`Unsupported client schema: ${JSON.stringify(parsed)}`);
}

function dartType(value: unknown): string {
  const parsed = schema.parse(value);
  if (parsed.anyOf) return 'dynamic';
  if (Array.isArray(parsed.type)) {
    const nonNull = parsed.type.filter((item) => item !== 'null');
    if (nonNull.length === 1 && parsed.type.includes('null'))
      return `${dartType({ ...parsed, type: nonNull[0] })}?`;
  }
  if (parsed.type === 'string') return 'String';
  if (parsed.type === 'integer') return 'int';
  if (parsed.type === 'number') return 'num';
  if (parsed.type === 'boolean') return 'bool';
  if (parsed.type === 'array') {
    if (parsed.items === undefined)
      throw new Error(
        `Unsupported Dart field schema: ${JSON.stringify(parsed)}`
      );
    return `List<${dartType(parsed.items)}>`;
  }
  if (parsed.type === 'object') return 'Map<String, dynamic>';
  throw new Error(`Unsupported Dart field schema: ${JSON.stringify(parsed)}`);
}

function dartModel(name: string, value: unknown): string[] {
  const parsed = schema.parse(value);
  if (parsed.type !== 'object')
    throw new Error('Dart response must be an object');
  const properties = Object.entries(parsed.properties ?? {});
  return [
    `class ${name} {`,
    ...properties.map(([key, field]) => `  final ${dartType(field)} ${key};`),
    `  const ${name}({${properties.map(([key]) => `required this.${key}`).join(', ')}});`,
    `  factory ${name}.fromJson(Map<String, dynamic> json) => ${name}(`,
    ...properties.map(
      ([key, field]) => `    ${key}: json['${key}'] as ${dartType(field)},`
    ),
    '  );',
    '}',
  ];
}

function isObjectSchema(value: unknown): boolean {
  return schema.parse(value).type === 'object';
}

export function clients(input: unknown) {
  const spec = specSchema.parse(input);
  const ts = [
    '// Generated from openapi.json. Run bun run --cwd apps/api generate.',
    'export class ApiClient {',
    '  constructor(private readonly origin: string, private readonly request: (input: URL, init: RequestInit) => Promise<Response> = fetch) {}',
  ];
  const dart = [
    '// Generated from openapi.json. Run bun run --cwd apps/api generate.',
    "import 'dart:convert';",
    '',
    'typedef ApiTransport = Future<ApiResponse> Function(Uri uri, String method);',
    'class ApiResponse {',
    '  final int status;',
    '  final String body;',
    '  const ApiResponse(this.status, this.body);',
    '}',
    'class ApiClient {',
    '  final Uri origin;',
    '  final ApiTransport transport;',
    '  const ApiClient(this.origin, this.transport);',
  ];
  const dartModels: string[] = [];
  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      const responseEntry = Object.entries(operation.responses).find(
        ([status, value]) =>
          /^2\d\d$/.test(status) && value.content?.['application/json']?.schema
      );
      const response = responseEntry?.[1].content?.['application/json']?.schema;
      if (!response)
        throw new Error(
          `Missing JSON success schema: ${operation.operationId}`
        );
      const modelName =
        operation.operationId[0]?.toUpperCase() +
        operation.operationId.slice(1) +
        'Response';
      const responseType = isObjectSchema(response)
        ? modelName
        : dartType(response);
      if (isObjectSchema(response))
        dartModels.push(...dartModel(modelName, response));
      const queryType = operation.parameters.length
        ? `{ ${operation.parameters.map((parameter) => `${parameter.name}: ${tsType(parameter.schema)}`).join('; ')} }`
        : 'Record<string, never>';
      ts.push(
        `  async ${operation.operationId}(query: ${queryType}${operation.parameters.length ? '' : ' = {}'}): Promise<${tsType(response)}> {`,
        `    const url = new URL(${JSON.stringify(path)}, this.origin);`,
        '    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));',
        `    const response = await this.request(url, { method: ${JSON.stringify(method.toUpperCase())} });`,
        "    if (!response.ok) throw new Error('API request failed: ' + response.status + '; request ID: ' + response.headers.get('x-request-id'));",
        '    return response.json();',
        '  }'
      );
      const params = operation.parameters
        .map((parameter) => `required String ${parameter.name}`)
        .join(', ');
      dart.push(
        `  Future<${responseType}> ${operation.operationId}(${params ? `{${params}}` : ''}) async {`,
        `    final uri = origin.resolve('${path}').replace(queryParameters: {${operation.parameters.map((parameter) => `'${parameter.name}': ${parameter.name}`).join(', ')}});`,
        `    final response = await transport(uri, '${method.toUpperCase()}');`,
        "    if (response.status < 200 || response.status >= 300) throw StateError('API request failed: ' + response.status.toString() + '');",
        `    return ${isObjectSchema(response) ? `${modelName}.fromJson(jsonDecode(response.body) as Map<String, dynamic>)` : `jsonDecode(response.body) as ${responseType}`};`,
        '  }'
      );
    }
  }
  ts.push('}', '');
  dart.push('}', ...dartModels, '');
  return { typescript: ts.join('\n'), dart: dart.join('\n') };
}
