# MCP connection

Service endpoint: `https://heavy-ballers-demo.btjones-me.chatgpt.site/api/mcp`

Sites plugin endpoint: `https://heavy-ballers-demo.btjones-me.chatgpt.site/mcp` (Sites-managed OAuth). Both endpoints use the same protocol handler and league service. Sites reserves `/mcp` for its OAuth connection, so the backend agent and future standalone adapters use `/api/mcp` with the separate server credential.

Use Streamable HTTP JSON-RPC with `Content-Type: application/json`, `Accept: application/json, text/event-stream`, and `Authorization: Bearer <MCP_TOKEN>`. Obtain the token from the private local environment file or Sites secret configuration; never put it in frontend code or a public repository. Initialization negotiates the protocol version. This server is stateless and does not require a session ID.

Tools:

| Tool | Purpose |
|---|---|
| `find_fixtures` | Find demo fixtures, optionally by team, round or fixture ID |
| `get_squad` | Read a demo team's players and aliases |
| `get_match_report` | Read the fixture, current version, teams and squads |
| `update_match_report` | Save a partial score, scorers or shootout update |

Example call after initialization and reading the current version:

```json
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"update_match_report","arguments":{"fixtureId":"demo-gw7-1","expectedVersion":0,"operationId":"external:unique-message-id:score","patch":{"homeScore":4,"awayScore":2}}}}
```

Use the actual current version, never assume zero. Repeat the exact operation ID and arguments to retry a successful write safely. A reused ID with different data or a stale version is rejected. Omitted properties are preserved; a supplied scorer list replaces that side's known list, so send the cumulative scorers. Only players in the relevant team are accepted. Explicit nulls clear a supported nullable value. Unknown or conflicting reports should be clarified before changing the result. All data tools are restricted to the fictional season.

The current agent uses OpenAI function calling with schemas discovered from this MCP server, then sends the selected tools over HTTP. A hosted agent may instead use a remote MCP client directly. Sites also provisions its own plugin connection at `/mcp`; trusted Site identity headers are accepted only on that reserved path. The service alias always requires the separate MCP token and ignores identity headers for authentication. No private WhatsApp source material is exposed by any tool.
