interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * LegiScan MCP — wraps the LegiScan API (api.legiscan.com)
 *
 * Tracks US state & federal legislation: search bills, pull bill status /
 * sponsors / text, list legislative sessions per state.
 *
 * Tools:
 * - search_bills:  full-text search US state legislation ("what bills are
 *                  about <topic>") across one state or nationwide
 * - get_bill:      detailed legislative bill status, sponsors, subjects, text
 * - list_sessions: enumerate a state's legislative sessions
 *
 * Dual key model: _apiKey is OPTIONAL — pass your own LegiScan key for higher
 * limits, or omit to use the shared Pipeworx key. Sent as the `key` query
 * param; every request is GET /?key={key}&op={operation}&<params>.
 */


const BASE_URL = 'https://api.legiscan.com/';

const tools: McpToolExport['tools'] = [
  {
    name: 'search_bills',
    description:
      'Full-text search US state (and federal) legislation to find out what bills are about a given topic. Searches one state or nationwide (ALL) and returns matching bills with number, title, state, last action, and a LegiScan bill_id you can pass to get_bill. Example: search_bills({ query: "data privacy", state: "CA" })',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Search terms, e.g. "data privacy", "minimum wage", "abortion"',
        },
        state: {
          type: 'string',
          description: '2-letter state abbreviation (e.g. "CA", "TX") or "ALL" to search every state. Default "ALL".',
        },
        year: {
          type: 'number',
          description:
            'LegiScan year code: 1 = all years, 2 = current + prior session (default), or a specific year like 2024.',
        },
        _apiKey: {
          type: 'string',
          description: 'Optional — your own LegiScan API key for higher limits; omit to use the shared Pipeworx key.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_bill',
    description:
      'Get the full detail for a single US legislative bill — status, sponsors (name/party/role), subjects, and links to the bill text. Use the bill_id returned by search_bills. Example: get_bill({ bill_id: 1234567 })',
    inputSchema: {
      type: 'object' as const,
      properties: {
        bill_id: {
          type: 'number',
          description: 'LegiScan bill_id (obtained from search_bills results).',
        },
        _apiKey: {
          type: 'string',
          description: 'Optional — your own LegiScan API key for higher limits; omit to use the shared Pipeworx key.',
        },
      },
      required: ['bill_id'],
    },
  },
  {
    name: 'list_sessions',
    description:
      'List the legislative sessions for a US state (regular and special), with start/end years and session IDs. Useful to scope which session to track bills in. Example: list_sessions({ state: "NY" })',
    inputSchema: {
      type: 'object' as const,
      properties: {
        state: {
          type: 'string',
          description: '2-letter state abbreviation, e.g. "NY", "FL", "CA".',
        },
        _apiKey: {
          type: 'string',
          description: 'Optional — your own LegiScan API key for higher limits; omit to use the shared Pipeworx key.',
        },
      },
      required: ['state'],
    },
  },
];

interface LegiScanEnvelope {
  status?: 'OK' | 'ERROR';
  alert?: { message?: string };
  [key: string]: unknown;
}

// Issue a GET /?key={key}&op={op}&<params> request. Returns either the parsed
// envelope or a normalized error object (api_key_required / HTTP status /
// legiscan_error) — callers pass the result straight through.
async function legiscanGet(
  apiKey: string,
  op: string,
  params: Record<string, string>,
): Promise<{ ok: true; data: LegiScanEnvelope } | { ok: false; error: unknown }> {
  if (!apiKey) {
    return { ok: false, error: { error: 'api_key_required', message: 'No LegiScan key available.' } };
  }

  const qs = new URLSearchParams({ key: apiKey, op });
  for (const [k, v] of Object.entries(params)) qs.set(k, v);

  const res = await fetch(`${BASE_URL}?${qs.toString()}`);
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: { error: res.status, message: text } };
  }

  const data = (await res.json()) as LegiScanEnvelope;
  if (data.status === 'ERROR') {
    return {
      ok: false,
      error: { error: 'legiscan_error', message: data.alert?.message || 'LegiScan error' },
    };
  }

  return { ok: true, data };
}

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const apiKey = args._apiKey as string;
  delete args._apiKey;

  switch (name) {
    case 'search_bills':
      return searchBills(args, apiKey);
    case 'get_bill':
      return getBill(args, apiKey);
    case 'list_sessions':
      return listSessions(args, apiKey);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function searchBills(args: Record<string, unknown>, apiKey: string) {
  const query = (args.query as string) ?? '';
  const state = (args.state as string) || 'ALL';
  const year = args.year !== undefined ? String(args.year as number) : '2';

  const result = await legiscanGet(apiKey, 'getSearch', { state, query, year });
  if (!result.ok) return result.error;

  const searchresult = (result.data.searchresult ?? {}) as Record<string, any>;

  return {
    summary: searchresult.summary,
    results: Object.entries(searchresult)
      .filter(([k]) => k !== 'summary')
      .map(([, r]: [string, any]) => ({
        bill_id: r.bill_id,
        number: r.bill_number,
        title: r.title,
        state: r.state,
        last_action: r.last_action,
        last_action_date: r.last_action_date,
        url: r.url,
        relevance: r.relevance,
      })),
  };
}

async function getBill(args: Record<string, unknown>, apiKey: string) {
  const billId = String(args.bill_id as number);

  const result = await legiscanGet(apiKey, 'getBill', { id: billId });
  if (!result.ok) return result.error;

  const bill = (result.data.bill ?? {}) as any;

  return {
    bill_id: bill.bill_id,
    number: bill.bill_number,
    title: bill.title,
    description: bill.description,
    state: bill.state,
    status: bill.status,
    status_date: bill.status_date,
    url: bill.url,
    last_action: bill.history?.[bill.history.length - 1]?.action,
    sponsors: (bill.sponsors || []).map((s: any) => ({
      name: s.name,
      party: s.party,
      role: s.role,
    })),
    subjects: (bill.subjects || []).map((x: any) => x.subject_name),
    texts: (bill.texts || []).map((t: any) => ({
      type: t.type,
      date: t.date,
      url: t.state_link,
    })),
  };
}

async function listSessions(args: Record<string, unknown>, apiKey: string) {
  const state = (args.state as string) ?? '';

  const result = await legiscanGet(apiKey, 'getSessionList', { state });
  if (!result.ok) return result.error;

  const sessions = (result.data.sessions ?? []) as any[];

  return (sessions || []).map((s: any) => ({
    session_id: s.session_id,
    name: s.session_name,
    year_start: s.year_start,
    year_end: s.year_end,
    special: s.special,
  }));
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
