import { loadAllArticles } from "./loader.js";
import { searchArticles } from "./search.js";

type JsonRpcReq = { jsonrpc: "2.0"; id?: number|string; method: string; params?: any; };
type JsonRpcRes = { jsonrpc: "2.0", id?: number|string|null; result?: any; error?: { code: number; message: string; data?: any; } };

const enc = new TextEncoder();
const dec = new TextDecoder();

let cache: Awaited<ReturnType<typeof loadAllArticles>> = [];

export type Fields = Array<"title" | "tags" | "content">;

export async function init() {
    cache = await loadAllArticles();
    console.error("[server] loaded articles =", cache.length);
}

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

function ok(id: any, result: any): JsonRpcRes { return { jsonrpc:"2.0", id, result }; }
function err(id:any, code:number, message:string, data?:any): JsonRpcRes { return { jsonrpc:"2.0", id, error: { code, message, data } }; }
function write(obj:any) { process.stdout.write(enc.encode(JSON.stringify(obj) + "\n")); }

init().catch(e => {
    write({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "init failed", data: e?.message }});
})
