# Markdown exports

The generated .md files mirror index.html and i18n/*.json. The national language guide includes the course sections for all ten cities, rather than depending on a visitor's saved city. Terms/privacy are English-only.

After changing page content, translations, city names or SEO titles:

    npm ci --ignore-scripts
    npm run generate:markdown
    npm run test:markdown

Commit the generated files together with the source change. Run the freshness check before each content push. llms-full.txt holds all English content; each language prefix has its own llms.txt and llms-full.txt. Scripts, navigation and feedback forms are excluded; source links are preserved.
