# Source Inventory — STRIDERA E-Commerce Project

> Generated: 2026-10-26 | Status: Reviewed

## Summary

The `source/` folder contains the project brand assets, product photography, and pre-built DFD diagrams. It is treated as **read-only**; all derived/transformed assets go to `frontend/public/assets/`.

---

## File Inventory

| # | Relative Path | Type | Purpose | Inspected | Notes |
|---|---------------|------|---------|-----------|-------|
| 1 | `STRIDERA_LOGO.png` | PNG (478 KB) | Official brand logo — metallic steel-blue "S" + "STRIDERA" navy wordmark | YES | High-res, transparent BG, suitable for all uses |
| 2 | `IPT.pdf` | PDF (113 KB) | IPT/Stridera project brief — MoSCoW requirements, payment sandbox spec | YES (via skill brief) | Core requirements reference |
| 3 | `DFD/dfd-level-0.mmd` | Mermaid (780 B) | Level-0 DFD — "Shoe E-Commerce System", 5 external entities | YES | Well-formed, ready to use |
| 4 | `DFD/dfd-level-1.mmd` | Mermaid (2.2 KB) | Level-1 DFD — 6 processes, 10 data stores D1-D10 | YES | Complete, consistent with L0 |
| 5 | `DFD/dfd-level-2-checkout.mmd` | Mermaid (1.7 KB) | Level-2 DFD — checkout & payment sub-processes | YES | Covers failure paths |
| 6 | `DFD/dfd-level-2-inventory.mmd` | Mermaid (821 B) | Level-2 DFD — inventory management | YES | Covers authorization failure |
| 7 | `DFD/dfd-level-2-fulfillment.mmd` | Mermaid (1 KB) | Level-2 DFD — fulfillment & notifications | YES | Covers provider failure fallback |
| 8-12 | `product_images/pcs/runningmen1-5.jpg` | JPEG (71-96 KB each) | Men running shoes — black/teal/lime Stridera branding | YES | Good resolution, white BG |
| 13-17 | `product_images/pcs/runningwomen1-5.jpg` | JPEG (59-88 KB each) | Women running shoes — cream/pink/mint, "Stride Fusion" model | YES | "MAX ENERGY" text visible |
| 18-19 | `product_images/pcs/Sneakermen1-2.jpg` | JPEG (51-54 KB each) | Men lifestyle sneakers — brown leather, gum sole, gold logo | YES | Premium finish |
| 20-24 | `product_images/pcs/Sneakerswomen1.jpg + Sneakerwomen2-5.jpg` | JPEG (44-61 KB each) | Women lifestyle sneakers — white leather, blue S, orange accent | YES | Clean lifestyle look |

## Brand Identity (from logo)
- Primary: Steel Blue (#4A90C4), Navy (#1A3A6B), Silver/Chrome
- Secondary: White background, near-black text
- Style: Bold, dynamic, metallic — speed and performance

## Asset Quality
All 17 product images: consistent white/neutral backgrounds, professional lighting, Stridera logo on shoe upper. Suitable for production use.

## Gaps
- No Basketball or Training shoe images → [Generated] placeholder products will be labeled as such
- No wireframes/UI screenshots in source
- No ERD → to be generated
- No font files → Google Fonts (Inter + Bebas Neue)

## Original → Derived Mapping
| Original | Derived | Transform |
|----------|---------|-----------|
| source/STRIDERA_LOGO.png | frontend/public/assets/logo/stridera-logo.png | Copy |
| source/product_images/pcs/runningmen*.jpg | frontend/public/assets/products/running-men-*.jpg | Rename |
| source/product_images/pcs/runningwomen*.jpg | frontend/public/assets/products/running-women-*.jpg | Rename |
| source/product_images/pcs/Sneakermen*.jpg | frontend/public/assets/products/sneaker-men-*.jpg | Rename |
| source/product_images/pcs/Sneakerswomen*.jpg + Sneakerwomen*.jpg | frontend/public/assets/products/sneaker-women-*.jpg | Rename |
