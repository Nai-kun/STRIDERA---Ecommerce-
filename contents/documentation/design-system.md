# Design System — STRIDERA

> Version: 1.0 | Date: 2026-10-27

## Brand Identity

**STRIDERA** — A dynamic, performance-focused footwear brand. The metallic "S" logo communicates speed, precision, and premium craftsmanship. The visual identity blends chrome metallics with deep navy, creating a bold yet refined aesthetic.

## Color Palette

### Primary Colors
| Token | Name | Hex | Usage |
|-------|------|-----|-------|
| `--color-primary` | Steel Blue | `#4A90C4` | Primary buttons, links, accents |
| `--color-primary-dark` | Deep Steel | `#3A7AB0` | Button hover, active states |
| `--color-primary-light` | Light Steel | `#6BA8D6` | Backgrounds, highlights |

### Secondary Colors
| Token | Name | Hex | Usage |
|-------|------|-----|-------|
| `--color-secondary` | Navy | `#1A2744` | Headers, nav, footer, text |
| `--color-secondary-dark` | Deep Navy | `#0F1A2E` | Dark backgrounds |
| `--color-secondary-light` | Muted Navy | `#2A3A5C` | Hover states on dark surfaces |

### Neutral Colors
| Token | Name | Hex | Usage |
|-------|------|-----|-------|
| `--color-bg` | White | `#FFFFFF` | Page background |
| `--color-bg-warm` | Warm Off-White | `#FAFAF8` | Section backgrounds |
| `--color-bg-light` | Light Gray | `#F5F5F3` | Card backgrounds, input backgrounds |
| `--color-border` | Border Gray | `#E5E5E3` | Borders, dividers |
| `--color-text` | Near Black | `#1A1A1A` | Body text |
| `--color-text-muted` | Muted | `#6B7280` | Secondary text |
| `--color-text-light` | Light Text | `#9CA3AF` | Placeholder, disabled |

### Semantic Colors
| Token | Name | Hex | Usage |
|-------|------|-----|-------|
| `--color-success` | Success Green | `#059669` | Success states, in-stock |
| `--color-warning` | Warning Amber | `#D97706` | Low stock, warnings |
| `--color-error` | Error Red | `#DC2626` | Errors, out-of-stock |
| `--color-info` | Info Blue | `#2563EB` | Information notices |

### Accent
| Token | Name | Hex | Usage |
|-------|------|-----|-------|
| `--color-accent` | Chrome Silver | `#C0C8D0` | Metallic accents, badges |
| `--color-accent-warm` | Warm Chrome | `#B8C0C8` | Subtle metallic touches |

## Typography

### Font Families
| Token | Font | Fallback | Usage |
|-------|------|----------|-------|
| `--font-display` | Bebas Neue | Arial Narrow, sans-serif | Headlines, hero text, section titles |
| `--font-body` | Inter | system-ui, sans-serif | Body text, UI elements, forms |

### Type Scale
| Token | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| `--text-hero` | 72px / 4.5rem | 400 | 1.0 | Hero headline |
| `--text-h1` | 48px / 3rem | 400 | 1.1 | Page titles |
| `--text-h2` | 36px / 2.25rem | 400 | 1.2 | Section headings |
| `--text-h3` | 24px / 1.5rem | 600 | 1.3 | Card titles, sub-headings |
| `--text-h4` | 20px / 1.25rem | 600 | 1.4 | Small headings |
| `--text-body` | 16px / 1rem | 400 | 1.6 | Body text |
| `--text-body-sm` | 14px / 0.875rem | 400 | 1.5 | Secondary text, captions |
| `--text-caption` | 12px / 0.75rem | 500 | 1.4 | Labels, badges |
| `--text-price` | 20px / 1.25rem | 700 | 1.2 | Prices |

