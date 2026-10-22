// Genera los íconos de la PWA (PNG) sin dependencias: un corazón claro sobre el color primario.
// Uso: pnpm --filter web icons
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateSync } from "node:zlib";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");
const BG = [0x2f, 0x5d, 0x56]; // --primary
const FG = [0xfd, 0xfc, 0xf8]; // --surface

/** Cobertura (0–1) del corazón en el punto (x, y) normalizado a [-1.3, 1.3]. */
function heart(x, y) {
  const a = x * x + y * y - 1;
  return a * a * a - x * x * y * y * y <= 0 ? 1 : 0;
}

function render(size, scale) {
  const rows = [];
  const SS = 3;
  for (let py = 0; py < size; py++) {
    const row = Buffer.alloc(1 + size * 3);
    for (let px = 0; px < size; px++) {
      let cov = 0;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const u = ((px + (sx + 0.5) / SS) / size - 0.5) * 2; // [-1, 1]
          const v = ((py + (sy + 0.5) / SS) / size - 0.5) * 2;
          // el corazón se dibuja con la punta hacia abajo y centrado en vertical
          cov += heart(u / scale, -v / scale + 0.08);
        }
      cov /= SS * SS;
      for (let c = 0; c < 3; c++) {
        row[1 + px * 3 + c] = Math.round(BG[c] * (1 - cov) + FG[c] * cov);
      }
    }
    rows.push(row);
  }
  return Buffer.concat(rows);
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, scale) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bits
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(render(size, scale), { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
const files = [
  ["icon-192.png", 192, 0.62],
  ["icon-512.png", 512, 0.62],
  // maskable: el corazón queda dentro de la zona segura (círculo del 80%)
  ["icon-maskable-512.png", 512, 0.46],
  ["apple-touch-icon.png", 180, 0.58],
];
for (const [name, size, scale] of files) {
  writeFileSync(join(OUT, name), png(size, scale));
  console.log("escrito", name);
}

// Android: íconos de launcher para API 24–25 (el resto usa el ícono adaptativo vectorial de res/mipmap-anydpi-v26).
const RES = join(OUT, "..", "..", "android", "app", "src", "main", "res");
for (const [dir, size] of [
  ["mdpi", 48],
  ["hdpi", 72],
  ["xhdpi", 96],
  ["xxhdpi", 144],
  ["xxxhdpi", 192],
]) {
  for (const name of ["ic_launcher.png", "ic_launcher_round.png"]) {
    mkdirSync(join(RES, `mipmap-${dir}`), { recursive: true });
    writeFileSync(join(RES, `mipmap-${dir}`, name), png(size, 0.62));
  }
}
console.log("escritos los íconos de launcher de Android");
