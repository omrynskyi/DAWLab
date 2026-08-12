import fs from 'fs';
import path from 'path';
import os from 'os';
import plist from 'plist';
import { PluginInfo, ExtractedMetadata, MetadataParser } from './parser';

// ─── Constants ───────────────────────────────────────────────────────────────

const APPLE_MFR = 0x6170706c; // 'appl'

/** AU type integer → human-readable name */
const AU_TYPE_MAP: Record<number, PluginInfo['type']> = {
  0x61756d75: 'Instrument',     // aumu
  0x61756678: 'Effect',         // aufx
  0x61756d66: 'Music Effect',   // aumf
  0x6175676e: 'Generator',      // augn
  0x61756d69: 'MIDI Processor', // aumi
};

/** Reversed AU type signatures to search for in the binary (Method 2) */
const AU_TYPES_REVERSED: Buffer[] = [
  Buffer.from('xfua'), // aufx reversed
  Buffer.from('umua'), // aumu reversed
  Buffer.from('fmua'), // aumf reversed
  Buffer.from('ngua'), // augn reversed
  Buffer.from('imua'), // aumi reversed
];

/** Directories containing AudioUnit components */
const AU_DIRS = [
  '/Library/Audio/Plug-Ins/Components',
  path.join(os.homedir(), 'Library/Audio/Plug-Ins/Components'),
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Convert a 32-bit integer to a 4-character ASCII FourCC code */
function intToFourCC(val: number): string {
  return String.fromCharCode(
    (val >> 24) & 0xff,
    (val >> 16) & 0xff,
    (val >> 8) & 0xff,
    val & 0xff,
  );
}

/** Reverse a string character-by-character */
function reverseString(s: string): string {
  return s.split('').reverse().join('');
}

/** Check if all bytes in a buffer are printable ASCII (0x20–0x7e) */
function isPrintableAscii(buf: Buffer): boolean {
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] < 0x20 || buf[i] > 0x7e) return false;
  }
  return true;
}

/** 
 * Extract the last readable string from a chunk of bytes.
 * Splits on non-printable bytes, returns the last segment ≥ 2 chars
 * that isn't purely numeric/punctuation.
 */
function extractLastReadableString(chunk: Buffer): string | null {
  const text = chunk.toString('latin1');
  const segments = text.split(/[^\x20-\x7e]+/);

  for (let i = segments.length - 1; i >= 0; i--) {
    const s = segments[i].trim();
    if (s.length >= 2 && !/^[.\-_0-9]+$/.test(s)) {
      return s;
    }
  }
  return null;
}

/** Get human-readable type name from AU type integer */
function getTypeName(typeInt: number): string {
  return AU_TYPE_MAP[typeInt] ?? 'Unknown';
}

// ─── AU Component Info (Method 3) ────────────────────────────────────────────

interface AUComponentInfo {
  name: string;
  manufacturerName: string;
  bundleName: string;
  path: string;
}

// ─── Logic Pro Parser ────────────────────────────────────────────────────────

export class LogicProParser implements MetadataParser {
  constructor() {
    console.log('[LogicProParser] Initialized (binary extraction engine)');
  }

  /**
   * Parse a Logic Pro .logicx bundle and extract metadata.
   * @param filePath - Path to the .logicx bundle directory
   */
  async parse(filePath: string): Promise<ExtractedMetadata> {
    console.log(`[LogicProParser] Parsing: ${filePath}`);

    // Find the ProjectData binary inside the bundle
    const projectDataPath = this.findProjectData(filePath);
    if (!projectDataPath) {
      throw new Error(`No ProjectData file found in bundle: ${filePath}`);
    }

    console.log(`[LogicProParser] Found ProjectData: ${projectDataPath}`);
    const data = fs.readFileSync(projectDataPath);
    const text = data.toString('latin1'); // latin1 preserves byte values

    console.log(`[LogicProParser] Binary size: ${(data.length / 1024).toFixed(1)} KB`);

    // Step 1: Scan installed AU components for full names (Method 3)
    const auIndex = this.scanAUComponents();
    console.log(`[LogicProParser] AU component index: ${auIndex.size} entries`);

    // Step 2: Build fallback name index from binary AU code patterns (Method 2)
    const binaryIndex = this.buildNameIndex(data);
    console.log(`[LogicProParser] Binary name index: ${binaryIndex.size} entries`);

    // Step 3: Extract unique plugins from plist XML fragments (Method 1)
    const plugins = this.extractFromPlistFragments(text, auIndex, binaryIndex);
    console.log(`[LogicProParser] Found ${plugins.length} unique third-party plugins`);

    return {
      daw_version: 'Logic Pro X',
      tempo: 0,           // Not extractable from binary ProjectData
      time_signature: '',  // Not extractable from binary ProjectData
      total_tracks: 0,     // Not extractable from binary ProjectData
      plugins,
      track_summary: {
        audio: [],
        midi: [],
        return: [],
      },
    };
  }

  /**
   * Find the ProjectData file inside a .logicx bundle.
   * Checks root level first, then inside Alternatives/ subfolders.
   */
  private findProjectData(bundlePath: string): string | null {
    // Direct path
    const directPath = path.join(bundlePath, 'ProjectData');
    if (fs.existsSync(directPath)) {
      return directPath;
    }

    // Check Alternatives directory (Logic Pro uses this for project variants)
    const altDir = path.join(bundlePath, 'Alternatives');
    if (fs.existsSync(altDir) && fs.statSync(altDir).isDirectory()) {
      try {
        const altEntries = fs.readdirSync(altDir);
        for (const entry of altEntries) {
          const altDataPath = path.join(altDir, entry, 'ProjectData');
          if (fs.existsSync(altDataPath)) {
            return altDataPath;
          }
        }
      } catch (err: any) {
        console.warn(`[LogicProParser] Could not read Alternatives: ${err.message}`);
      }
    }

    return null;
  }

