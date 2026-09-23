import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const asset = fileURLToPath(new URL('../../src/assets/warranty-registration-qr.png', import.meta.url));
const warrantyUrl = 'https://navrik.com.au/register-warranty';

function readPngMatrix(path) {
  const png = readFileSync(path);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);

  let offset = 8;
  let width;
  let height;
  const chunks = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString('ascii');
    const data = png.subarray(offset + 8, offset + 8 + length);
    offset += length + 12;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      assert.equal(data[8], 8, 'QR PNG must use 8-bit pixels');
      assert.equal(data[9], 0, 'QR PNG must use grayscale pixels');
    }
    if (type === 'IDAT') chunks.push(data);
    if (type === 'IEND') break;
  }

  assert.equal(width, height, 'QR image must be square');
  const rows = inflateSync(Buffer.concat(chunks));
  assert.equal(rows.length, height * (width + 1));
  for (let y = 0; y < height; y += 1) assert.equal(rows[y * (width + 1)], 0, 'QR image must not use PNG row filters');

  const scale = 16;
  const quietZone = 4;
  const moduleCount = width / scale - quietZone * 2;
  assert.equal(Number.isInteger(moduleCount), true);
  const pixelAt = (x, y) => rows[y * (width + 1) + 1 + x] < 128;
  return Array.from({ length: moduleCount }, (_, row) => Array.from(
    { length: moduleCount },
    (_, column) => pixelAt((column + quietZone) * scale + 8, (row + quietZone) * scale + 8),
  ));
}

function assertFinder(matrix, top, left) {
  for (let row = 0; row < 7; row += 1) {
    for (let column = 0; column < 7; column += 1) {
      const expected = row === 0 || row === 6 || column === 0 || column === 6 || (row >= 2 && row <= 4 && column >= 2 && column <= 4);
      assert.equal(matrix[top + row][left + column], expected, `finder mismatch at ${top + row},${left + column}`);
    }
  }
}

function reserveFunctionModules(size) {
  const reserved = Array.from({ length: size }, () => Array(size).fill(false));
  const reserve = (row, column) => { if (row >= 0 && row < size && column >= 0 && column < size) reserved[row][column] = true; };
  const reserveRect = (top, left, height, width) => {
    for (let row = top; row < top + height; row += 1) for (let column = left; column < left + width; column += 1) reserve(row, column);
  };

  reserveRect(0, 0, 8, 8);
  reserveRect(0, size - 8, 8, 8);
  reserveRect(size - 8, 0, 8, 8);
  for (let index = 8; index < size - 8; index += 1) {
    reserve(index, 6);
    reserve(6, index);
  }
  for (let row = 28; row <= 32; row += 1) for (let column = 28; column <= 32; column += 1) reserve(row, column);
  for (let index = 0; index < 15; index += 1) {
    reserve(index < 6 ? index : index < 8 ? index + 1 : size - 15 + index, 8);
    reserve(8, index < 8 ? size - index - 1 : index < 9 ? 8 : 14 - index);
  }
  reserve(size - 8, 8);
  return reserved;
}

function maskApplies(mask, row, column) {
  switch (mask) {
    case 0: return (row + column) % 2 === 0;
    case 1: return row % 2 === 0;
    case 2: return column % 3 === 0;
    case 3: return (row + column) % 3 === 0;
    case 4: return (Math.floor(row / 2) + Math.floor(column / 3)) % 2 === 0;
    case 5: return (row * column) % 2 + (row * column) % 3 === 0;
    case 6: return ((row * column) % 2 + (row * column) % 3) % 2 === 0;
    case 7: return ((row * column) % 3 + (row + column) % 2) % 2 === 0;
    default: throw new Error('Unknown QR mask');
  }
}

function dataBytes(matrix, reserved, mask) {
  const bits = [];
  let increment = -1;
  let row = matrix.length - 1;
  for (let column = matrix.length - 1; column > 0; column -= 2) {
    if (column === 6) column -= 1;
    while (true) {
      for (let offset = 0; offset < 2; offset += 1) {
        const currentColumn = column - offset;
        if (!reserved[row][currentColumn]) bits.push(Number(matrix[row][currentColumn]) ^ Number(maskApplies(mask, row, currentColumn)));
      }
      row += increment;
      if (row < 0 || row >= matrix.length) {
        row -= increment;
        increment = -increment;
        break;
      }
    }
  }
  return Buffer.from(Array.from({ length: 134 }, (_, byteIndex) => bits.slice(byteIndex * 8, byteIndex * 8 + 8).reduce((value, bit) => (value << 1) | bit, 0)));
}

function decodeVersion5High(bytes) {
  const blockLengths = [11, 11, 12, 12];
  const blocks = blockLengths.map(() => []);
  let cursor = 0;
  for (let byteIndex = 0; byteIndex < 12; byteIndex += 1) {
    for (let blockIndex = 0; blockIndex < blockLengths.length; blockIndex += 1) {
      if (byteIndex < blockLengths[blockIndex]) blocks[blockIndex].push(bytes[cursor++]);
    }
  }
  const data = Buffer.concat(blocks.map((block) => Buffer.from(block)));
  const bit = (index) => (data[Math.floor(index / 8)] >> (7 - index % 8)) & 1;
  const read = (start, length) => Array.from({ length }, (_, index) => bit(start + index)).reduce((value, current) => (value << 1) | current, 0);
  if (read(0, 4) !== 4) return null;
  const length = read(4, 8);
  return Buffer.from(Array.from({ length }, (_, index) => read(12 + index * 8, 8))).toString('utf8');
}

test('warranty registration QR asset decodes to the canonical AU URL', () => {
  const matrix = readPngMatrix(asset);
  assert.equal(matrix.length, 37, 'canonical warranty QR uses version 5');
  assertFinder(matrix, 0, 0);
  assertFinder(matrix, 0, 30);
  assertFinder(matrix, 30, 0);

  const reserved = reserveFunctionModules(matrix.length);
  const payloads = Array.from({ length: 8 }, (_, mask) => decodeVersion5High(dataBytes(matrix, reserved, mask))).filter((payload) => payload === warrantyUrl);

  assert.deepEqual(payloads, [warrantyUrl]);
});
