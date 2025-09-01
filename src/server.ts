import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import {
    init, ensureLoaded,
    listArticlesText, getArticleText,
    searchArticlesText, reloadText, Fields
} from "./server_old.js";

const server = new McpServer({
    name: "Manual MCP",
    version: "0.2.0",
});

server.tool(
    "listArticles",
    {
        "description": "List articles (title, tags, data, lastmod).",
        inputSchema: { type: "object", properties: {} }
    },
    async () => {
        await ensureLoaded();
        return { content: [{ type: "text", text: listArticlesText() }] };
    }
);
server.tool(
    "getArticle",
    {
        "description": "Get an article by title.",
        inputSchema: {
            type: "object",
            additionalPorperties: false,
            required: ["title"],
            properties: { title: { type: "string" } }
        }
    },
    async (args) => {
        await ensureLoaded();
        const p = String(args?.title || "");
        if (!p) return { content: [{ type: "text", text: "title required" }] };
        return { content: [{ type: "text", text: getArticleText(p) }] };
    }
);
server.tool(
    "searchArticles",
    {
        "description": "Search articles by query string (title, tags, content).",
        inputSchema: {
            type: "object",
            additionalProperties: false,
            required: ["q"],
            properties: {
                q: { type: "string" },
                fields: { type: "array", items: { type: "string", enum: ["title", "tags", "content"] } }
            }
        }
    },
    async (args) => {
        await ensureLoaded();
        const q = String(args?.q || "").trim();
        const fields = (args?.fields as Fields | undefined);
        return { content: [{ type: "text", text: searchArticlesText(q, fields) }] };
    }
);
server.tool(
    "reload",
    {
        description: "Reload all articles from the source.",
        inputSchema: {
            type: "object",
            properties: {}
        }
    },
    async () => {
        const msg = await reloadText();
        return { content: [{ type: "text", text: msg }] };
    }
);

const transport = new StdioServerTransport();
server.connect(transport);