  // ─── Method 1: Embedded Plist XML Fragments ──────────────────────────────

  /**
   * Extract plugins by regex-matching embedded plist XML fragments
   * in the latin1-decoded binary.
   */
  private extractFromPlistFragments(
    text: string,
    auIndex: Map<string, AUComponentInfo>,
    binaryIndex: Map<string, string>,
  ): PluginInfo[] {
    const seen = new Set<string>();
    const plugins: PluginInfo[] = [];

    const pattern =
      /<key>manufacturer<\/key>\s*<integer>(\d+)<\/integer>\s*<key>name<\/key>\s*<string>([^<]*)<\/string>\s*<key>subtype<\/key>\s*<integer>(\d+)<\/integer>\s*<key>type<\/key>\s*<integer>(\d+)<\/integer>/g;

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const mfr = parseInt(match[1]);
      if (mfr === APPLE_MFR) continue; // skip Apple built-ins

      const sub = parseInt(match[3]);
      const typ = parseInt(match[4]);
      const key = `${mfr}|${sub}|${typ}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const mfrCode = intToFourCC(mfr);
      const subCode = intToFourCC(sub);
      const auKey = `${mfrCode}|${subCode}`;

      // Name resolution priority: AU component → binary pattern → subtype code
      const auInfo = auIndex.get(auKey);
      const displayName = auInfo?.name ?? binaryIndex.get(auKey) ?? subCode;
      const manufacturer = auInfo?.manufacturerName ?? mfrCode;
      const typeName = getTypeName(typ);

      plugins.push({
        name: displayName,
        manufacturer,
        type: intToFourCC(typ),
        is_instrument: typeName === 'Instrument',
      });

      console.log(
        `[LogicProParser] Identified: ${displayName} (${manufacturer}) [${typeName}]`,
      );
    }

    return plugins;
  }

  // ─── Method 2: Binary AU Code Pattern (Display Names) ────────────────────

  /**
   * Scan raw binary for reversed AU type signatures and extract
   * display names from the preceding bytes.
   */
  private buildNameIndex(data: Buffer): Map<string, string> {
    const index = new Map<string, string>(); // "mfr|subtype" → displayName

    for (const pat of AU_TYPES_REVERSED) {
      let offset = 0;
      while ((offset = data.indexOf(pat, offset)) !== -1) {
        const mfrStart = offset - 4;
        const subStart = offset + 4;

        if (mfrStart < 0 || subStart + 4 > data.length) {
          offset++;
          continue;
        }

        // Read and verify the 4-byte codes
        const mfrBytes = data.subarray(mfrStart, offset);
        const subBytes = data.subarray(subStart, subStart + 4);

        if (!isPrintableAscii(mfrBytes) || !isPrintableAscii(subBytes)) {
          offset++;
          continue;
        }

        const mfrCode = reverseString(mfrBytes.toString('ascii'));
        const subCode = reverseString(subBytes.toString('ascii'));

        // Skip Apple built-ins
        if (mfrCode === 'appl') {
          offset++;
          continue;
        }

        const key = `${mfrCode}|${subCode}`;
        if (!index.has(key)) {
          // Extract display name: scan backwards for null-terminated string
          const windowStart = Math.max(0, mfrStart - 80);
          const chunk = data.subarray(windowStart, mfrStart);
          const name = extractLastReadableString(chunk);
          if (name) {
            index.set(key, name);
          }
        }
        offset++;
      }
    }

    return index;
  }

  // ─── Method 3: AU Component Directory Lookup ─────────────────────────────

  /**
   * Scan local AudioUnit component directories to build
   * a lookup map of full plugin names by mfr|subtype key.
   */
  private scanAUComponents(): Map<string, AUComponentInfo> {
    const index = new Map<string, AUComponentInfo>();

    for (const auDir of AU_DIRS) {
      if (!fs.existsSync(auDir)) continue;

      let entries: string[];
      try {
        entries = fs.readdirSync(auDir);
      } catch (err: any) {
        console.warn(`[LogicProParser] Could not read AU dir ${auDir}: ${err.message}`);
        continue;
      }

      for (const entry of entries) {
        if (!entry.endsWith('.component')) continue;

        const plistPath = path.join(auDir, entry, 'Contents', 'Info.plist');
        if (!fs.existsSync(plistPath)) continue;

        try {
          const plistData = fs.readFileSync(plistPath, 'utf8');
          const info = plist.parse(plistData) as Record<string, any>;
          const components: any[] = info.AudioComponents || [];
          const bundleName =
            info.CFBundleDisplayName ||
            info.CFBundleName ||
            entry.replace('.component', '');

          for (const comp of components) {
            const mfr: string | undefined = comp.manufacturer;
            const sub: string | undefined = comp.subtype;
            const auName: string = comp.name || '';

            if (!mfr || !sub) continue;

            // AU "name" is often "Manufacturer: PluginName"
            let pluginName = auName;
            let mfrName: string = mfr;
            if (auName.includes(': ')) {
              const [m, p] = auName.split(': ', 2);
              pluginName = p;
              mfrName = m;
            }

            const key = `${mfr}|${sub}`;
            if (!index.has(key)) {
              index.set(key, {
                name: pluginName,
                manufacturerName: mfrName,
                bundleName,
                path: path.join(auDir, entry),
              });
            }
          }
        } catch {
          /* skip invalid plists */
        }
      }
    }

    console.log(`[LogicProParser] Scanned AU components: ${index.size} found`);
    return index;
  }
}
