import fs from 'fs';
import path from 'path';
import os from 'os';
import { VCS_DIR } from '../dawvcs/core/constants';

export interface InstalledPlugin {
  name: string;
  type: 'AU' | 'VST3' | 'VST2';
  path: string;
}

const CACHE_FILE = path.join(VCS_DIR, 'plugin-cache.json');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Returns the directories to scan for each platform.
 */
function getPluginDirectories(): { dir: string; type: 'AU' | 'VST3' | 'VST2' }[] {
  const platform = process.platform;

  if (platform === 'darwin') {
    return [
      { dir: '/Library/Audio/Plug-Ins/Components', type: 'AU' },
      { dir: path.join(os.homedir(), 'Library/Audio/Plug-Ins/Components'), type: 'AU' },
      { dir: '/Library/Audio/Plug-Ins/VST3', type: 'VST3' },
      { dir: path.join(os.homedir(), 'Library/Audio/Plug-Ins/VST3'), type: 'VST3' },
    ];
  }

  if (platform === 'win32') {
    const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
    const commonFiles = path.join(programFiles, 'Common Files');
    return [
      { dir: path.join(commonFiles, 'VST3'), type: 'VST3' },
      { dir: path.join(programFiles, 'VSTPlugins'), type: 'VST2' },
      // Some plugins install per-user
      { dir: path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Common', 'VST3'), type: 'VST3' },
    ];
  }

  // Linux fallback
  return [
    { dir: path.join(os.homedir(), '.vst3'), type: 'VST3' },
    { dir: '/usr/lib/vst3', type: 'VST3' },
    { dir: '/usr/local/lib/vst3', type: 'VST3' },
  ];
}

/**
 * Extract a clean plugin name from a filename.
 * e.g. "ValhallaSupermassive.vst3" -> "valhallaSupermassive" (lowercased for matching)
 */
function extractPluginName(filename: string): string {
  return filename
    .replace(/\.(component|vst3|vst|dll)$/i, '')
    .toLowerCase()
    .trim();
}

/**
 * Scans all known plugin directories and returns a list of installed plugins.
 */
function scanPluginDirectories(): InstalledPlugin[] {
  const dirs = getPluginDirectories();
  const plugins: InstalledPlugin[] = [];
  const seen = new Set<string>();

  for (const { dir, type } of dirs) {
    if (!fs.existsSync(dir)) continue;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        // Plugin bundles are directories on macOS (.component, .vst3)
        // On Windows they can be .dll files or .vst3 directories
        const isPlugin =
          entry.name.endsWith('.component') ||
          entry.name.endsWith('.vst3') ||
          entry.name.endsWith('.vst') ||
          entry.name.endsWith('.dll');

        if (!isPlugin) continue;

        const cleanName = extractPluginName(entry.name);
        const key = `${cleanName}:${type}`;

        if (!seen.has(key)) {
          seen.add(key);
          plugins.push({
            name: cleanName,
            type,
            path: path.join(dir, entry.name),
          });
        }
      }
    } catch (err: any) {
      console.warn(`[PluginScanner] Could not read directory ${dir}: ${err.message}`);
    }
  }

  console.log(`[PluginScanner] Found ${plugins.length} installed plugins across ${dirs.length} directories`);
  return plugins;
}

/**
 * Reads the cached plugin list if it exists and is fresh.
 */
function readCache(): InstalledPlugin[] | null {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
    const data = JSON.parse(raw);

    if (Date.now() - data.timestamp < CACHE_TTL_MS) {
      console.log(`[PluginScanner] Using cached plugin list (${data.plugins.length} plugins)`);
      return data.plugins;
    }

    console.log('[PluginScanner] Cache expired, will re-scan');
    return null;
  } catch {
    return null;
  }
}

/**
 * Writes the plugin list to cache.
 */
function writeCache(plugins: InstalledPlugin[]): void {
  try {
    const dir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ timestamp: Date.now(), plugins }, null, 2));
    console.log(`[PluginScanner] Cached ${plugins.length} plugins to ${CACHE_FILE}`);
  } catch (err: any) {
    console.warn(`[PluginScanner] Failed to write cache: ${err.message}`);
  }
}

/**
 * Get the list of installed plugins. Uses cache if available and fresh.
 */
export function getInstalledPlugins(): InstalledPlugin[] {
  const cached = readCache();
  if (cached) return cached;

  const plugins = scanPluginDirectories();
  writeCache(plugins);
  return plugins;
}

/**
 * Force a fresh scan (ignoring cache).
 */
export function rescanPlugins(): InstalledPlugin[] {
  const plugins = scanPluginDirectories();
  writeCache(plugins);
  return plugins;
}
