#!/usr/bin/env node
/**
 * TutuoAI Catalog Search — MCP Server (stdio transport)
 *
 * Tools:
 *   search_catalog — keyword search across 116+ agent tools/skills/playbooks
 *
 * Resources:
 *   catalog_summary — overview of catalog contents
 */

import { createInterface } from "node:readline";

const CATALOG_URL = "https://www.tutuoai.com/api/catalog-lite.json";
const SITE_URL = "https://www.tutuoai.com";

// ── Catalog cache ──────────────────────────────────────────────────
let catalogCache = null;
let cacheTime = 0;
const CACHE_TTL = 300_000; // 5 min

async function getCatalog() {
  if (catalogCache && Date.now() - cacheTime < CACHE_TTL) return catalogCache;
  const res = await fetch(CATALOG_URL);
  if (!res.ok) throw new Error(`Catalog fetch failed: ${res.status}`);
  catalogCache = await res.json();
  cacheTime = Date.now();
  return catalogCache;
}

// ── Tool: search_catalog ───────────────────────────────────────────
async function searchCatalog(query) {
  const catalog = await getCatalog();
  const q = query.toLowerCase();
  const terms = q.split(/\s+/).filter(Boolean);

  const scored = catalog.items
    .map((item) => {
      const haystack = [
        item.title,
        item.short,
        item.slug,
        item.agent_use_case,
        item.asset_type,
        ...(item.use_cases || []),
        ...(item.integrations || []),
        ...(item.runtime || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const score = terms.reduce((s, t) => s + (haystack.includes(t) ? 1 : 0), 0);
      return { item, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  return scored.map(({ item }) => ({
    name: item.title,
    description: item.short,
    price: item.price === 0 ? "Free" : `$${item.price}`,
    asset_type: item.asset_type,
    url: item.buy_url || `${SITE_URL}/products/${item.slug}`,
  }));
}

// ── Resource: catalog_summary ──────────────────────────────────────
async function catalogSummary() {
  const catalog = await getCatalog();
  const types = {};
  for (const item of catalog.items) {
    const t = item.asset_type || "unknown";
    types[t] = (types[t] || 0) + 1;
  }
  return {
    total_skus: catalog.items.length,
    asset_types: types,
    catalog_url: CATALOG_URL,
    website: SITE_URL,
    updated: catalog.updated,
  };
}

// ── JSON-RPC helpers ───────────────────────────────────────────────
function ok(id, result) {
  return { jsonrpc: "2.0", id, result };
}
function err(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

const SERVER_INFO = {
  name: "tutuoai-catalog-search",
  version: "1.0.0",
};

const CAPABILITIES = {
  tools: {},
  resources: {},
};

// ── Request handler ────────────────────────────────────────────────
async function handle(msg) {
  const { method, id, params } = msg;

  switch (method) {
    case "initialize":
      return ok(id, {
        protocolVersion: "2024-11-05",
        serverInfo: SERVER_INFO,
        capabilities: CAPABILITIES,
      });

    case "notifications/initialized":
      return null; // no response for notifications

    case "tools/list":
      return ok(id, {
        tools: [
          {
            name: "search_catalog",
            description:
              "Search the TutuoAI catalog of 116+ agent tools, skills, playbooks, and MCP connectors. Returns top 10 matches with name, description, price, and URL.",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "Search keywords (e.g. 'slack integration', 'browser automation', 'playbook sales')",
                },
              },
              required: ["query"],
            },
          },
        ],
      });

    case "tools/call": {
      const toolName = params?.name;
      if (toolName !== "search_catalog") {
        return err(id, -32602, `Unknown tool: ${toolName}`);
      }
      const query = params?.arguments?.query;
      if (!query) {
        return err(id, -32602, "Missing required argument: query");
      }
      try {
        const results = await searchCatalog(query);
        return ok(id, {
          content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
        });
      } catch (e) {
        return ok(id, {
          content: [{ type: "text", text: `Error: ${e.message}` }],
          isError: true,
        });
      }
    }

    case "resources/list":
      return ok(id, {
        resources: [
          {
            uri: "tutuoai://catalog/summary",
            name: "TutuoAI Catalog Summary",
            description: "Overview of the TutuoAI marketplace: total SKU count, asset types, and links.",
            mimeType: "application/json",
          },
        ],
      });

    case "resources/read": {
      const uri = params?.uri;
      if (uri !== "tutuoai://catalog/summary") {
        return err(id, -32602, `Unknown resource: ${uri}`);
      }
      try {
        const summary = await catalogSummary();
        return ok(id, {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify(summary, null, 2),
            },
          ],
        });
      } catch (e) {
        return err(id, -32603, e.message);
      }
    }

    default:
      return err(id, -32601, `Method not found: ${method}`);
  }
}

// ── stdio transport ────────────────────────────────────────────────
const rl = createInterface({ input: process.stdin, terminal: false });

rl.on("line", async (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    process.stdout.write(
      JSON.stringify(err(null, -32700, "Parse error")) + "\n"
    );
    return;
  }
  const response = await handle(msg);
  if (response) {
    process.stdout.write(JSON.stringify(response) + "\n");
  }
});
