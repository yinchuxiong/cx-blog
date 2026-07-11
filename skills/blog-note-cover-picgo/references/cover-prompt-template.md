# Cover Prompt Template

Use this template as a starting point. Fill in only details supported by the article and the user's reference images.

```text
Use case: illustration-story / technical blog cover.
Asset type: 16:9 blog cover image.
Input images: use the reference images provided by the user as style references only: <style traits>. Do not copy exact reference text, characters, or unrelated content.

Primary request: Generate a cover for the article titled "<exact title>".
Scene/backdrop: <background, borders, panels, poster layout, or other traits from references>.
Subject: <article-specific central character/object/diagram>.
Style/medium: <cute hand-drawn / bold poster / notebook board / clean technical illustration / etc.>.
Composition/framing: wide 16:9, <where title goes>, <where subject goes>, keep readable margins.
Text (verbatim, must be readable and accurate): main title "<exact title or split title>"; small labels: "<label 1>", "<label 2>", "<label 3>", "<label 4>".
Color palette: <palette from references plus article-specific accents>.
Constraints: accurate readable text; no misspellings; no watermark; no external logos; no photorealism unless requested; no unrelated reference text.
```

## Series Variations

- LangChain-style technical notes: warm yellow/green palette, chain links, panda/programmer character, cards for prompts/tools/models/parsers.
- LangGraph-style workflow notes: blue productivity-board palette, grid panels, graph nodes, edges, routing arrows, supervisor/checkpoint diagrams.
- AI Agent memory notes: warm peach/red poster energy, memory cards, vector store/database icons, recall/profile elements.

Do not hard-code these styles. Use them only when they match the user's reference images or explicit request.
