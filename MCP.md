# Germandex MCP

Read-only public student guides to Germany. Streamable HTTP endpoint: `/mcp`.
Public endpoint: https://germandex.com/mcp
Use a reviewed Cloudflare Pages preview URL for integration tests, with `/mcp` appended.

Tools: `list_cities`, `list_sections` (optional city), `get_guide` (route and optional language). Guide paths are an allowlist; no arbitrary URL fetch, writes, accounts or personal data. Twelve languages; terms/privacy English-only. All results include original source URLs. Guidance is not independent legal, medical, tax or financial verification; translations are not native-reviewed.

Any remote MCP client can use Streamable HTTP with no credentials. Browser clients are same-origin only. Stateless 2025 clients are supported alongside current SDK requests. No SSE session storage, Durable Objects, external fetches or new paid service. Request body limit 16 KiB; guide size limit 250,000 characters.

Build with Node 20+ from the repository root:

    npm ci --ignore-scripts
    npm run build:mcp
    npm run test:mcp

The checked-in `_worker.js` is a bundle of `mcp-site-worker.js` (the existing site and feedback worker) and `mcp-server.mjs`. Do not edit the generated bundle directly. After site-worker or MCP changes, rebuild and commit it. Existing Pages Git deploy settings do not need a new build command.

Staging must pass a real remote MCP client initialize/list/call test before production approval. Registry publishing follows production approval and separate final listing review. Registry metadata is stored in `mcp-server.json`; no listing is submitted by the build.
