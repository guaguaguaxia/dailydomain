import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { extractDomainTextFromZip } from "../src/zip";

function buildZip(entries: Array<{ name: string; content: string; method: 0 | 8; dataDescriptor?: boolean }>): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Buffer[] = [];
  const cdParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = Buffer.from(encoder.encode(entry.name));
    const raw = Buffer.from(encoder.encode(entry.content));
    const compressed = entry.method === 8 ? deflateRawSync(raw) : raw;

    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0);
    lfh.writeUInt16LE(20, 4);
    lfh.writeUInt16LE(entry.dataDescriptor ? 0x0008 : 0, 6);
    lfh.writeUInt16LE(entry.method, 8);
    lfh.writeUInt32LE(0, 14); // crc32 omitted in test fixture
    lfh.writeUInt32LE(entry.dataDescriptor ? 0 : compressed.length, 18);
    lfh.writeUInt32LE(entry.dataDescriptor ? 0 : raw.length, 22);
    lfh.writeUInt16LE(nameBytes.length, 26);
    lfh.writeUInt16LE(0, 28);

    const dd = entry.dataDescriptor ? Buffer.alloc(16) : Buffer.alloc(0);
    if (entry.dataDescriptor) {
      dd.writeUInt32LE(0x08074b50, 0);
      dd.writeUInt32LE(0, 4);
      dd.writeUInt32LE(compressed.length, 8);
      dd.writeUInt32LE(raw.length, 12);
    }

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(entry.dataDescriptor ? 0x0008 : 0, 8);
    cd.writeUInt16LE(entry.method, 10);
    cd.writeUInt32LE(0, 16);
    cd.writeUInt32LE(compressed.length, 20);
    cd.writeUInt32LE(raw.length, 24);
    cd.writeUInt16LE(nameBytes.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt32LE(offset, 42);

    localParts.push(lfh, nameBytes, compressed, dd);
    cdParts.push(cd, nameBytes);
    offset += lfh.length + nameBytes.length + compressed.length + dd.length;
  }

  const cdBuf = Buffer.concat(cdParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return new Uint8Array(Buffer.concat([...localParts, cdBuf, eocd]));
}

describe("extractDomainTextFromZip", () => {
  it("extracts stored (method 0) txt entries", () => {
    const zip = buildZip([{ name: "dailyupdate.txt", content: "alpha.com\nbeta.ai\n", method: 0 }]);
    const res = extractDomainTextFromZip(zip);
    expect(res.fileName).toBe("dailyupdate.txt");
    expect(new TextDecoder().decode(res.rawBytes)).toBe("alpha.com\nbeta.ai\n");
  });

  it("extracts deflated (method 8) csv entries with data descriptors", () => {
    const content = "example.com\nopenai.ai\nzebra.org\n".repeat(20);
    const zip = buildZip([
      { name: "readme.md", content: "ignored", method: 0 },
      { name: "domains.csv", content, method: 8, dataDescriptor: true },
    ]);
    const res = extractDomainTextFromZip(zip);
    expect(res.fileName).toBe("domains.csv");
    expect(new TextDecoder().decode(res.rawBytes)).toBe(content);
  });

  it("throws on invalid or truncated ZIP buffers", () => {
    expect(() => extractDomainTextFromZip(new Uint8Array([1, 2, 3]))).toThrow(/too small/i);
    expect(() => extractDomainTextFromZip(new Uint8Array(40))).toThrow(/EOCD/i);
  });
});
