# Login Pal product-page redesign

The user selected a full Apple-inspired treatment: white and silver surfaces, centered headings, and spacious product storytelling. The scope is the standalone `.product-page` site, including its shared documentation presentation.

## Direction

- White canvas, near-black type, silver secondary surfaces, blue actions, and the existing Login Pal brand mark.
- System typography with a large centered hero. Keep the actual product demo prominent and usable rather than substituting a static mockup.
- A slim, full-width sticky product navigation with one primary action: Install locally. The demo is the secondary hero action.
- Reading order: introduction and demo → account organization → first-use workflow → offline behavior and local data → website access → questions → installation.
- Short workflow explanations with optional detailed instructions. Preserve technical content and documentation deep links.
- Keep the full-width mouse spotlight, softened to match the neutral palette. Keep touch and reduced-motion exclusions, manual scene navigation, and opt-in tour playback.

## Implementation

The existing HTML and TypeScript remain framework-free. `tokens.css` owns semantic colors and typography; `product.css` owns the new presentation over the existing component layouts. Both HTML pages share the presentation. The background extension and stored data are outside scope. All assets remain local and demo accounts remain fictional. Installation continues to explain unpacked local installation; there are no Web Store or automatic-submit claims.

Native details provide progressive disclosure. Installation text becomes a label for its checkbox so clicking the instruction toggles its step. The sticky navigation reports the current homepage section; the documentation link reports its page. Content remains readable without JavaScript.

## Verification

Check desktop, tablet, phone and landscape layouts, all five demo scenes, sticky navigation, keyboard focus, mobile menu, search/filter/fill and empty states, installation checkboxes, clipboard feedback, documentation deep links, text contrast, and reduced motion. Validate strict standalone TypeScript, regenerate `main.js`, and check formatting and whitespace. Record observed browser evidence in `.product-page/VERIFICATION.md` before committing.

## References

The UI/UX Pro Max search resolved to Minimalism & Swiss Style and a Hero + Features + CTA structure. Its general recommendations inform responsive spacing, visible focus, touch targets and restrained motion. The user's Apple direction takes priority over the dataset's generic SaaS palette. Apple's [MacBook Air product page](https://www.apple.com/macbook-air/) is the reference for product-first storytelling and navigation.
