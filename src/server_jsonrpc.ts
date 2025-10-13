import { loadAllArticles } from "./loader.js";
import { searchArticles } from "./search.js";

type JsonRpcReq = { jsonrpc: "2.0"; id?: number|string; method: string; params?: any; };
type JsonRpcRes = { jsonrpc: "2.0", id?: number|string|null; result?: any; error?: { code: number; message: string; data?: any; } };

const enc = new TextEncoder();
const dec = new TextDecoder();

let cache: Awaited<ReturnType<typeof loadAllArticles>> = [];

export type Fields = Array<"title" | "tags" | "content">;

type ToolDef = {
    name: string;
    description: string;
    input_schema: any;
};

const TOOL_DEFS: ToolDef[] = [
    {
        name: "listArticles",
        description: "List articles (title, tags, date, lastmod).",
        input_schema: { type: "object", additionalProperties: false, properties: {} }
    },
    {
        name: "getArticle",
        description: "Get an article by title.",
        input_schema: {
            type: "object",
            additionalProperties: false,
            properties: { title: { type: "string" } }
        }
    },
    {
        name: "searchArticles",
        description: "Search articles by query string (title, tags, content).",
        input_schema: {
            type: "object",
            additionalProperties: false,
            required: ["q"],
            properties: {
                q: { type: "string" },
                fields: {
                    type: "array", 
                    items: { type: "string", enum: ["title", "tags", "content"] }
                }
            }
        }
    },
    {
        name: "reload",
        description: "Reload all articles from the source.",
        input_schema: { type: "object", additionalProperties: false, properties: {} }
    }
];

export async function init() {
    cache = await loadAllArticles();
    console.error("[server] loaded articles =", cache.length);
}

let buffer = "";
process.stdin.on("data", async (chunk) => {
  buffer += chunk.toString();
  let idx;
  while ((idx = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;

    let req: JsonRpcReq;
    try { req = JSON.parse(line); }
    catch (e:any) {
      write({ jsonrpc:"2.0", id:null, error:{ code:-32700, message:"Parse error", data:e?.message }});
      continue;
    }

    const res = await handle(req);

    if (req.id !== undefined && res) write(res);
  }
});

export async function ensureLoaded() {
  if (cache.length === 0) {
    cache = await loadAllArticles();
    console.error("[server] argv=", process.argv, "cwd=", process.cwd(), "MANUAL_ROOT=", process.env.MANUAL_ROOT, "MANUAL_CONTENT=", process.env.MANUAL_CONTENT);
    console.error("[server] lazy loaded =", cache.length);
  }
}

export function listArticlesText(): string {
    const rows = cache.map(a => ({
        title: a.meta.title,
        tags: a.meta.tags ?? [],
        date: a.meta.date,
        lastmod: a.meta.lastmod
    }));

    return rows.length
        ? rows.map(r => `${r.title} [${(r.tags || []).join(", ")}] ${r.date ?? r.lastmod ?? ""}`).join("\n")
        : "(no articles)";
}

export function getArticleText(title: string): string {
    const hit = cache.find(a => a.meta.title === title);
    if (!hit) return `(not found) ${title}`;
    return [
        `# ${hit.meta.title}`,
        `tags: ${(hit.meta.tags || []).join(", ")}`,
        `date: ${hit.meta.date ?? ""}`,
        `lastmod: ${hit.meta.lastmod ?? ""}`,
        "",
        hit.body
    ].join("\n");
}

export function searchArticlesText(q: string, fields?: Fields): string {
    const res = q ? searchArticles(cache, q, fields) : [];
    if (!res || res.length === 0) return "(no results)";
    return res.map((r: any) =>
        `- ${r.meta?.title ?? r.title} [${(r.meta?.tags || r.tags || []).join(", ")}]`
    ).join("\n");
}

export async function reloadText(): Promise<string> {
    cache = await loadAllArticles();
    return `reloaded: true, count: ${cache.length}`;
}

async function handle(req: JsonRpcReq): Promise<JsonRpcRes> {
    if (req.method !== "initialize") await ensureLoaded();

    console.error("[rpc] <-", req.method, "id=", req.id);

    const id = req.id ?? null;
    try {
        switch (req.method) {
            case "initialize": {
                return ok(id, {
                    protocolVersion: "1.0",
                    serverinfo: { name: "manual-mcp", version: "0.1.0" },
                    capabilities: {
                        tools: {},
                        resources: {}
                    }
                });
            }
            case "initialized": {
                return ok(id, { acknowledges: true });
            }
            case "tools/list": {
                return ok(id, { tools: TOOL_DEFS });
            }
            case "tools/call": {
                console.error("[rpc] tools/call:", req.params?.name);

                const name = req.params?.name as string;
                const args = (req.params?.arguments ?? {}) as any;
                if (!name) return err(id, -32602, "Tool name required");
                
                switch (name) {
                    case "listArticles":
                        const rows = cache.map(a => ({
                            title: a.meta.title,
                            tags: a.meta.tags ?? [],
                            date: a.meta.date,
                            lastmod: a.meta.lastmod
                        }));

                        return ok(id, { content: [{ type: "text", text: rows }]});
                    case "getArticle": {
                        const title = args.title as string;
                        if (!title) return err(id, -32602, "title required");
                        const hit = cache.find(a => a.meta.title === title);
                        if (!hit) return err(id, -32000, "not found");
                        return ok(id, { content: [{ type: "text", text: { meta:hit.meta, body: hit.body } }] });
                    }
                    case "searchArticles": {
                        const q = String(args.q ?? "").trim();
                        const fields = args.fields as Array<"title"|"tags"|"content"> | undefined;
                        const res = q ? searchArticles(cache, q, fields) : [];
                        return ok(id, { content: [{ type: "text", text: res }] });
                    }
                    case "reload": {
                        cache = await loadAllArticles();
                        return ok(id, { content: [{ type: "text", text: { reloaded: true, count: cache.length } }] });
                    }
                    default:
                        return err(id, -32601, `unknown tool: ${name}`);
                }    
            }
            default:
                return err(id, -32601, `Method not found: ${req.method}`);
        }
    } catch (e:any) {
        return err(id, -32000, e?.message ?? "Server error");
    }
}

function ok(id: any, result: any): JsonRpcRes { return { jsonrpc:"2.0", id, result }; }
function err(id:any, code:number, message:string, data?:any): JsonRpcRes { return { jsonrpc:"2.0", id, error: { code, message, data } }; }
function write(obj:any) { process.stdout.write(enc.encode(JSON.stringify(obj) + "\n")); }

init().catch(e => {
    write({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "init failed", data: e?.message }});
})
