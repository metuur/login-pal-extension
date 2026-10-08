import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// Keep the supplied vector as the single source of truth. No external assets.
const publicDir = new URL('../public/', import.meta.url);
const source = await readFile(new URL('login-pal-vector.svg', publicDir), 'utf8');
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const variants = await page.evaluate((svg) => {
    const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const root = document.documentElement;
    const tile = document.getElementById('teal-tile');
    if (root.localName !== 'svg' || !tile) throw new Error('Expected Login Pal SVG and teal-tile');
    const x = Number(tile.getAttribute('x'));
    const y = Number(tile.getAttribute('y'));
    const width = Number(tile.getAttribute('width'));
    const height = Number(tile.getAttribute('height'));
    const side = Math.max(width, height) + 48;
    root.setAttribute(
      'viewBox',
      `${x + width / 2 - side / 2} ${y + height / 2 - side / 2} ${side} ${side}`,
    );
    root.setAttribute('width', '512');
    root.setAttribute('height', '512');
    return { icon: new XMLSerializer().serializeToString(root) };
  }, source);
  await writeFile(new URL('logo.svg', publicDir), source);
  await writeFile(new URL('favicon.svg', publicDir), variants.icon + '\n');

  async function render(name, size, svg, background = null) {
    const data = await page.evaluate(
      async ({ size, svg, background }) => {
        const image = new Image();
        image.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const context = canvas.getContext('2d');
        if (background) {
          context.fillStyle = background;
          context.fillRect(0, 0, size, size);
        }
        context.drawImage(image, 0, 0, size, size);
        return canvas.toDataURL('image/png').split(',')[1];
      },
      { size, svg, background },
    );
    const png = Buffer.from(data, 'base64');
    if (png.readUInt32BE(16) !== size || png.readUInt32BE(20) !== size) {
      throw new Error(`Invalid PNG dimensions: ${name}`);
    }
    await writeFile(new URL(name, publicDir), png);
    return png;
  }

  const faviconImages = [];
  for (const size of [16, 32, 48, 64, 128, 256, 512]) {
    const png = await render(`icon-${size}.png`, size, variants.icon);
    if ([16, 32, 48].includes(size)) faviconImages.push({ size, png });
  }
  for (const size of [16, 32, 48]) {
    await render(`favicon-${size}x${size}.png`, size, variants.icon);
  }
  for (const size of [256, 512, 1024]) {
    await render(`logo-${size}.png`, size, source);
  }
  await render('apple-touch-icon.png', 180, source, '#ffffff');
  for (const size of [192, 512]) {
    await render(`android-chrome-${size}x${size}.png`, size, variants.icon);
  }

  // ICO directory followed by embedded PNGs, one entry per browser size.
  const header = Buffer.alloc(6 + faviconImages.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(faviconImages.length, 4);
  let offset = header.length;
  faviconImages.forEach(({ size, png }, index) => {
    const entry = 6 + index * 16;
    header[entry] = header[entry + 1] = size;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  await writeFile(
    new URL('favicon.ico', publicDir),
    Buffer.concat([header, ...faviconImages.map(({ png }) => png)]),
  );
  console.log('Generated 19 brand assets from login-pal-vector.svg. PNG dimensions verified.');
} finally {
  await browser.close();
}
