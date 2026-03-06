# CivicTag Extension Icons

This folder should contain the icon files for the Chrome extension.

## Required Files

- `icon16.png` - 16x16 pixels (toolbar icon, small)
- `icon48.png` - 48x48 pixels (extensions management page)
- `icon128.png` - 128x128 pixels (Chrome Web Store, installation)

## Design Guidelines

### Theme
- Use Indian flag colors: Orange (#FF9933), White (#FFFFFF), Green (#138808)
- Include a tag or badge symbol to represent "tagging authorities"
- Keep it simple and recognizable at small sizes

### Design Ideas

**Option 1: Tag Icon**
- A price tag shape with Indian flag colors
- Gradient from orange to green
- White tag string/hole

**Option 2: Badge Icon**
- Circular badge with Indian tricolor
- White "@" symbol in center
- Clean, modern look

**Option 3: Flag + Tag**
- Simplified Indian flag (horizontal stripes)
- Small tag icon overlaid
- Minimalist design

## How to Generate

### Using Figma (Free)

1. Create a 128x128px canvas
2. Design your icon with the guidelines above
3. Export as PNG at 1x, 2x, and 3x sizes
4. Resize to create 16px and 48px versions
5. Optimize with [TinyPNG](https://tinypng.com)

### Using Canva (Free)

1. Use "Custom dimensions" → 128x128px
2. Add shapes and colors per guidelines
3. Download as PNG
4. Resize using an image editor

### Using DALL-E / Midjourney (AI)

Example prompt:
```
Create a simple, flat design app icon for a Chrome extension called CivicTag. 
The icon should feature a tag or badge symbol using Indian flag colors 
(orange #FF9933, white, and green #138808). Clean, modern, minimalist style. 
128x128 pixels, transparent background.
```

### Using Inkscape (Free, Open Source)

1. Download from [inkscape.org](https://inkscape.org)
2. Create 128x128px document
3. Use vector tools to design icon
4. Export as PNG at different sizes

## File Naming

Once created, rename files exactly as:
- `icon16.png`
- `icon48.png`
- `icon128.png`

Place them in the root `Twitter_Extension/` directory.

## Update Manifest

The icons are already configured in `manifest.json`:

```json
"icons": {
  "16": "icon16.png",
  "48": "icon48.png",
  "128": "icon128.png"
}
```

## Testing

After adding icons:

1. Reload extension in `chrome://extensions/`
2. Check toolbar - should show 16px icon
3. Check extensions page - should show 48px icon
4. Check Chrome Web Store upload - should accept 128px icon

## Temporary Placeholder

Until proper icons are created, the extension will use Chrome's default icon.

## Need Help?

If you're designing icons for CivicTag:

1. Share your design in GitHub Discussions
2. Get feedback from other contributors
3. Submit a PR with the icon files

## License

Icon designs should be:
- Original work or properly licensed
- Compatible with MIT license
- Free for commercial use
- Credited if required by license

---

**Status:** ⚠️ Icons not yet created - contributions welcome!
