# manual-mcp 概要

## 目的
Markdown 記事を読み込み、検索・参照するための Model Context Protocol (MCP) サーバーです。HTTP と stdio の 2 形態で提供され、ツールとして list/get/search/reload を公開します。

## エントリと実行方法
- HTTP 版: `src/server_http.ts`（ビルド後は `dist/server_http.js`）。エンドポイント: `/health`, `/mcp`。
- stdio 版: `src/server.ts`（ビルド後は `dist/server.js`）。
- スクリプト:
  - 開発 (HTTP): `npm run dev`
  - 開発 (stdio): `npm run dev:stdio`
  - ビルド: `npm run build`
  - 実行 (HTTP): `npm start`
- パッケージ名: `manual-mcp`。Node 18+ 必須。

## 提供ツール（MCP Tools）
- `listArticles`: 記事一覧（title, path, tags, date/lastmod）をテキストで返却。
- `getArticle`: `path` で記事取得。メタと本文を整形して返却。
- `searchArticles`: クエリ `q` でタイトル/タグ/本文を検索（`fields` で対象を `title|tags|content` から指定可）。本文のスニペット付きで返却。
- `reload`: 記事の再読み込み。

## データ読み込み
- 実装: `src/loader.ts`
- 使用ライブラリ: `fast-glob`, `gray-matter`
- ルート: `ROOT="YOUR_MANUAL_DIRECTORY"`に指定
- コンテンツディレクトリ: `CONTENT_DIR="docs/contents"`
- frontmatter（例）: `title`, `author`, `date`, `lastmod`, `tags`（配列）。
- `meta.path` は `docs/contents/...` 形式に正規化（区切りは `/`）。

## 検索ロジック
- 実装: `src/search.ts`
- 小文字化して部分一致検索。
- 対象フィールド: `title`, `tags`, `content`（指定がなければ全て）。
- ヒット周辺からスニペットを生成し結果に含める。

## MCP サーバー実装
- 共通: `@modelcontextprotocol/sdk` の `McpServer` を使用。
- HTTP 版: `StreamableHTTPServerTransport`（`src/server_http.ts`）。`/mcp` に JSON-RPC over HTTP を受け付け、`server_old.ts` の関数群を呼び出す。
- stdio 版: `StdioServerTransport`（`src/server.ts`）。
- 実処理関数は `src/server_old.ts` に定義（`init/ensureLoaded/listArticlesText/getArticleText/searchArticlesText/reloadText`）。

## 留意点
- 記事ルートが絶対パスで固定されており、他環境では動作しません。環境変数や設定ファイルでの切替にすると移植性が向上します。
- 返却は主にテキスト形式で、MCP クライアントからの利用を想定しています。
