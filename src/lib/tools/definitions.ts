import type { ToolDefinition } from '@/lib/qlaud';

// Source of truth for the demo tools. Used by:
//   - scripts/register-tools.ts (one-shot bootstrap, run once per env)
//   - the webhook handlers, indirectly via the tool name
//
// To add a new tool: add an entry here, drop a route under
// src/app/api/tools/<slug>/route.ts, set the matching <SLUG>_SECRET in
// .env, then run `bun run register-tools`.
export function toolDefs(baseUrl: string): ToolDefinition[] {
  return [
    {
      name: 'web_search',
      description:
        'Search the public web for current information. Returns a short list of titled results with snippets and URLs.',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query.' },
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 10,
            description: 'How many results to return (default 5).',
          },
        },
        required: ['query'],
      },
      webhook_url: `${baseUrl}/api/tools/web-search`,
      timeout_ms: 15000,
    },
    {
      name: 'generate_image',
      description:
        'Generate an image from a text prompt. Returns a URL to the rendered image.',
      input_schema: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'A vivid description of the image to generate.',
          },
          size: {
            type: 'string',
            enum: ['1024x1024', '1536x1024', '1024x1536'],
            description: 'Output dimensions (default 1024x1024).',
          },
        },
        required: ['prompt'],
      },
      webhook_url: `${baseUrl}/api/tools/generate-image`,
      timeout_ms: 60000,
    },
  ];
}
