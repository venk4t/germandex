# Contributing to Germandex

Changes start on a staging branch, with a preview for review. Production changes need owner approval. Do not add collaborators, change visibility, select a license, spend money or contact third parties without a separate decision.

## Editorial rules

Write clear, practical advice for newcomers. Prefer official sources for legal, financial, immigration, university and medical facts. Preserve citations and caveats. Do not present uncertain or stale prices, schedules, policies or availability as settled facts. Keep city-specific facts local; national guidance belongs on shared pages. Avoid repetition and information overload. Translations are not native-reviewed; preserve proper names and source URLs.

No ads, sponsored picks, affiliate links or tracking pixels. Page views are counted with cookieless Cloudflare Web Analytics; keep privacy disclosures accurate. Feedback is optional, limited and private. Do not collect additional user data or relax quota/retention protections without review.

## Design rules

Keep the existing fonts and type scale. Use Inter and Newsreader emphasis; do not italicize entire sentences. Typography is quiet: black and grey, rounded soft-grey content cards, restrained existing accents. Plain horizontal text navigation, active items underlined, clear section/subsection hierarchy. No pills, glowing states, decorative animation or unrequested dropdowns.

Footer order is Terms, Privacy, Cities, Language. LLM discovery files and robots.txt remain at their own paths, not in the visible footer. All labels are underlined; Cities and Language are native collapsible lists with no arrow icons and closed by default. Keep labels inline where space permits and wrap lists on narrow screens. Preserve mobile behavior and site-wide consistency. The current sign logo and font licenses must remain intact.

## Checks before review

    npm ci --ignore-scripts
    npm run generate:markdown
    npm run test:markdown
    npm run build:mcp
    npm run test:mcp

Commit source and generated changes together. Visually inspect actual staging pages on desktop and mobile, including both footer states. Verify routes with JavaScript disabled when renderer changes. Test MCP with a real client after protocol changes. Do not substitute a successful build for a deployed endpoint test.

Never commit credentials, private keys, account exports, personal feedback or screenshots. Use environment examples with placeholders only. Keep dependency versions pinned, review lockfile changes, and preserve third-party notices. Do not edit generated `_worker.js` directly; edit its source and rebuild.

## Review and release

Describe what changed, the source evidence for content changes, tests run and remaining caveats. Include the staging URL. Use a normal merge into main after approval, preserving main's history. Confirm the resulting production deployment before calling it complete.
