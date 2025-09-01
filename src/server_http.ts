import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";

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
            "List articles (title, tags, data, lastmod).",
            { type: "object", properties: {} },
            async () => {
                await ensureLoaded();
                return { content: [{ type: "text", text: listArticlesText() }] };
            }
        );
        server.tool(
            "getArticle",
            "Get an article by title.",
            { title: z.string() },
            async ({title}) => {
                await ensureLoaded();
                console.log("title", title);
                if (!title) return { content: [{ type: "text", text: "Title required" }] };
                return { content: [{ type: "text", text: getArticleText(title) }] };
            }
        );
        server.tool(
            "searchArticles",
            "Search articles by query string (title, tags, content).",
            { q: z.string(), fields: z.array(z.enum(["title", "tags", "content"])).optional() },                
            async ({q, fields}) => {
                await ensureLoaded();
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
