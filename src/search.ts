import type { Article } from "./loader.js";

export function searchArticles(
    data: Article[],
    q: string,
    fields: Array<"title"|"tags"|"content"> = ["title","tags","content"]
) {
    const needle = q.toLowerCase();
    return data.filter(a => {
        const hits: boolean[] = [];
        if (fields.includes("title"))
            hits.push((a.meta.title ?? "").toLowerCase().includes(needle));
        if (fields.includes("tags"))
            hits.push((a.meta.tags ?? []).some(t => t.toLowerCase().includes(needle)));
        if (fields.includes("content"))
            hits.push(a.body.toLowerCase().includes(needle));
        return hits.some(Boolean);
    }).map(a => ({
        title: a.meta.title,
        tags: a.meta.tags ?? [],
        lastmod: a.meta.lastmod,
        snippet: makeSnippet(a.body, needle)
    }));
}

function makeSnippet(body: string, needle: string, radius = 60) {
    const i = body.toLowerCase().indexOf(needle);
    if (i < 0) return body.slice(0, radius*2) + (body.length > radius*2 ? "..." : "");
    const start = Math.max(0, i - radius);
    const end = Math.min(body.length, i + needle.length + radius);
    return (start>0?"...":"") + body.slice(start, end) + (end<body.length?"...":"");
}