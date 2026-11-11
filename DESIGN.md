# Toolsmith Console — Design System

This document defines the visual language for Toolsmith Console. It is the source of truth for UI styling decisions and should be consulted before introducing new colors, surfaces, cards, controls, or interaction patterns.

The direction is **quiet, precise, and utilitarian**: a restrained monochrome interface inspired by the visual principles of Orca, adapted to Toolsmith Console rather than copied component-for-component. Preserve the product's existing information architecture and behavior unless a change is explicitly requested.


## Design principles

1. **Surface contrast over decoration.** Separate areas with subtle surface changes and fine borders, not heavy shadows, gradients, or bright outlines.
2. **Monochrome by default.** Neutral colors carry the interface. Reserve semantic colors for status, warnings, errors, and important feedback.
3. **Consistent surfaces.** A card, menu, input, and page should use shared semantic tokens, not individually chosen hex values.
4. **Compact, readable density.** Prioritize clear labels, consistent alignment, and useful whitespace. Avoid unnecessary descriptions, metadata, or nested containers.
5. **Subtle interaction feedback.** Hover, focus, selected, disabled, and loading states should be apparent without being visually loud.
6. **Both themes are first-class.** Light and dark mode must have deliberate, legible contrast; neither should be treated as an afterthought.

## Color system

Colors are defined in `src/lib/styles/tokens.css` as RGB channel triplets so Tailwind opacity utilities continue to work. Use semantic utility classes such as `bg-surface`, `text-fg-muted`, and `border-line` instead of raw hex values.

### Light theme

| Token | Value | Intended use |
| --- | --- | --- |
| `canvas` | `#FAFAFA` | App chrome and surrounding canvas |
| `surface` | `#FFFFFF` | Main content and inset controls |
| `surface-raised` | `#FFFFFF` | Cards and raised content panels |
| `surface-hover` | `#F5F5F5` | Hovered rows, cards, and controls |
| `surface-active` | `#EAEAEA` | Pressed or strongly selected neutral surfaces |
| `line` | `#E5E5E5` | Default dividers and card outlines |
| `line-strong` | `#D4D4D4` | Focused, emphasized, or interactive outlines |
| `fg` | `#0A0A0A` | Primary text |
| `fg-muted` | `#404040` | Secondary text |
| `fg-subtle` | `#737373` | Supporting text |
| `fg-faint` | `#A3A3A3` | Low-priority metadata and hints |
| `accent` | `#171717` | Primary action background |
| `accent-fg` | `#FAFAFA` | Text and icons on the primary action |

### Dark theme

| Token | Value | Intended use |
| --- | --- | --- |
| `canvas` | `#0A0A0A` | App chrome and surrounding canvas |
| `surface` | `#0A0A0A` | Main content and inset controls |
| `surface-raised` | `#171717` | Cards and raised content panels |
| `surface-hover` | `#262626` | Hovered rows, cards, and controls |
| `surface-active` | `#404040` | Pressed or strongly selected neutral surfaces |
| `line` | `#262626` | Default dividers and card outlines |
| `line-strong` | `#404040` | Focused, emphasized, or interactive outlines |
| `fg` | `#FAFAFA` | Primary text |
| `fg-muted` | `#D4D4D4` | Secondary text |
| `fg-subtle` | `#A3A3A3` | Supporting text |
| `fg-faint` | `#737373` | Low-priority metadata and hints |
| `accent` | `#E5E5E5` | Primary action background |
| `accent-fg` | `#171717` | Text and icons on the primary action |

Semantic status colors (`success`, `warning`, `danger`, and `info`) should be used only when their meaning is relevant. Use low-opacity tinted backgrounds and borders for subtle status containers; avoid using semantic colors as general decoration.

## Surfaces and cards

### Page canvas

- Keep the app shell and content canvas visually calm.
- Use `bg-canvas` for app chrome and `bg-surface` for the main content area according to the existing layout.
- Do not add page-wide gradients, noise, textures, or decorative patterns without a clear product need.

### Cards and panels

