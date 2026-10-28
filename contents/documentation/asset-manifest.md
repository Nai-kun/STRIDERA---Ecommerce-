# Asset Manifest — STRIDERA E-Commerce

> Tracks the lineage of every asset from source original to derived/used copy.
> Source files in `source/` are **read-only**. Derived copies go to `frontend/public/`.

---

## Source Assets

| Source File | Type | Status | Notes |
|-------------|------|--------|-------|
| `source/IPT revised.pdf` | PDF | Read-only | Binary — used as requirements baseline (text extracted via DFD `.mmd` files) |
| `source/DFD/revised dfd-level-0.mmd` | Mermaid | Read-only | Authoritative Level 0 DFD — mirrored in `contents/diagrams/` |
| `source/DFD/revised  dfd-level-1.mmd` | Mermaid | Read-only | Authoritative Level 1 DFD — mirrored in `contents/diagrams/` |
| `source/DFD/revised  dfd-level-2-checkout.mmd` | Mermaid | Read-only | Authoritative Level 2 checkout DFD — mirrored in `contents/diagrams/` |
| `source/DFD/revised  dfd-level-2-fulfillment.mmd` | Mermaid | Read-only | Authoritative Level 2 fulfillment DFD — mirrored in `contents/diagrams/` |
| `source/DFD/revised  dfd-level-2-inventory.mmd` | Mermaid | Read-only | Authoritative Level 2 inventory DFD — mirrored in `contents/diagrams/` |

---

## DFD Derivation Record

| Derived File | Source | Transformation | Date |
|-------------|--------|----------------|------|
| `contents/diagrams/dfd-level-0.mmd` | `source/DFD/revised dfd-level-0.mmd` | Direct mirror (identical Mermaid syntax) | 2026-10-28 |
| `contents/diagrams/dfd-level-1.mmd` | `source/DFD/revised  dfd-level-1.mmd` | Direct mirror + classDef styling added | 2026-10-28 |
| `contents/diagrams/dfd-level-2-checkout.mmd` | `source/DFD/revised  dfd-level-2-checkout.mmd` | Direct mirror + 4.7 receipt flow added | 2026-10-28 |
| `contents/diagrams/dfd-level-2-fulfillment.mmd` | `source/DFD/revised  dfd-level-2-fulfillment.mmd` | Direct mirror | 2026-10-28 |
| `contents/diagrams/dfd-level-2-inventory.mmd` | `source/DFD/revised  dfd-level-2-inventory.mmd` | Direct mirror | 2026-10-28 |

---

## Product Images

Product images are referenced by URL in the database seed (`database/seeds/seed.js`). They are served from external URLs (placeholder/demo sources). No image files are stored in this repository.

| Image Field | Source | Notes |
|-------------|--------|-------|
| `Product.images[].url` | External CDN/placeholder URLs in seed | Demo data only — production would use uploaded images |

---

## Logo & Brand Assets

No logo or brand image files were present in `source/` during this revision cycle. The `source/` folder contained only the PDF and DFD `.mmd` files. The `scripts/derive_assets.py` script was unavailable (not present in workspace). Brand identity is applied via CSS design tokens in `frontend/app/globals.css` per `contents/documentation/design-system.md`.

---

## Notes

- `scripts/inventory_source.py` and `scripts/derive_assets.py` referenced in `skill/SKILL UPDATE.md` were **not present** in the workspace. Per the skill's fallback rule, requirements were derived from `contents/documentation/requirements.md` and the source DFD `.mmd` files.
- All source files remain unmodified in `source/` (verified: `git status source/` shows only untracked files added by the user, no modifications).

