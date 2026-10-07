# Login Pal hero motion — proposed design

Source: ../styles.css and ../tokens.css. Preserve the current page identity.

- Paper: #f6f7f9; panel: #ffffff; ink: #242734; supporting ink: #50586b; accent: #4055d9; rule: #dfe3ee.
- Local Geist Regular and Semibold from the parent directory. Display 64px / 600, body 32px / 400, labels 24px / 600 on the proposed 960×720 canvas.
- One persistent rounded panel, 24px corner radius. No browser bars, invented product screenshots, glows, orbiting decorations, or fake cursor clicks.
- Focal object: synthetic account row. It appears during import, becomes the selected account, and travels to a symbolic fill destination.
- Edge anchors: step title at top left, step position at top right; explanatory caption and progress at bottom.
- Choreography: opacity and transform only. Short leftward handoffs, 0.4s power2.inOut; row arrival 0.45s power3.out. Hold each explanatory state for reading. Final state holds without a submit animation.
- Controls live in accessible page HTML outside the composition. Do not bake tiny controls into a scaled video.
