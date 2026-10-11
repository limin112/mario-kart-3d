---
name: web-search
description: Search the public web for current information. Use when you need up-to-date facts, library documentation, code examples, or free downloadable game assets and their licenses.
---

# Web Search

You do NOT have a built-in web search tool. When you need information from
the internet, use the `bash` tool to run:

```bash
/opt/hatch/bin/web-search "your query here"
```

It prints public web search results as text (titles, URLs, snippets).
Run more queries to dig deeper. To read a page's content, fetch it with:

```bash
curl -sL "https://example.com/page" | head -c 6000
```

Rules:
- Prefer official docs and primary sources (threejs.org, MDN, etc.).
- When looking for free game assets/models, always check the LICENSE
  (prefer CC0 / public domain, e.g. kenney.nl assets).
- Never download and execute untrusted scripts blindly; inspect first.
