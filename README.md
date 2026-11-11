# Germandex

Practical starter guides for international students moving to Germany.

**Website:** [germandex.com](https://germandex.com) · **MCP documentation:** [MCP.md](MCP.md) · **Contributing:** [CONTRIBUTING.md](CONTRIBUTING.md)

Germandex brings arrival paperwork, housing, medical help, groceries, food, sports and everyday student life into one place. It covers twelve German cities in twelve languages, with shared Germany-wide guides for subjects such as banking, insurance and student jobs.

The project is an experiment with editorial agents: AI-assisted research, writing and translation, with maintainer review and explicit approval before production changes. The repository contains the website, its content, the Markdown export pipeline and a public read-only MCP server. It does not contain the private editorial workflow or visitor feedback data.

There are no ads, affiliate links or sponsored picks. Page views are counted with cookieless Cloudflare Web Analytics. Advice is for orientation, not independent legal, medical, tax or financial verification; check official sources before making decisions. Translations are not native-reviewed.

## Try it

1. Open [germandex.com](https://germandex.com), choose a city and read its guides.
2. Switch language in the footer. English, French, Spanish, Portuguese, Turkish, Chinese, Hindi, Tamil, Thai, Indonesian, Croatian and Slovenian are available. Terms and privacy remain English-only.
3. For AI clients, connect to the unauthenticated Streamable HTTP endpoint at `https://germandex.com/mcp`. It can list cities, list sections and fetch public guides as Markdown. See [MCP.md](MCP.md) for limits and client setup.

Cities: Aachen, Berlin, Bochum, Dortmund, Düsseldorf, Erlangen, Frankfurt, Hamburg, Köln, München, Münster and Tübingen.

## How it works

This is a plain HTML/CSS/JavaScript website, not a framework application. Node is used for generation, bundling and tests.

```text
index.html + i18n/*.json + seo.json
    |                         |
    | generate:markdown       | Cloudflare Pages Worker
    v                         v
public Markdown exports      route-specific HTML
    |                         |
    +---- read-only MCP ------+---- browser readers
```

- **Content and navigation:** `index.html` holds the English guide content, styling and browser navigation. `i18n/*.json` holds translations; `seo.json` holds localized metadata and city names.
- **HTML delivery:** Cloudflare Pages serves static assets. The Pages Worker renders route-specific content, metadata, canonicals, hreflang and navigation, including for readers without JavaScript.
- **Markdown and AI access:** the generator produces Markdown copies of guide pages, language indexes and full-text exports. The MCP server reads only allowlisted public guides; it cannot write, fetch arbitrary URLs or access feedback.
- **Optional feedback:** Turnstile checks submissions, D1 stores records, private R2 stores screenshots and a notification service sends alerts. Those resources are separate from the public guide exports.

## Run locally

Requirements: **Node.js 20+**, npm, and optionally Python 3 for a simple static preview. No credential is needed to generate or build the public site content.

```sh
npm ci --ignore-scripts
npm run generate:markdown
npm run test:markdown
npm run build:mcp
npm run test:mcp
```

To preview the static site from the repository root:

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000`. This previews the static browser experience only. It does not run Cloudflare HTMLRewriter, runtime bindings, feedback or the `/mcp` endpoint. Use a reviewed Cloudflare Pages preview deployment for Worker integration tests, never production as a test environment.

## Repository map

| Path | Purpose | Edit directly? |
| --- | --- | --- |
| `index.html` | English guides, styles, navigation and footer | Yes |
| `i18n/` | Translation dictionaries | Yes |
| `seo.json` | Localized titles, descriptions and city names | Yes |
| `scripts/generate-markdown.cjs` | Markdown and discovery-file generator | Yes |
| City/language folders, shared `.md` files, `llms*.txt` | Generated public guide exports and indexes | Regenerate from source |
| `mcp-server.mjs` | Public read-only MCP tools and request guards | Yes |
| `mcp-site-worker.js` | HTML renderer, feedback handler and MCP entry point | Yes |
| `_worker.js` | Bundled Pages Worker | No, run `npm run build:mcp` |
| `test-mcp.mjs` | Local protocol and guard tests | Yes |
| `robots.txt`, `sitemap.xml`, `_routes.json` | Discovery and Pages routing | Keep aligned with routes |
| `wrangler.jsonc` | Pages configuration and binding identifiers | Review changes carefully |
| `mcp-server.json` | MCP registry metadata | Publishing is a separate step |
| `MCP-LICENSES.txt`, font license files | Third-party notices | Preserve |

## Change a guide

1. Edit the relevant article in `index.html`.
2. Update the matching translations and SEO fields. Preserve proper names, source links and caveats. Keep national guidance in shared guides and city-specific facts on city pages.
3. Run the generation, build and test commands above. Commit source and generated changes together.
4. Request review on a branch. Inspect affected pages on desktop and mobile before a production change.

New cities also need route, metadata, translation, sitemap, generator and MCP updates. Do not treat adding an HTML article as the complete change. See [CONTRIBUTING.md](CONTRIBUTING.md) for editorial, design and release rules.

## Deployment and safety

`main` is the production branch. Cloudflare Pages automatically deploys pushes and merges to it; branches can create preview deployments. A local build does not deploy anything.

Production changes require the maintainer's explicit approval. Merge normally so newer history survives; do not reset `main` to a staging branch. After a release, check the affected guide routes and public discovery/MCP endpoints. Roll back with a reviewed revert, not a history rewrite.

For a repository-only documentation commit that must not deploy, Cloudflare supports a commit message prefixed with `[CF-Pages-Skip]`. Verify the deployment state afterward. See [Cloudflare's GitHub integration documentation](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/).

Cloudflare configuration uses Pages assets, a D1 database, a private R2 bucket, a notification service and Turnstile. Runtime secrets such as `TURNSTILE_SECRET` and `LINK_SECRET` belong in Cloudflare bindings or a secure secret store, never in Git. The checked-in configuration contains binding identifiers, not those secret values.

**Preview warning:** the existing configuration shares D1/R2 resources with production. Do not submit test feedback casually. Isolate bindings before feedback integration testing, and check the actual Pages settings before changing infrastructure. Never put visitor feedback, emails or screenshots in fixtures or public exports.

## License

No project-wide open-source license has been selected. Public visibility alone does not grant an open-source license. `MCP-LICENSES.txt` and the font license files cover their respective third-party components, not Germandex's original code or content.
