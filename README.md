# mcp-legiscan

LegiScan MCP — wraps the LegiScan API (api.legiscan.com)

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `search_bills` | Full-text search US state (and federal) legislation to find out what bills are about a given topic. Searches one state or nationwide (ALL) and returns matching bills with number, title, state, last action, and a LegiScan bill_id you can pass to get_bill. Example: search_bills({ query: "data privacy", state: "CA" }) |
| `get_bill` | Get the full detail for a single US legislative bill — status, sponsors (name/party/role), subjects, and links to the bill text. Use the bill_id returned by search_bills. Example: get_bill({ bill_id: 1234567 }) |
| `list_sessions` | List the legislative sessions for a US state (regular and special), with start/end years and session IDs. Useful to scope which session to track bills in. Example: list_sessions({ state: "NY" }) |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "legiscan": {
      "url": "https://gateway.pipeworx.io/legiscan/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Legiscan data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
