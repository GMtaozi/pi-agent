import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core';

export interface WebToolContext {
  httpFetch?: (url: string) => Promise<string>;
}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
export const webTools = (context: WebToolContext = {}): AgentTool<any>[] => {
  const httpFetch = context.httpFetch || (async (url: string): Promise<string> => {
    const response = await fetch(url);
    const text = await response.text();
    return text;
  });

  return [
    {
      name: 'web_search',
      label: 'Web Search',
      description: 'Search the web for information. Returns search results with titles, URLs, and snippets.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query' },
          max_results: { type: 'number', description: 'Maximum number of results to return (default 10)' }
        },
        required: ['query']
      },
   
   
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      async execute(toolCallId: string, params: any, _signal?: AbortSignal, _onUpdate?: (result: AgentToolResult<any>) => void): Promise<AgentToolResult<any>> {
        // Placeholder - would integrate with a real search API
        return {
          content: [{ type: 'text', text: 'Web search is not yet implemented. Query: ' + params.query }],
          details: {
            success: false,
            message: 'Web search placeholder',
            query: params.query,
            results: []
          }
        };
      }
    },
    {
      name: 'web_fetch',
      label: 'Web Fetch',
      description: 'Fetch a web page and return its text content. Use this to read articles, documentation, or other web pages.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL to fetch' },
          max_length: { type: 'number', description: 'Maximum characters to return (default 10000)' }
        },
        required: ['url']
      },
   
   
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      async execute(toolCallId: string, params: any, _signal?: AbortSignal, _onUpdate?: (result: AgentToolResult<any>) => void): Promise<AgentToolResult<any>> {
        try {
          const maxLength = params.max_length || 10000;
          const html = await httpFetch(params.url);
          
          // Simple HTML to text conversion
          const text = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          
          const truncated = text.length > maxLength ? text.substring(0, maxLength) + '... (truncated)' : text;
          
          return {
            content: [{ type: 'text', text: truncated }],
            details: {
              success: true,
              url: params.url,
              length: text.length,
              truncated: text.length > maxLength
            }
          };
        } catch (error) {
          return {
            content: [{ type: 'text', text: 'Error fetching URL: ' + (error instanceof Error ? error.message : String(error)) }],
            details: {
              success: false,
              error: error instanceof Error ? error.message : String(error),
              url: params.url
            }
          };
        }
      }
    }
  ];
};