import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";

import {
    init, ensureLoaded,
    listArticlesText, getArticleText,
    searchArticlesText, reloadText
} from "./server_jsonrpc.js";

init();
const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.type("text/plain").send("OK"));

app.all("/mcp", async (req, res) => {
    const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
    });

    console.log("[mcp] request:", req.body);

    const server = new McpServer({
        name: "manual-mcp",
        version: "0.2.0",
    });

    try {
        const logResponse = (toolName: string, response: any) => {
            console.log(`[mcp] ${toolName} response:`, response);
            return response;
        };

        server.tool(
            "listArticles",
            "List articles (title, tags, data, lastmod).",
            async () => {
                await ensureLoaded();
                const response = { content: [{ type: "text", text: listArticlesText() }] };
                return logResponse("listArticles", response);
            }
        );
        server.tool(
            "getArticle",
            "Get an article by title.",
            { title: z.string() },
            async ({title}) => {
                await ensureLoaded();
                console.log("title", title);
                if (!title) {
                    const response = { content: [{ type: "text", text: "Title required" }] };
                    return logResponse("getArticle", response);
                }
                const response = { content: [{ type: "text", text: getArticleText(title) }] };
                return logResponse("getArticle", response);
            }
        );
        server.tool(
            "searchArticles",
            "Search articles by query string (title, tags, content).",
            { q: z.string(), fields: z.array(z.enum(["title", "tags", "content"])).optional() },                
            async ({q, fields}) => {
                await ensureLoaded();
                const response = { content: [{ type: "text", text: searchArticlesText(q, fields) }] };
                return logResponse("searchArticles", response);
            }
        );
        server.tool(
            "reload",
            "Reload all articles from the source.",
            async () => {
                const msg = await reloadText();
                const response = { content: [{ type: "text", text: msg }] };
                return logResponse("reload", response);
            }
        );

        res.on('close', () => {
            console.log('Request closed');
            transport.close();
            server.close();
        });

        // レスポンスをインターセプトするためのラッパー
        const originalJson = res.json.bind(res);
        const originalSend = res.send.bind(res);
        const originalEnd = res.end.bind(res);
        const originalWrite = res.write.bind(res);

        res.json = function(body) {
            console.log('[mcp] response (json):', body);
            return originalJson(body);
        };

        res.send = function(body) {
            console.log('[mcp] response (send):', body);
            return originalSend(body);
        };

        res.end = function(chunk?: any, encoding?: any, callback?: any) {
            if (chunk) {
                console.log('[mcp] response (end):', chunk);
            }
            return originalEnd(chunk, encoding, callback);
        };

        res.write = function(chunk: any, encoding?: any, callback?: any) {
            console.log('[mcp] response (write):', chunk);
            return originalWrite(chunk, encoding, callback);
        };

        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
    } catch (error) {
        console.error('Error handling MCP request:', error);
        if (!res.headersSent) {
            const response = {
                jsonrpc: '2.0',
                error: {
                    code: -32603,
                    message: 'Internal server error',
                },
                id: null,
            };
            console.log('[mcp] error response:', response);
            res.status(500).json(response);
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
