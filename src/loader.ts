import fg from "fast-glob";
import fs from "fs/promises";
import path from "path";
import matter from "gray-matter";

export type ArticleMeta = {
    title: string;
    author?: string;
    date?: string;
    lastmod?: string;
    tags?: string[];
    url?: string;
};

export type Article = {
    meta: ArticleMeta;
    body: string;
};

const ROOT = "YOUR_MANUAL_DIRECTORY";
const CONTENT_DIR = "docs/content";

export async function loadAllArticles(): Promise<Article[]> {
    console.error("[loader] ROOT=", ROOT);
    console.error("[loader] CONTENT_DIR=", CONTENT_DIR);
    console.error("[loader] BASE(cwd join)=", path.join(ROOT, CONTENT_DIR));

    const base = path.join(ROOT, CONTENT_DIR);
    const files = await fg("**/*.md", { cwd: base, dot: false });
    const out: Article[] = [];

    for (const rel of files) {
        const abs = path.join(base, rel);
        const raw = await fs.readFile(abs, "utf8");
        const parsed = matter(raw);
        const fm = parsed.data as any;
        out.push({
            meta: {
                title: fm.title ?? path.basename(rel, ".md"),
                author: fm.author,
                date: fm.date,
                lastmod: fm.lastmod,
                tags: Array.isArray(fm.tags) ? fm.tags : undefined
            },
            body: parsed.content ?? ""
        });
    }
    
    return out;
}
