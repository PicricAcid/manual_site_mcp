import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";

import {
    init, ensureLoaded,
    listArticlesText, getArticleText,
    searchArticlesText, reloadText, Fields
} from "./server_old.js";

init();
const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.type("text/plain").send("OK"));

app.all("/mcp", async (req, res) => {
    console.log("[mcp] request:", req.body);
    const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
    });

    if (req.method !== "POST") {
        return res.status(405).json({
            jsonrpc: "2.0",
            error: {
                code: -32000,
                message: `Method not allowed: ${req.method}`,
            },
            id: null
        });
    }

    const server = new McpServer({
        name: "manual-mcp",
        version: "0.2.0",
    });

    try {
        server.tool(
            "listArticles",
            "List articles (title, path, tags, data, lastmod).",
            { type: "object", properties: {} },
            async () => {
                await ensureLoaded();
                return { content: [{ type: "text", text: listArticlesText() }] };
            }
        );
        server.tool(
            "getArticle",
            "Get an article by path.",
            {
                type: "object",
                additionalPorperties: false,
                required: ["path"],
                properties: { path: { type: "string" } }
            },
            async (args) => {
                await ensureLoaded();
                const p = String(args?.path || "");
                if (!p) return { content: [{ type: "text", text: "Path required" }] };
                return { content: [{ type: "text", text: getArticleText(p) }] };
            }
        );
        server.tool(
            "searchArticles",
            "Search articles by query string (title, tags, content).",
            {
                type: "object",
                additionalProperties: false,
                required: ["q"],
                properties: {
                    q: { type: "string" },
                    fields: { type: "array", items: { type: "string", enum: ["title", "tags", "content"] } }
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
            "Reload all articles from the source.",
            {
                type: "object",
                properties: {}
            },
            async () => {
                const msg = await reloadText();
                return { content: [{ type: "text", text: msg }] };
            }
        );

        res.on('close', () => {
            console.log('Request closed');
            transport.close();
            server.close();
        });

        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
    } catch (error) {
        console.error('Error handling MCP request:', error);
        if (!res.headersSent) {
            res.status(500).json({
                jsonrpc: '2.0',
                error: {
                    code: -32603,
                    message: 'Internal server error',
                },
                id: null,
            });
        }
    }
});

app.listen(3000, () => {
    console.log('MCP HTTP server is running on http://localhost:3000/mcp');
});

process.on("SIGINT", async () => {
    console.log("Shutting down server...");

    process.exit(0);
});
