import express from "express";
import { randomUUID } from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

import {
    init, ensureLoaded, 
    listArticlesText, getArticleText,
    searchArticlesText, reloadText, Fields
} from "./server_old.js";


const transports = new Map<string, StreamableHTTPServerTransport>();

async function makeServer() {
    const server = new McpServer({
        name: "manual-mcp",
        version: "0.2.0"
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
            console.log("title", args?.title);
            const title = String(args?.title || "");
            if (!title) return { content: [{ type: "text", text: "title required" }] };
            return { content: [{ type: "text", text: getArticleText(title) }] };
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

    return server;
}

export async function start() {
    const app = express();
    app.use(express.json({ limit: "10mb" }));

    app.get("/health", (_req, res) => res.type("text/plain").send("OK"));

    (async () => {
        try {
            console.log("[mcp] initalizing content...");
            await init();
            console.log("[mcp] content initialized");
        } catch (e: any) {
            console.error("[mcp] init failed but server stays up:", e?.stack || e);
        }
    })();

    app.post("/mcp", async (req, res) => {
        try {
            const sid = String(req.headers["mcp-session-id"] || "");
            const existing = sid && transports.get(sid);

            if (!existing && isInitializeRequest(req.body)) {
                const server = await makeServer();
                let transport: StreamableHTTPServerTransport | undefined;
                transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: () => randomUUID(),
                    onsessioninitialized: (id) => {
                        transports.set(id, transport!);
                        console.log("[mcp] session:", id);
                    },
                    enableDnsRebindingProtection: true,
                    allowedHosts: ["127.0.0.1", "localhost"],
                });
                await server.connect(transport);
                await transport.handleRequest(req, res, req.body);
                return;
            }

            if (existing) {
                await existing.handleRequest(req, res, req.body);
                return;
            }

            console.error("[mcp] bad request (dump):", JSON.stringify(req.body));
            res.status(400).json({
                jsonrpc: "2.0",
                error: { code: -32000, message: "No session and not initialize" },
                id: req.body?.id ?? null
            });
        } catch (e: any) {
            console.error("[mcp] POST /mcp error:", e?.stack || e);
            res.status(500).json({
                jsonrpc: "2.0",
                error: { code: -32000, message: "Internal error", data:String(e?.message || e) },
                id: null
            });
        }
    });
    
    app.get("/mcp", async (req, res) => {
        try {
            const sid = String(req.headers["Mcp-Session-Id"] || "");
            const t = sid ? transports.get(sid) : undefined;
            if (!t) return res.status(400).send("Invalid or missing Session Id");
            await t.handleRequest(req, res);
        } catch (e: any) {
            console.error("[mcp] GET /mcp error:", e?.stack || e);
            res.status(500).send("internal error");
        }
    });

    app.delete("/mcp", async (req, res) => {
        const sid = String(req.headers["Mcp-Session-Id"] || "");
        const t = sid ? transports.get(sid) : undefined;
        if (!t) return res.status(400).send("Invalid or missing Session Id");
        t.close();
        transports.delete(sid);
        res.status(204).send();
    });

    const PORT = Number(process.env.PORT || 3080);
    app.listen(PORT, "127.0.0.1", () => {
        console.log(`[mcp] listening http://127.0.0.1:${PORT}/mcp`)
    });

    process.on("uncaughtException", (e) => console.error("[uncahghtException]", e));
    process.on("unhandledRejection", (e) => console.error("[unhandledRejection]", e));
}

start().catch((e) => {
    console.error(e);
    process.exit(1);
});