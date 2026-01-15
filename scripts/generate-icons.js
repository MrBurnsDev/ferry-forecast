/**
 * Generate PWA icons from SVG source
 * Run: node scripts/generate-icons.js
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ICONS_DIR = path.join(__dirname, '../public/icons');
const SVG_SOURCE = path.join(ICONS_DIR, 'icon.svg');

const SIZES = [72, 96, 128, 144, 152, 192, 384, 512];

async function generateIcons() {
  const svgBuffer = fs.readFileSync(SVG_SOURCE);

  // Generate regular icons
  for (const size of SIZES) {
    const outputPath = path.join(ICONS_DIR, `icon-${size}x${size}.png`);
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(outputPath);
    console.log(`Generated: icon-${size}x${size}.png`);
  }

  // Generate maskable icons (with padding for safe zone)
  for (const size of [192, 512]) {
    const outputPath = path.join(ICONS_DIR, `icon-maskable-${size}x${size}.png`);
    // Maskable icons need ~10% padding for the safe zone
    const innerSize = Math.floor(size * 0.8);
    const padding = Math.floor((size - innerSize) / 2);

    await sharp(svgBuffer)
      .resize(innerSize, innerSize)
      .extend({
        top: padding,
        bottom: padding,
        left: padding,
        right: padding,
        background: { r: 26, g: 54, b: 93, alpha: 1 } // #1a365d
      })
      .png()
      .toFile(outputPath);
    console.log(`Generated: icon-maskable-${size}x${size}.png`);
  }

  // Generate Apple touch icon (180x180)
  const appleTouchPath = path.join(ICONS_DIR, 'apple-touch-icon.png');
  await sharp(svgBuffer)
    .resize(180, 180)
    .png()
    .toFile(appleTouchPath);
  console.log('Generated: apple-touch-icon.png');

  // Generate favicon (32x32)
  const faviconPath = path.join(__dirname, '../public/favicon.ico');
  await sharp(svgBuffer)
    .resize(32, 32)
    .png()
    .toFile(path.join(ICONS_DIR, 'favicon-32x32.png'));
  console.log('Generated: favicon-32x32.png');

  // Generate favicon-16x16
  await sharp(svgBuffer)
    .resize(16, 16)
    .png()
    .toFile(path.join(ICONS_DIR, 'favicon-16x16.png'));
  console.log('Generated: favicon-16x16.png');

  console.log('\nAll icons generated successfully!');
}

generateIcons().catch(console.error);
