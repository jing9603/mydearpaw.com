# DearPaw Landing — Claude Code Guide

## Project
Static HTML/CSS landing page. No build system. Files: `index.html`, `assets/css/style.css`, `assets/images/`.

## Image Generation (Replicate API)
**Always use this tool when new images are needed.** Don't use placeholder images.

```bash
node scripts/generate-image.js "prompt" "filename.webp" [--model schnell|pro|sdxl]
```

- **schnell** (default) — fast, great for drafts & iteration
- **pro** — higher quality, use for hero/featured images  
- **sdxl** — good for product lifestyle shots

The token is auto-loaded from `.env.local`. Output saved to `assets/images/`.

### Workflow
1. Determine what image is needed from context
2. Write a descriptive prompt (style: warm, modern, pet-focused)
3. Run the script → get back `assets/images/<filename>`
4. Insert the returned path directly into HTML/CSS

### Prompt tips for DearPaw brand
- Warm, soft lighting; cream/warm-white backgrounds
- Real pets (dogs/cats), not cartoons
- Clean, minimal, app-lifestyle aesthetic
- Avoid: dark/moody, busy backgrounds, generic stock-photo feel