## Spacing

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | 4px | Tight gaps |
| `--space-sm` | 8px | Icon gaps, tight padding |
| `--space-md` | 16px | Standard padding |
| `--space-lg` | 24px | Section padding |
| `--space-xl` | 32px | Component gaps |
| `--space-2xl` | 48px | Section gaps |
| `--space-3xl` | 64px | Page section spacing |
| `--space-4xl` | 96px | Hero/major section spacing |

## Layout

| Token | Value | Usage |
|-------|-------|-------|
| `--container-max` | 1280px | Max content width |
| `--container-narrow` | 960px | Narrow content (checkout, forms) |
| `--container-wide` | 1440px | Full-width sections |
| `--container-padding` | 24px (mobile) / 48px (desktop) | Horizontal padding |

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | 4px | Small elements, badges |
| `--radius-md` | 8px | Cards, buttons |
| `--radius-lg` | 12px | Large cards, modals |
| `--radius-xl` | 16px | Feature cards |
| `--radius-full` | 9999px | Circular elements, pills |

## Shadows

| Token | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | 0 1px 3px rgba(0,0,0,0.08) | Subtle lift |
| `--shadow-md` | 0 4px 12px rgba(0,0,0,0.1) | Cards, dropdowns |
| `--shadow-lg` | 0 8px 24px rgba(0,0,0,0.12) | Modals, popovers |
| `--shadow-xl` | 0 16px 48px rgba(0,0,0,0.15) | Hero elements |

## Animation / Motion Spec

### Timing Tokens
| Token | Value | Usage |
|-------|-------|-------|
| `--duration-fast` | 150ms | Micro-interactions (button press, focus) |
| `--duration-normal` | 300ms | Standard transitions |
| `--duration-slow` | 500ms | Page/section reveals |
| `--duration-hero` | 800ms | Hero entrance animations |

### Easing
| Token | Value | Usage |
|-------|-------|-------|
| `--ease-out` | cubic-bezier(0.16, 1, 0.3, 1) | Entrance animations |
| `--ease-in-out` | cubic-bezier(0.65, 0, 0.35, 1) | Symmetric transitions |
| `--ease-spring` | cubic-bezier(0.34, 1.56, 0.64, 1) | Playful bouncy elements |

### Motion Patterns
1. **Hero text reveal:** Fade up from 20px below, staggered (0.1s per element), duration: 800ms
2. **Scroll reveal:** Fade up from 30px below when element enters viewport, duration: 500ms
3. **Product card hover:** Scale image to 1.05, translate -4px Y on card, duration: 300ms
4. **Color variant switch:** Crossfade image, duration: 300ms
5. **Cart drawer:** Slide in from right, duration: 300ms
6. **Add-to-cart feedback:** Button scale pulse + checkmark animation, duration: 500ms
7. **Nav dropdown:** Fade + translate Y from -8px, duration: 200ms
8. **Mobile nav:** Slide from right + backdrop fade, duration: 300ms
9. **Page transitions:** Opacity fade, duration: 200ms

### Reduced Motion
All animations respect `prefers-reduced-motion: reduce`:
- Replace transform animations with opacity-only
- Reduce durations to 0ms or minimal
- Disable auto-playing animations

## Button Styles

### Primary Button
- Background: `--color-primary`
- Text: white
- Padding: 14px 28px
- Border-radius: `--radius-md`
- Font: Inter 600, 16px
- Hover: `--color-primary-dark`, translate Y -1px
- Active: scale(0.98)
- Focus: 3px outline ring `--color-primary` at 50% opacity

### Secondary Button
- Background: transparent
- Border: 2px solid `--color-secondary`
- Text: `--color-secondary`
- Hover: filled `--color-secondary`, white text

### Ghost Button
- Background: transparent
- Text: `--color-primary`
- Hover: background `--color-bg-light`

## Responsive Breakpoints

| Name | Value | Usage |
|------|-------|-------|
| `--bp-mobile` | 480px | Small mobile |
| `--bp-tablet` | 768px | Tablet |
| `--bp-desktop` | 1024px | Desktop |
| `--bp-wide` | 1280px | Wide desktop |
