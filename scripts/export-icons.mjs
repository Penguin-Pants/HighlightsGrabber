// Exports the PNG icons from the SVG masters in assets/brand.
// Run: npm install && npm run icons
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../assets/brand/', import.meta.url));

const jobs = [
  { src: 'icon.svg', out: 'icon', sizes: [16, 32, 48, 96, 128] }
];

for (const { src, out, sizes } of jobs) {
  const svg = readFileSync(dir + src);
  for (const size of sizes) {
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
    writeFileSync(`${dir}${out}-${size}.png`, png);
    console.log(`${out}-${size}.png`);
  }
}
