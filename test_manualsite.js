const endpoint = "http://127.0.0.1:3000/mcp";

async function rpc(method, params) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream"
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: `tools/call`,
      params: {
        name: method,
        ...params
      }
    })
  });
  const contentType = res.headers.get("content-type");
  if (contentType && contentType.includes("text/event-stream")) {
    const text = await res.text();
    // SSEのdata:部分だけ抽出
    const matches = text.match(/^data:\s*(.*)$/m);
    if (matches) {
      const json = JSON.parse(matches[1]);
      console.log(json);
    } else {
      console.log(text);
    }
  } else {
    const json = await res.json();
    console.log(json);
  }
}

async function main() {
  try {
    // getArticle
    console.log("\n=== Test getArticle ===");
    const getArticleRes = await rpc("getArticle", { title: "プラグインなしでVimを使うためのいろいろ" });
    console.log("Raw Response:", getArticleRes);
    console.log("Response Type:", typeof getArticleRes);
    if (typeof getArticleRes === 'string') {
      try {
        console.log("Parsed Response:", JSON.parse(getArticleRes));
      } catch (e) {
        console.log("Failed to parse response as JSON");
      }
    }

    // searchArticles
    console.log("\n=== Test searchArticles ===");
    const searchRes = await rpc("searchArticles", { q: "vim" });
    console.log("Raw Response:", searchRes);
    console.log("Response Type:", typeof searchRes);
    if (typeof searchRes === 'string') {
      try {
        console.log("Parsed Response:", JSON.parse(searchRes));
      } catch (e) {
        console.log("Failed to parse response as JSON");
      }
    }
  } catch (e) {
    console.error("Error:", e);
  }
}

main();