- Use a **solid surface** and a **thin neutral border**: typically `rounded-xl border border-line bg-surface-raised`.
- Prefer a 1 px border to a prominent shadow for separation.
- Do not use translucent card backgrounds such as `bg-surface-raised/35` for ordinary content cards; transparency can make surfaces inconsistent across pages.
- Keep card padding consistent with nearby content and responsive breakpoints.
- Use `shadow-card` only if the design tokens explicitly call for it. The default card style is flat.
- Use a stronger border or surface change on hover only when the card is interactive.
- Avoid nesting multiple bordered cards when a divider or spacing can express the hierarchy.

### Menus, popovers, and dialogs

- Menus and popovers sit above the content surface and may use `shadow-pop` for clear elevation.
- Keep menu backgrounds opaque and borders slightly stronger than ordinary card borders where needed.
- Dialogs should have a clear title, concise content, and predictable primary/secondary actions.
- Do not use large shadows on ordinary cards just because an overlay requires elevation.

## Shape, spacing, and typography

- **Corner radius:** use `rounded-xl` for primary cards and panels; `rounded-lg` for compact controls, menus, and smaller containers; use full rounding for pills and status badges only.
- **Spacing:** prefer the existing Tailwind spacing scale. Align neighboring elements and avoid arbitrary one-off values unless a layout requires them.
- **Typography:** use the project's existing font stack. Establish hierarchy with size, weight, and spacing rather than introducing extra colors or decorative text styles.
- **Labels:** keep labels short and direct. Technical identifiers, descriptions, and provenance details should not appear in a dense list unless they help users make a decision.
- **Icons:** use the existing icon library and consistent sizing. Icons should communicate an action or state, not decorate every heading.

## Controls and interaction states

- **Inputs and selects:** use shared UI components and semantic surface, text, and border tokens. Native controls should not be introduced when an equivalent shared component exists.
- **Primary action:** use the semantic accent tokens. Keep secondary actions neutral and visually quieter.
- **Hover:** use `surface-hover` and, where useful, `line-strong`; avoid scaling or dramatic color transitions.
- **Focus:** provide a clearly visible keyboard focus indicator. Do not remove focus outlines without replacing them.
- **Selected:** distinguish selected navigation and options through a restrained surface or text-weight change. Maintain adequate contrast in both themes.
- **Disabled:** reduce emphasis while keeping the control and its state legible.
- **Loading:** use subtle skeletons that match the shape and surface of the content they replace.
- **Feedback:** use semantic status colors sparingly and keep success/error messages concise.

## Light and dark mode

- Use the existing theme mechanism and semantic tokens; do not create separate hard-coded color sets inside individual components.
- Check both themes whenever changing a token or component.
- Ensure text, borders, controls, selected states, and overlays remain distinguishable in both themes.
- Do not assume `bg-white`, `bg-black`, `text-gray-*`, or raw hex values will work correctly in both themes. Prefer the established semantic utilities.
- Preserve the user's theme preference and existing theme toggle behavior.

## Component reuse

Before building a new UI primitive, check `src/lib/components/ui` for an existing shared component. Prefer extending a shared component when the behavior and appearance are common across pages.

Common semantic classes include:

- Page and card surfaces: `bg-canvas`, `bg-surface`, `bg-surface-raised`
- Interactive surfaces: `bg-surface-hover`, `bg-surface-active`
- Borders: `border-line`, `border-line-strong`
- Text: `text-fg`, `text-fg-muted`, `text-fg-subtle`, `text-fg-faint`
- Overlays: `shadow-pop`

Use the exact token utilities supported by the current Tailwind configuration; this list describes the semantic naming convention, not permission to invent tokens.

## Before submitting a UI change

- [ ] The page preserves its existing behavior and information architecture unless the task requires a change.
- [ ] Colors use semantic tokens rather than raw values.
- [ ] Card surfaces and borders match the established style.
- [ ] Light and dark themes both look intentional and readable.
- [ ] Hover, focus, selected, disabled, and loading states are considered.
- [ ] Shared components are reused where practical.
- [ ] No unnecessary gradients, heavy shadows, decorative textures, or excess card nesting were introduced.
- [ ] `bun run check` and `git diff --check` pass when applicable.

## Reference

The visual direction is informed by the design principles of [Orca](https://github.com/stablyai/orca). This guide defines Toolsmith Console's own tokens and implementation conventions; it does not require copying Orca's assets, exact layouts, or product-specific UI.
