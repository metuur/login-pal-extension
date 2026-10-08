# Login Pal — Product-page design specification

<!-- Hallmark · documentation critique: P4 H5 E4 S5 R5 V4 -->

This document captures the implemented design of `.product-page` after commit `402859b`. It is the shared design reference for the public product guide and its documentation page. It does **not** define the extension popup, Settings screen, authentication behavior, or storage architecture.

The filename `DESIGNE.md` follows the requested spelling. Tools that automatically discover only `design.md` or `DESIGN.md` must be pointed to this file explicitly. Amend this specification intentionally when the product-page design changes; do not treat earlier audit entries as the current visual specification.

## Contents

1. [Purpose and design direction](#purpose-and-design-direction)
2. [Pages and content architecture](#pages-and-content-architecture)
3. [Typography](#typography)
4. [Color and surface language](#color-and-surface-language)
5. [Canonical tokens](#canonical-tokens)
6. [Layout and responsive behavior](#layout-and-responsive-behavior)
7. [Header and navigation](#header-and-navigation)
8. [Hero and interactive walkthrough](#hero-and-interactive-walkthrough)
9. [Buttons, controls, and states](#buttons-controls-and-states)
10. [Supporting sections and documentation](#supporting-sections-and-documentation)
11. [Motion and accessibility](#motion-and-accessibility)
12. [Copy and product truth](#copy-and-product-truth)
13. [Assets and implementation](#assets-and-implementation)
14. [Verification and maintenance](#verification-and-maintenance)

## Purpose and design direction

Login Pal is presented as a Chrome extension for organizing synthetic test accounts, importing CSV files, finding the right persona, and deliberately filling an approved login page. Visitors should understand the product, try a safe illustration of account selection, and follow the local installation and first-use instructions.

| Axis                   | Current choice                                                         |
| ---------------------- | ---------------------------------------------------------------------- |
| Overall character      | Warm, clear, approachable product guide                                |
| Hallmark genre         | Editorial, with rounded sans typography                                |
| Macrostructure         | Workbench: product explanation beside a usable demonstration           |
| Palette                | Warm cream paper, deep green ink, leaf-green accent                    |
| Typography             | Plus Jakarta Sans display/body; JetBrains Mono supporting labels/code  |
| Header                 | Hyperlane-inspired floating pill; visible desktop links; mobile dialog |
| Footer                 | Mast-headed brand and navigation, followed by a small credit row       |
| Main interaction       | Synthetic account picker and optional five-scene walkthrough           |
| Decorative interaction | Green, mouse-following spotlight behind the homepage hero              |

### Reference mix

| Reference                                                            | What the current page borrows                                                                           |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| [Hollowback Apiary](https://www.usehallmark.com/examples/garden-01/) | Warm paper, green palette, generous editorial spacing                                                   |
| [Tally](https://www.usehallmark.com/examples/tally/)                 | Readable product explanation, straightforward actions, useful demo presentation                         |
| [Bubble](https://www.usehallmark.com/examples/hum-07/)               | Plus Jakarta Sans headings/body and JetBrains Mono labels                                               |
| [Hyperlane](https://www.usehallmark.com/examples/hyperlane/)         | Floating rounded header, centered desktop navigation, compact scroll state, cursor-following hero light |

These references inform Login Pal’s own content and controls. Young Serif was used in an earlier iteration; it is no longer the active display face. The current page does not adopt Bubble’s full multicolor palette or Hyperlane’s dark event identity.

## Pages and content architecture

### Homepage — `.product-page/index.html`

| Order | Section / anchor               | Purpose and content                                                                            |
| ----- | ------------------------------ | ---------------------------------------------------------------------------------------------- |
| 1     | Shared header                  | Brand, Why Login Pal, How it works, Docs, Install locally                                      |
| 2     | Hero / `#main`                 | “Less account hunting. More testing.”; product definition; demo and installation actions       |
| 3     | Walkthrough / `#workflow-demo` | Five-scene illustration, initially displaying the account picker                               |
| 4     | Page map                       | Learn the workflow, Install in Chrome, Read the docs                                           |
| 5     | `#overview`                    | Named account groups and deliberate, approved filling                                          |
| 6     | `#how-it-works`                | Import CSV; configure/authorize site; choose account and fill; direct scene-preview buttons    |
| 7     | `#setup`                       | Four-step unpacked Chrome extension installation checklist                                     |
| 8     | `#offline`                     | Local catalog capabilities and the separate connectivity needs of websites                     |
| 9     | Privacy note                   | Browser-local data, storage limitations, synthetic accounts only                               |
| 10    | `#access`                      | Site permissions, field inspection, explicit filling, revocation, other permissions disclosure |
| 11    | `#questions`                   | Login compatibility, localhost, import modes, login history, CSV guidance                      |
| 12    | Closing invitation             | “Your next test starts with the right account.” and installation action                        |
| 13    | Footer                         | Brand, principal links, credit, Back to top                                                    |

### Documentation — `.product-page/docs.html`

Shared header/footer surround a practical guide with a topic index and native expandable articles. The first setup article is open in the initial markup. Direct topic links open their target article when JavaScript is available.

| Anchor            | Topic                          |
| ----------------- | ------------------------------ |
| `#docs-settings`  | Settings and CSV groups        |
| `#docs-domains`   | Accepted domains               |
| `#docs-detection` | Login input detection          |
| `#docs-matching`  | Manual field matching          |
| `#docs-success`   | Successful login tracking      |
| `#docs-storage`   | Local data and troubleshooting |

Three captioned HTML/CSS illustrations explain the setup flow, URL-origin matching, and field detection. These are instructional figures with synthetic content, not live extension screens or real login forms.

## Typography

### Families and local loading

| Role            | Family            | Source file             | Usage                                                            |
| --------------- | ----------------- | ----------------------- | ---------------------------------------------------------------- |
| Display         | Plus Jakarta Sans | `plus-jakarta-sans.ttf` | Hero, section headings, documentation heading, brand             |
| Body and UI     | Plus Jakarta Sans | Same variable font      | Paragraphs, links, controls, account rows, navigation            |
| Supporting mono | JetBrains Mono    | `jetbrains-mono.ttf`    | Step numbers, document numbers/index label, code, keyboard hints |

The font-face declarations use normal style, `font-display: swap`, and weight ranges 200–800 for Plus Jakarta Sans and 100–800 for JetBrains Mono. Both HTML pages preload the local Jakarta font. No Google Fonts request is needed at runtime.

### Hierarchy

| Element                        | Implemented treatment                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------ |
| Hero heading                   | Weight 700; line height 1.1; tracking −0.025em; green emphasis on “More testing.”    |
| Desktop hero heading, ≥60rem   | `clamp(2.75rem, 4.9vw, 4.25rem)`                                                     |
| Narrow hero heading, ≤39.99rem | `clamp(2.65rem, 9.5vw, 3.75rem)`; maximum measure 13ch                               |
| Intermediate hero heading      | Uses `--text-display`; maximum measure 12ch                                          |
| Main section headings          | Weight 700; `--text-heading`; line height 1.15; component tracking commonly −0.035em |
| Demo headings                  | Generally 22px after desktop/mobile overrides; weight 600; compact line height       |
| Header brand                   | 23px normally; existing narrow-screen selector uses 22px                             |
| Lead paragraph                 | 18px, line height 1.65, measure up to 43ch; 16px on narrow screens                   |
| Section explanatory text       | 16px, line height 1.7, measure up to 50ch                                            |
| Controls and navigation        | Generally 14px; desktop navigation weight 500; header CTA weight 600                 |
| Small supporting text          | 12px; some compact demo metadata uses 10–11px                                        |

Headings stay upright. Do not restore italic display words or the earlier serif display face. Heading wrapping uses `overflow-wrap: anywhere` and `min-width: 0`. Use color, weight, and spacing to establish hierarchy.

The token scale is the base system; more specific selectors intentionally tune the hero, demo, and documentation. The actual cascade wins over a token’s nominal size.

## Color and surface language

| Token                                        | Role                                                 |
| -------------------------------------------- | ---------------------------------------------------- |
| `--color-paper`                              | Page canvas and quiet figure backgrounds             |
| `--color-ink`                                | Primary text and strongest hover treatment           |
| `--color-muted`                              | Supporting text, descriptions, metadata              |
| `--color-accent`                             | Primary actions, selected states, green emphasis     |
| `--color-accent-soft`                        | Selected rows, demo header, gentle supporting panels |
| `--color-accent-ink`                         | Text on green action surfaces                        |
| `--color-panel`                              | Demo and documentation content surfaces              |
| `--color-rule`                               | Dividers, subtle boundaries, control outlines        |
| `--color-note` / `--color-note-rule`         | Warm notes and caution-oriented illustrations        |
| `--color-caution`                            | Caution text on appropriate light surfaces           |
| `--color-focus`                              | Visible keyboard focus ring                          |
| `--color-error`                              | Failed action feedback                               |
| `--color-positive` / `--color-positive-soft` | Success aliases of accent tokens                     |
| `--color-shadow`                             | Low-opacity green-tinted elevation                   |
| `--color-overlay`                            | Mobile dialog backdrop                               |
| `--color-nav`                                | Translucent cream header surface                     |
| `--color-spotlight` / `--color-clear`        | Hero glow and its transparent falloff                |

Prefer open layouts, hairline rules, and selectively tinted surfaces. Cards serve the demo, instructions, and disclosures; do not enclose every paragraph in another card. The header uses blur; the mobile dialog backdrop deliberately does not.

## Canonical tokens

Source of truth: [`.product-page/tokens.css`](.product-page/tokens.css). The following is a complete snapshot, not a replacement stylesheet. Keep it synchronized when the source changes.

```css
:root {
  --color-paper: oklch(97% 0.018 92);
  --color-ink: oklch(27% 0.045 155);
  --color-muted: oklch(46% 0.025 145);
  --color-accent: oklch(43% 0.1 150);
  --color-rule: oklch(83% 0.025 110);
  --color-panel: oklch(99% 0.009 92);
  --color-accent-soft: oklch(93% 0.036 130);
  --color-accent-ink: oklch(99% 0.009 92);
  --color-positive: var(--color-accent);
  --color-positive-soft: var(--color-accent-soft);
  --color-caution: oklch(43% 0.085 60);
  --color-note: oklch(95% 0.065 86);
  --color-note-rule: oklch(82% 0.05 85);
  --color-focus: oklch(52% 0.16 45);
  --color-error: oklch(43% 0.15 28);
  --color-shadow: oklch(27% 0.045 155 / 0.08);
  --color-overlay: oklch(27% 0.045 155 / 0.35);
  --color-clear: oklch(97% 0.018 92 / 0);
  --color-spotlight: oklch(76% 0.12 140 / 0.3);
  --font-body: 'Plus Jakarta Sans', sans-serif;
  --font-display: 'Plus Jakarta Sans', sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
  --space-2xs: 4px;
  --space-xs: 8px;
  --space-base: 12px;
  --space-sm: 16px;
  --space-md: 24px;
  --space-lg: 32px;
  --space-xl: 48px;
  --space-section: 72px;
  --space-hero: 80px;
  --space-2xl: 64px;
  --space-3xl: 96px;
  --text-caption: 12px;
  --text-small: 14px;
  --text-body: 16px;
  --text-lead: 18px;
  --text-display: clamp(2.75rem, 5.2vw, 4.5rem);
  --text-heading: clamp(2rem, 3.4vw, 3rem);
  --text-title: 22px;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in: cubic-bezier(0.7, 0, 0.84, 0);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --dur-micro: 120ms;
  --dur-short: 220ms;
  --rule-hair: 1px;
  --radius-pill: 999px;
  --color-nav: oklch(97% 0.018 92 / 0.92);
  --radius-panel: 12px;
  --radius-control: 8px;
}
```

The spacing scale is named rather than strictly sequential: `--space-section` is 72px and `--space-hero` is 80px, while `--space-2xl` is 64px. Preserve names and values when reusing the system. Do not infer a mathematical typography ratio that the source does not declare.

### Exports

The portable export is the CSS token block above. This project currently has no generated Tailwind theme, DTCG JSON, or shadcn token mapping. Future exports should derive from these values rather than introduce a second palette.

## Extension palette adoption

The extension popup and Settings now reuse the product page’s color palette through [`public/palette.css`](public/palette.css), imported by [`public/ui.css`](public/ui.css). The stylesheet is packaged with the extension; it does not depend on the product-page directory at runtime. The development preview shell consumes the same variables.

This adoption covers cream backgrounds, near-white surfaces, deep green text and primary actions, soft green selected states, warm warnings, red error/destructive states, focus rings, and dialog backdrops. Extension typography, dimensions, layout, and behavior retain their existing definitions.

Shared color values match `.product-page/tokens.css`. Three extension-specific tokens support functional controls:

| Token                | Value                  | Purpose                               |
| -------------------- | ---------------------- | ------------------------------------- |
| `--color-input-rule` | `oklch(58% 0.055 145)` | Stronger input/select boundaries      |
| `--color-error-soft` | `oklch(96% 0.018 28)`  | Error and destructive-action surfaces |
| `--color-error-rule` | `oklch(80% 0.065 28)`  | Error boundaries                      |

The fallback select-arrow SVG embeds the muted color because CSS variables cannot cross into an image document. Keep it synchronized when changing that token.

Verification for this adoption: extension build and TypeScript passed; all 92 application tests passed. Local browser preview confirmed popup/Settings colors, tab navigation, and empty-import error feedback. The checked opaque text combinations range from 6.36:1 to 13.60:1; focus-ring and input-boundary combinations exceed 3:1. These token checks are not a full accessibility certification. The preview used an empty local catalog and did not access installed-extension data or exercise real website filling.

## Layout and responsive behavior

### Shared geometry

- Main content is capped at 1200px.
- Standard `.wrap` width is `calc(100% - 48px)`; at ≥60rem it is `calc(100% - 112px)`; at ≤39.99rem it is `calc(100% - 32px)`.
- The floating header has its own final width rules; it does not inherit the desktop content gutter.
- Full sections normally use 96px vertical padding, reduced to 64px on narrow screens.
- Desktop hero uses `minmax(0, 1.1fr) minmax(0, 1fr)` with a 64px gap. Its final desktop padding is 32px above and 48px below.
- Below the desktop breakpoint the hero is stacked. Narrow-screen hero spacing is 32px above, 48px below, with a 32px gap.
- The demo is at most 520px wide and aligns to the right of the desktop hero.
- Desktop workflow, setup, offline, and FAQ sections use an asymmetric 0.85fr / 1.15fr split with a 96px gap. Their compact layouts collapse.
- Overview uses an asymmetric two-column composition; access content uses equal desktop columns.
- `html` and `body` use `overflow-x: clip`. Do not conceal layout mistakes with horizontal scrolling.

### Responsive rules

| Condition                             | Key behavior                                                                                                                |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| ≥60rem (960px at default root size)   | Inline desktop navigation; hamburger hidden; split hero and section layouts                                                 |
| <60rem                                | Compact navigation through the existing dialog; stacked hero                                                                |
| ≤39.99rem (about 640px)               | Smaller gutters, lead text and demo padding; account avatars hidden; footer stacks                                          |
| ≤599px                                | Header uses 12px side gutters, 12px top margin, 8px sticky offset, 62px minimum height                                      |
| ≤22rem (352px)                        | Scene buttons and role filters use 11px text                                                                                |
| Documentation compact widths          | Topic index and article content rearrange into a single-column flow on phones; exact inherited rules remain in `styles.css` |
| Hover-capable device                  | Pointer hover feedback is available                                                                                         |
| Fine mouse pointer, no reduced motion | Hero spotlight may activate                                                                                                 |
| Reduced motion                        | CSS animations/transitions disabled; automatic walkthrough unavailable; spotlight hidden                                    |

Role filters always fit a four-column `minmax(0, 1fr)` grid. Navigation and action text should remain readable without splitting primary CTA labels. Long headings and technical strings must wrap within their containers.

## Header and navigation

### Floating pill

The same `header.nav` appears on both pages. It is sticky, sits above content at z-index 40, and uses a 1px rule, 999px radius, 92%-opaque cream surface, and 18px backdrop blur.

| Property         | At top                                               | After scrolling more than 48px    |
| ---------------- | ---------------------------------------------------- | --------------------------------- |
| Maximum width    | 1200px                                               | 1000px                            |
| Width constraint | `calc(100% - 48px)`; narrow override described above | Same                              |
| Sticky offset    | 16px; 8px on ≤599px                                  | Same                              |
| Minimum height   | 66px; 62px on ≤599px                                 | Same                              |
| Shadow           | `0 8px 24px var(--color-shadow)`                     | `0 12px 32px var(--color-shadow)` |
| State attribute  | `data-state="top"`                                   | `data-state="scrolled"`           |

Max-width and shadow transition for 220ms using `--ease-out`. A passive scroll listener changes the attribute only when the state changes. Reduced-motion CSS removes the transition. The smaller maximum width only changes the rendered width when space is available.

On desktop the header is a `1fr auto 1fr` grid: brand left, links centered, Install locally right. Links have 44px minimum height, 8px horizontal padding, and 16px gaps. The header’s “FOR TEST ACCOUNTS” sublabel is hidden.

The primary header CTA has a green background, cream text, pill radius, 600 weight, and 24px horizontal padding. Hover changes its surface to deep ink. Active input translates it down 1px. Keyboard focus remains visible.

### Compact menu

The compact button is a 44px square with a circular hit surface and a hamburger glyph. Desktop links are hidden below 960px. The header CTA also follows inherited compact visibility rules; its installation destination remains available in the dialog.

The native dialog is at most 440px wide, constrained to viewport width minus 32px, with a maximum height of 85dvh. It uses cream paper, a 12px radius, a hairline border, and a green translucent backdrop.

Menu links: Why Login Pal, How it works, Offline capabilities, Website access, Docs, and Get started. Opening sets `aria-expanded="true"`. Close button, Escape, backdrop click, or selecting a link dismisses it; the close event restores expanded state. Opening navigation pauses the walkthrough.

Anchor navigation reserves 112px of scroll padding for the sticky header.

## Hero and interactive walkthrough

### Hero composition

The left column contains a brief introduction, the main heading, a plain product description, “Try it yourself,” “Install locally,” and small local/synthetic-account reassurance. The right column contains the interactive demonstration, an optional Play tour control, five scene buttons, and progress text.

The illustration is an actual local HTML interface. It has a Login Pal identity strip and “Interactive demo” label, not a copied browser frame. Synthetic examples include Alex Morgan, Jamie Chen, and Sam Rivera with `.example.com` addresses. No password value or extension storage is involved.

### Scene contract

| Index | Label   | Intent                                                         | Tour duration |
| ----- | ------- | -------------------------------------------------------------- | ------------- |
| 0     | Before  | Show the friction of searching scattered places for an account | 4 seconds     |
| 1     | Import  | CSV rows become a named account group                          | 2.5 seconds   |
| 2     | Approve | Configure field matching and explicitly authorize the site     | 2.5 seconds   |
| 3     | Choose  | Search, filter, and select a fictional account                 | 2.5 seconds   |
| 4     | Fill    | Show the chosen identity and explain manual form submission    | 2.5 seconds   |

Initial state is **Choose**, with no autoplay. Play tour starts from Before when currently on Choose or the finished Fill scene. From another paused scene it resumes that scene. A complete pass lasts 14 seconds and stops at Fill.

The active panel is readable and operable. Inactive panels remain in the shared grid to reserve height but are inert, `aria-hidden`, and visually inactive. Scene buttons carry `aria-pressed`, and manual changes update a live announcement. Focus is moved out of a panel when it becomes inactive.

### Account picker

- Search is trimmed, case-insensitive matching against synthetic searchable metadata and row text.
- Role choices are All roles, Admin, Member, and Viewer; search and role filtering combine.
- Account count updates after filtering. A hidden selection is replaced with the first visible result.
- No results displays recovery guidance, clears selection, and disables Preview fill.
- Selecting a row updates its visual selection, `aria-pressed`, status copy, and the identity shown in Fill.
- Preview fill opens the final illustration. It never performs real autofill or submits anything.
- `/` selects Choose and focuses search unless the user is editing, holding modifier keys, or using the navigation dialog.
- Try it yourself and the `#account-search` anchor open the picker.
- First-use guide preview buttons select the corresponding scene, scroll the demonstration into view, and focus its heading.

### Demo surfaces

Use a near-white panel, 1px rule, 12px corner radius, and `0 16px 40px` tinted shadow. The brand strip uses the soft green surface. Selected rows combine a green boundary, soft green fill, and a visible circular marker; selection is not communicated through text color alone.

Search has a minimum height of 46px. Role controls and scene controls retain practical touch targets. Account rows use a final minimum height of 48px; the account list reserves 144px. The shared panels begin with a 420px minimum height and retain room for the longest scene.

### Mouse-following spotlight

The hero owns one decorative `::before` layer behind its content. It has `pointer-events: none`, so it cannot intercept controls. Its square size is `clamp(32rem, 65vw, 56rem)`. A radial green gradient fades to transparent at 68%.

Mouse coordinates are converted to hero-local `--spotlight-x` and `--spotlight-y` values. Updates are batched through `requestAnimationFrame`; movement translates the layer with `translate3d` rather than moving page content. Opacity fades over 220ms.

Only real mouse pointer events with hover/fine-pointer capability enable the effect. Touch input, reduced-motion preference, or `?reduce=1` prevents activation. Pointer exit/cancellation, pointer-capability changes, motion-preference changes, window blur/resize, and document hiding reset it and cancel pending work. The documentation page has no spotlight.

## Buttons, controls, and states

| Component                | Treatment and feedback                                                                |
| ------------------------ | ------------------------------------------------------------------------------------- |
| Primary content button   | Green fill, cream ink, 8px radius, 48px minimum height, typically 12px × 24px padding |
| Secondary content button | Transparent surface, ink text, hairline boundary, same basic radius                   |
| Text action              | Clear surface, inline arrow, minimum 44px height, underline on hover where styled     |
| Generic button hover     | −1px vertical movement on hover-capable devices                                       |
| Generic button active    | +1px vertical movement; reduced-motion override removes generic button transforms     |
| Keyboard focus           | 3px focus-token outline, 4px offset on links, buttons, inputs, and summaries          |
| Search focus             | 2px focus-token outline around the search container, 2px offset                       |
| Selected role/scene      | Soft green fill and green accent emphasis; pressed state exposed semantically         |
| Disabled button/input    | Opacity 0.55 and not-allowed cursor; functional disabled state where applicable       |
| Error feedback           | Error token and explanatory recovery text                                             |
| Success feedback         | Accent token and explicit confirmation text                                           |

States should describe real behavior. Navigation links do not need artificial loading or success states; asynchronous copy does.

### Installation checklist and clipboard

Four steps: obtain/extract the package; open `chrome://extensions` and enable Developer mode; Load unpacked and select `dist`; pin Login Pal and open Settings.

Checkboxes replace static numbers when JavaScript is available. Progress counts checked steps and gives a completion message after all four. Checked headings receive a strike-through. Progress is in-memory only and is not stored as a persistent installation record.

Copy extensions address starts disabled/busy while copying, announces progress, and sets `data-state="success"` or `"error"`. Success confirms the copied address; failure asks the visitor to type `chrome://extensions` manually. The action is re-enabled in either case.

## Supporting sections and documentation

- **Page map:** open row of links between hairline rules; wraps on small screens.
- **Overview:** one soft green group illustration and an open explanation of deliberate filling. Avoid repeated ornamental containment.
- **First-use steps:** numbered vertical entries with descriptions and direct demo-preview actions.
- **Installation:** functional checklist inside a restrained local-installation presentation.
- **Offline:** open explanatory layout separating local account management from access to a remote website.
- **Privacy note:** warm note surface with 12px corners and generous padding; factual limitations remain visible.
- **Access:** open desktop columns, soft green control note, native disclosure for additional permissions.
- **FAQ:** native details/summary rows divided by rules, with readable expanded answers.
- **Closing:** left-aligned heading and installation action; desktop alignment places the action alongside the heading.
- **Footer:** enlarged brand, wrapped navigation, attribution, and Back to top; stack on phones.
- **Documentation:** topic index next to disclosure articles when space permits. Articles use near-white surfaces, 1px rules, 12px corners, and no heavy shadow. Summary headings use body family at weight 600.
- **Documentation figures:** cream figure background, panel-white nodes, pale-green emphasis, muted captions, and caption associations. No real data or editable credential inputs.

Native disclosures remain useful without JavaScript. JavaScript adds opening the matching article on a topic click or hash change, including direct initial links.

## Motion and accessibility

### Motion behavior

The design uses CSS transitions and browser-native Web Animations. It does not require GSAP, a remote animation package, or an animation CDN.

Walkthrough motion is opt-in. Scene entrance begins with a short opacity transition; individual details use small translations, restrained scale, staggered CSV rows, field sweeps, and confirmation reveals. Before-scene detail timing is multiplied by 1.35. Each scene’s detail animations share pause, seek, and cleanup with its progress clock.

Interaction inside a panel takes ownership: it stops automatic progression and finishes pending detail entrances. Mouse hover temporarily pauses playback. Leaving the viewport, hiding the document, or opening the menu also pauses playback. The intersection threshold is 0.25.

Reduced-motion CSS disables animation/transition effects and smooth scrolling. The walkthrough also reads the live media preference, disables automatic playback, and makes scene changes immediate. The header loses its width/shadow transition, and the spotlight is hidden. `?reduce=1` is a JavaScript review override for the demo and spotlight; it is not a replacement for the operating-system CSS media query.

### Accessibility expectations

1. Keep the Skip to content link and logical heading order.
2. Use real anchors, buttons, inputs, native dialogs, and native disclosures.
3. Preserve descriptive names for search, menu controls, checkboxes, and illustrations.
4. Keep keyboard focus visible and inactive scenes out of the focus order.
5. Announce results and actions through the existing status/live regions.
6. Preserve empty, disabled, failure, and successful-action feedback.
7. Respect reduced motion and make all important content available without animation.
8. Use synthetic data only, including screenshots and verification output.
9. Test real mobile layouts; clipping alone does not prove the content fits.

With JavaScript disabled, the initial sample picker and numbered setup instructions remain readable; documentation and FAQ disclosures remain native. Role filters, tour/scene controls, installation progress, and clipboard enhancements are not presented as working features.

## Copy and product truth

Use short, concrete language addressed to developers and QA. Explain the next action and its result. Keep the distinction between the page’s simulation and the real extension clear.

Approved recurring labels include “Try it yourself,” “Install locally,” “Play tour,” “Pause tour,” “Preview fill,” “Copy extensions address,” and “Read the docs.” Do not rename the simulated Preview fill to a real-world submission action.

Preserve these facts in future design changes:

- Login Pal is for synthetic test accounts.
- The user imports a CSV, reviews the group, configures matching rules, and approves site access.
- Importing a CSV does not itself authorize autofill.
- Autofill occurs on explicit user action. The user submits the website’s form separately.
- The product page never accesses extension storage or real credentials.
- The page describes local unpacked installation; it does not offer a Chrome Web Store release or host an extension package.
- Local catalog operations can work offline; signing into a remote website still depends on that website and connectivity.
- Browser-local storage does not imply a master-password lock. Keep the existing key-storage limitation clear.
- Do not fabricate usage counts, testimonials, compatibility guarantees, or security claims.

Detailed product behavior remains governed by the approved project contract and current amendments. This visual specification is not an alternate source of authentication requirements.

## Assets and implementation

### Source ownership

| File                                                               | Responsibility                                                                          |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| [index.html](.product-page/index.html)                             | Homepage content, synthetic demo, setup instructions, shared navigation/footer markup   |
| [docs.html](.product-page/docs.html)                               | Detailed guide, topic index, disclosures, figures                                       |
| [tokens.css](.product-page/tokens.css)                             | Canonical named design values                                                           |
| [styles.css](.product-page/styles.css)                             | Preserved base stylesheet and structural/component rules; imports tokens                |
| [guide.css](.product-page/guide.css)                               | Active visual layer, local font faces, final responsive overrides, header and spotlight |
| [main.ts](.product-page/main.ts)                                   | Demo, menu, topics, installation, spotlight, floating-header behavior                   |
| [main.js](.product-page/main.js)                                   | Generated browser script; regenerate from TypeScript                                    |
| [README.md](.product-page/README.md)                               | Local usage, design overview, generation instructions                                   |
| [AUDIT.md](.product-page/AUDIT.md)                                 | Design findings and change history                                                      |
| [VERIFICATION.md](.product-page/VERIFICATION.md)                   | Observed checks and limitations                                                         |
| [.hallmark/log.json](.product-page/.hallmark/log.json)             | Design selection history                                                                |
| [.hallmark/preflight.json](.product-page/.hallmark/preflight.json) | Cached initial design scan; not guaranteed to describe subsequent typography changes    |
| [AGENTS.md](.product-page/AGENTS.md)                               | Product-page maintenance constraints                                                    |

Both pages load `styles.css`, then `guide.css`, and defer `main.js`. Later, more-specific guide rules intentionally override earlier values. The legacy stylesheet has not been fully consolidated into tokens; historical literal colors and dimensions still exist. Do not claim every old selector is the active design.

### Local asset inventory

| Asset                                         | Role                                                |
| --------------------------------------------- | --------------------------------------------------- |
| `favicon.svg`                                 | Existing Login Pal icon, also used in the interface |
| `favicon.ico`                                 | Alternate browser favicon                           |
| `apple-touch-icon.png`                        | Touch icon                                          |
| `plus-jakarta-sans.ttf`                       | Active variable display/body font                   |
| `PLUS-JAKARTA-SANS-LICENSE.txt`               | Plus Jakarta Sans OFL license                       |
| `jetbrains-mono.ttf`                          | Active variable mono font                           |
| `JETBRAINS-MONO-LICENSE.txt`                  | JetBrains Mono OFL license                          |
| `geist-regular.woff2`, `geist-semibold.woff2` | Retained fonts from earlier styles                  |
| `FONT-LICENSE.txt`                            | Geist license                                       |
| `young-serif-regular.ttf`                     | Retained former display font                        |
| `YOUNG-SERIF-LICENSE.txt`                     | Young Serif license                                 |

Use packaged assets only. Keep licenses with redistributed fonts. Do not silently remove historical files during a visual edit. Illustrations are local markup/CSS; no stock photography is required by this system.

### Generation

Run from the repository root after changing `main.ts`:

```sh
rtk proxy node node_modules/typescript/bin/tsc .product-page/main.ts --target ES2020 --lib ES2020,DOM --strict --skipLibCheck --module esnext --noEmit --ignoreConfig
rtk proxy node_modules/.bin/esbuild .product-page/main.ts --outfile=.product-page/main.js --target=es2020
```

Serve the repository with a local static server and open `/.product-page/`. The page is independent of the extension bundle.

### Deterministic review controls

| Query       | Scene                                 |
| ----------- | ------------------------------------- |
| `?t=2.8`    | Before                                |
| `?t=5.8`    | Import                                |
| `?t=8.3`    | Approve                               |
| `?t=10.8`   | Choose                                |
| `?t=13.3`   | Fill                                  |
| `?reduce=1` | JavaScript reduced-motion review mode |

The timestamp is in seconds, clamps negative input to zero, and wraps across the 14-second cycle. Capture mode pauses the scene/progress at its local timestamp. These controls are for review, not advertised product features.

## Verification and maintenance

### Recorded evidence

This documentation was assembled from the current source and existing verification notes. It does not claim a new browser or extension test run merely because the document was created.

- Latest Bubble/header pass: homepage widths 320, 375, 414, 768, 960, and 1440px; documentation widths 320, 375, 414, and 768px; no horizontal document overflow observed.
- Browser confirmed Plus Jakarta Sans loading and 700-weight page headings. Desktop/mobile screenshots were inspected.
- Header entered the 1000px maximum-width scroll state and remained at the expected 16px desktop offset. Mobile open/Escape and page navigation passed.
- Earlier spotlight checks observed two-axis tracking, fade on exit, clickable demo controls, and reduced-motion hiding. Cleanup/guard checks were additionally exercised in isolation; the verification log records the asynchronous browser assertion limitation.
- Earlier full redesign pass checked all five scenes, expanded docs, demo filtering/selection, clipboard success/failure, no-JavaScript fallback, and finite tour playback.
- Earlier rendered-text contrast checks found no failures in their tested states. This is not a complete accessibility certification or a new contrast measurement after every font change.
- Application-scoped tests previously passed: 6 files, 92 tests. The extension build also passed during the broader redesign.
- Unfiltered `npm run check` previously collected unrelated installed-skill suites and failed test discovery. Keep that limitation separate from product-page behavior; see `VERIFICATION.md`.

### Future change checklist

- Read this document and the nearest `AGENTS.md`; limit changes to the requested surface.
- Keep the same fonts, cream/green tokens, visible desktop links, floating header, and restrained motion unless a new direction is explicitly requested.
- Update tokens before adding a new semantic color or type role.
- Preserve homepage and documentation routes, hashes, copy intent, native disclosure behavior, and synthetic-only data.
- Check 320, 375, 414, 768, 960, and desktop widths after geometry or font changes; inspect both top and scrolled header states.
- Exercise keyboard focus, mobile menu, empty search, selected account, clipboard failure, reduced motion, and no-JavaScript fallback when affected.
- Regenerate JavaScript after TypeScript changes; run scoped checks and record observed evidence.
- Update this document, README, and design metadata when a design decision changes. Keep historical verification clearly dated rather than presenting it as a fresh check.

The current design is a light product-guide variant. No dark theme or alternate extension-UI variant is defined here.
