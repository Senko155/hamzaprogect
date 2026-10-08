---
name: WebGL preview limitation
description: The Replit screenshot browser for this project cannot create WebGL contexts.
---

The screenshot browser cannot create WebGL contexts. Three.js scene visuals should fall back to 2D canvas in this environment.

**Why:** The hosted capture browser lacks a usable WebGL context; renderer initialization logged errors even though the app and its canvas fallbacks worked.

**How to apply:** Check WebGL capability before creating a renderer, retain canvas fallbacks, and verify those fallbacks visually when WebGL is unavailable.
