---
name: blog-note-cover-picgo
description: Generate blog article cover images from post content and user-provided reference images, upload them through PicGo Server, and update static-blog front matter cover fields. Use when Codex is asked to make or refresh covers for Hexo/Hugo/Jekyll/Markdown blog posts, especially note/tutorial posts, using a visual style reference and a local PicGo API such as http://127.0.0.1:36677/upload with multipart field name files.
---

# Blog Note Cover PicGo

## Overview

Use this skill to turn a batch of Markdown blog posts into generated cover images, upload those images with PicGo, and write the returned CDN URLs back into each post's front matter.

The user should provide reference image(s) for style. Treat them as style/composition references only unless the user explicitly asks to reuse specific content.

## Workflow

1. **Identify target posts**
   - Inspect the blog structure and front matter conventions first.
   - For Hexo projects, look under `source/_posts`.
   - Select posts by the user's criteria, such as note/tutorial tags, a specific series, or an explicit file list.
   - Record each post's path, title, slug/`abbrlink`, current `cover`, category, and key topics.

2. **Extract article themes**
   - Read enough of each post to identify the visual subject: framework names, concepts, APIs, workflows, tools, and recurring metaphors.
   - Prefer concise theme notes over full summaries.
   - Preserve exact title text for the cover prompt.

3. **Use reference images correctly**
   - Require or ask for reference image(s) if none are present.
   - Extract style traits: aspect ratio, palette, typography mood, character style, layout, border treatment, poster density, and recurring motifs.
   - Do not copy unrelated words, characters, or exact poster content from the references.
   - Use the reference images as style guidance for `image_gen`; do not replace the requested article title with reference text.

4. **Generate covers with built-in `image_gen`**
   - Use the built-in `image_gen` tool for cover generation.
   - Generate one image per distinct article prompt.
   - For an existing satisfactory cover, reuse it only when the user explicitly allows it.
   - After each image is generated, copy the selected output from the default generated-images directory into the blog workspace, for example `source/img/covers/notes/<slug>.png`.
   - Inspect representative outputs; regenerate any image with bad title text, copied reference text, wrong topic, watermarks, or awkward layout.

5. **Upload with PicGo Server**
   - Confirm PicGo Server config or use the endpoint given by the user.
   - Default endpoint: `http://127.0.0.1:36677/upload`.
   - Multipart field name must be `files`; batch upload with repeated `-F "files=@path"` parts.
   - If the port is closed, check whether PicGo is running and start it only when appropriate for the environment.
   - Save or parse the JSON response; `result` is the ordered CDN URL array.

6. **Update post front matter**
   - Map upload results back to posts by the same ordered slug list used for upload.
   - Replace only the `cover:` line unless the user requested other metadata changes.
   - Keep quoting style simple, e.g. `cover: 'https://...'`.
   - Do not rewrite unrelated front matter or article body.

7. **Validate**
   - Verify the number of generated images, uploaded URLs, and updated posts match.
   - Run the static-site build command if available, such as `npm run build` or the project's documented build command.
   - Report any unrelated dirty worktree files without reverting them.

## Prompting

Read `references/cover-prompt-template.md` when composing prompts for multiple articles or when a cover needs regeneration.

Prompt rules:

- Include exact cover text in a `Text (verbatim)` section.
- Say clearly that reference images are style references only.
- Include article-specific concepts as visual objects, not long paragraphs.
- For technical-note series, keep a coherent family resemblance while varying motifs per article.
- Avoid asking the model to render too much small text; use 2-4 small labels at most.
- Reject or regenerate outputs that copy reference-image text unrelated to the article.

## PicGo Notes

Batch upload example:

```powershell
$args = @("-s", "-S", "-X", "POST", "http://127.0.0.1:36677/upload")
foreach ($file in $files) {
  $args += @("-F", "files=@$file")
}
$response = & curl.exe @args
```

Expected response shape:

```json
{
  "success": true,
  "result": ["https://cdn.example/a.png", "https://cdn.example/b.png"]
}
```

If PicGo is configured for GitHub and fails with certificate errors, check whether the user's existing PicGo launch script sets `NODE_TLS_REJECT_UNAUTHORIZED=0`. Prefer using the user's established PicGo setup rather than inventing a new uploader.
