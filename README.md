# TutuoAI Catalog Search — MCP Server

A minimal [Model Context Protocol](https://modelcontextprotocol.io/) server that lets any MCP-compatible AI client search the TutuoAI marketplace catalog of 116+ agent tools, skills, playbooks, and MCP connectors.

## What it does

- **`search_catalog` tool** — Keyword search across all catalog items. Returns top 10 matches with name, description, price, and purchase/product URL.
- **`catalog_summary` resource** — Returns total SKU count, breakdown by asset type, and links to the full catalog.

Data is fetched from the public API at `https://www.tutuoai.com/api/catalog-lite.json` (cached for 5 minutes). No authentication or API keys required.

## Install

```bash
# Clone and run
git clone https://github.com/AFunLS/tutuoai-catalog-mcp.git
cd tutuoai-catalog-mcp
node server.js
```

## Configuration

Add to your MCP client config (e.g. Claude Desktop `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "tutuoai-catalog": {
      "command": "node",
      "args": ["/path/to/tutuoai-catalog-mcp/server.js"]
    }
  }
}
```

No environment variables or API keys needed — the server reads the public TutuoAI catalog API.

## Example usage

Once connected, ask your AI assistant:

- "Search TutuoAI for browser automation tools"
- "Find playbooks about sales"
- "What agent tools does TutuoAI have for Slack?"

The `search_catalog` tool accepts a `query` string and returns matching products with pricing and links.

## Protocol

- Transport: **stdio** (JSON-RPC over stdin/stdout)
- MCP version: `2024-11-05`
- Capabilities: `tools`, `resources`

## Testing

```bash
# List available tools
echo '{"jsonrpc":"2.0","method":"initialize","id":0,"params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | node server.js

echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | node server.js

# Search the catalog
echo '{"jsonrpc":"2.0","method":"tools/call","id":2,"params":{"name":"search_catalog","arguments":{"query":"browser automation"}}}' | node server.js
```

## License

MIT — see [LICENSE](LICENSE).
