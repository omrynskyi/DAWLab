#!/usr/bin/env node
/**
 * seed-mock-data.cjs — populate DAWLab's local store with a throwaway "demo"
 * user full of mock projects, commit history, and branches, so the Library and
 * History screens can be screenshotted without hand-creating projects.
 *
 * It creates a SEPARATE user (default: "demo") and switches the app to it, so
 * your real user's data is never touched. `clean` deletes the demo user and
 * switches you back.
 *
 * Usage:
 *   node scripts/seed-mock-data.cjs seed     # create demo user + mock data, switch to it (default)
 *   node scripts/seed-mock-data.cjs clean    # delete demo user, switch back to your real user
 *   node scripts/seed-mock-data.cjs reset    # clean, then seed fresh
 *   node scripts/seed-mock-data.cjs seed myname   # optional custom demo username
 *
 * Writes into the files the Electron app reads:
 *   ~/.dawlab/current-user.json                  -> { username }   (active user)
 *   ~/.dawlab/users/<demo>/registry.json         -> { projects }
 *   ~/.dawlab/users/<demo>/logs/<id>-<name>.json -> project log (branches + commits)
 *   ~/.dawlab/.mock-demo.json                    -> marker { demoUser, previousUser }
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const HOME = os.homedir();
const VCS_DIR = path.join(HOME, '.dawlab');
const CURRENT_USER_FILE = path.join(VCS_DIR, 'current-user.json');
const MARKER_FILE = path.join(VCS_DIR, '.mock-demo.json');
const DEMO_DIR = path.join(HOME, 'DAWLab Demo Projects');
const PLUGIN_CACHE_FILE = path.join(VCS_DIR, 'plugin-cache.json');
const PLUGIN_CACHE_BACKUP = path.join(VCS_DIR, 'plugin-cache.prebak.json');

const readJson = (f, fallback) => {
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fallback; }
};
const writeJson = (f, obj) => {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(obj, null, 2));
};
const shortId = () => crypto.randomBytes(6).toString('hex');
const uuid = () => crypto.randomUUID();

function sanitizeUsername(value) {
  return String(value || '')
    .toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '').slice(0, 30);
}
function currentUser() {
  const d = readJson(CURRENT_USER_FILE, null);
  return d && d.username ? d.username : null;
}
function setActiveUser(username) {
  fs.mkdirSync(VCS_DIR, { recursive: true });
  writeJson(CURRENT_USER_FILE, { username });
}

/** Date -> "YYYYMMDDHHmmss" (timestamp format CommitGraph sorts on). */
function stamp(date) {
  const p = (n) => String(n).padStart(2, '0');
  return date.getFullYear().toString() + p(date.getMonth() + 1) + p(date.getDate()) +
    p(date.getHours()) + p(date.getMinutes()) + p(date.getSeconds());
}
function buildCommits(messages, startDaysAgo, author) {
  const now = Date.now();
  const n = messages.length;
  return messages.map((message, i) => {
    const daysAgo = startDaysAgo - (i * (startDaysAgo / Math.max(n, 1))) + 0.3;
    const d = new Date(now - daysAgo * 24 * 60 * 60 * 1000);
    return { commit_id: shortId(), timestamp: stamp(d), message, author, preview_file: 'preview.wav' };
  });
}

const EXT = { 'Ableton Live': 'als', 'FL Studio': 'flp', 'Logic Pro': 'logicx', 'Pro Tools': 'ptx', 'Reaper': 'rpp' };
const hash = () => crypto.randomBytes(20).toString('hex');

/** A realistic in-project file tree per DAW (paths use '/', like the app expects). */
function buildFileTree(daw, name) {
  const ext = EXT[daw] || 'als';
  const main = `${name}.${ext}`;
  const trees = {
    'Ableton Live': [
      main,
      'Ableton Project Info/AbletonProjectInfo.cfg',
      'Samples/Recorded/vocal_take_01.wav',
      'Samples/Recorded/guitar_di.wav',
      'Samples/Processed/vocal_reverb.wav',
      'Samples/Imported/vinyl_crackle.wav',
      'Icon.png',
    ],
    'FL Studio': [
      main,
      'Audio/Recorded/vox_take.wav',
      'Audio/Rendered/master_bounce.wav',
      'Presets/bass_patch.fst',
      'project_notes.txt',
    ],
    'Logic Pro': [
      main,
      'Audio Files/vocal_comp.wav',
      'Audio Files/drum_room.wav',
      'Bounces/rough_mix.wav',
      'Freeze Files/synth_freeze.aiff',
    ],
    'Pro Tools': [
      main,
      'Audio Files/kick.wav',
      'Audio Files/snare.wav',
      'Bounced Files/stem_drums.wav',
      'Session File Backups/backup.ptx',
    ],
    'Reaper': [
      `${name}-media/rec_01.wav`,
      `${name}-media/rec_02.wav`,
      'render/mixdown.wav',
      'notes.md',
      main,
    ],
  };
  return (trees[daw] || trees['Ableton Live']).map((p) => ({ path: p, hash: hash() }));
}

/** A believable plugin list per DAW (instruments + effects). */
function buildPlugins(daw) {
  const pools = {
    'Ableton Live': [
      { name: 'Wavetable', manufacturer: 'Ableton', type: 'Instrument', is_instrument: true },
      { name: 'Operator', manufacturer: 'Ableton', type: 'Instrument', is_instrument: true },
      { name: 'Serum', manufacturer: 'Xfer Records', type: 'Instrument', is_instrument: true },
      { name: 'Pro-Q 3', manufacturer: 'FabFilter', type: 'EQ', is_instrument: false },
      { name: 'VintageVerb', manufacturer: 'Valhalla DSP', type: 'Reverb', is_instrument: false },
      { name: 'OTT', manufacturer: 'Xfer Records', type: 'Dynamics', is_instrument: false },
      { name: 'Glue Compressor', manufacturer: 'Ableton', type: 'Compressor', is_instrument: false },
    ],
    'FL Studio': [
      { name: 'Sytrus', manufacturer: 'Image-Line', type: 'Instrument', is_instrument: true },
      { name: 'Vital', manufacturer: 'Matt Tytel', type: 'Instrument', is_instrument: true },
      { name: 'Serum', manufacturer: 'Xfer Records', type: 'Instrument', is_instrument: true },
      { name: 'Parametric EQ 2', manufacturer: 'Image-Line', type: 'EQ', is_instrument: false },
      { name: 'Gross Beat', manufacturer: 'Image-Line', type: 'Effect', is_instrument: false },
      { name: 'Fruity Limiter', manufacturer: 'Image-Line', type: 'Dynamics', is_instrument: false },
    ],
    'Logic Pro': [
      { name: 'Alchemy', manufacturer: 'Apple', type: 'Instrument', is_instrument: true },
      { name: 'Sculpture', manufacturer: 'Apple', type: 'Instrument', is_instrument: true },
      { name: 'Channel EQ', manufacturer: 'Apple', type: 'EQ', is_instrument: false },
      { name: 'Space Designer', manufacturer: 'Apple', type: 'Reverb', is_instrument: false },
      { name: 'Compressor', manufacturer: 'Apple', type: 'Compressor', is_instrument: false },
      { name: 'Pro-Q 3', manufacturer: 'FabFilter', type: 'EQ', is_instrument: false },
    ],
    'Pro Tools': [
      { name: 'Xpand!2', manufacturer: 'AIR Music', type: 'Instrument', is_instrument: true },
      { name: 'Structure', manufacturer: 'AIR Music', type: 'Instrument', is_instrument: true },
      { name: 'EQ III', manufacturer: 'Avid', type: 'EQ', is_instrument: false },
      { name: 'Dyn3 Compressor', manufacturer: 'Avid', type: 'Compressor', is_instrument: false },
      { name: 'D-Verb', manufacturer: 'Avid', type: 'Reverb', is_instrument: false },
    ],
    'Reaper': [
      { name: 'ReaSynth', manufacturer: 'Cockos', type: 'Instrument', is_instrument: true },
      { name: 'Vital', manufacturer: 'Matt Tytel', type: 'Instrument', is_instrument: true },
      { name: 'ReaEQ', manufacturer: 'Cockos', type: 'EQ', is_instrument: false },
      { name: 'ReaComp', manufacturer: 'Cockos', type: 'Compressor', is_instrument: false },
      { name: 'ReaVerbate', manufacturer: 'Cockos', type: 'Reverb', is_instrument: false },
    ],
  };
  return pools[daw] || pools['Ableton Live'];
}

/** ExtractedMetadata for the plugin panel + project info. */
function buildMetadata(daw, m, fileMap) {
  const dawVersions = {
    'Ableton Live': 'Ableton Live 12.1', 'FL Studio': 'FL Studio 21.2', 'Logic Pro': 'Logic Pro 11.1',
    'Pro Tools': 'Pro Tools 2024.10', 'Reaper': 'REAPER 7.20',
  };
  const audio = fileMap.map((f) => f.path.split('/').pop()).filter((n) => /\.(wav|aiff|aif|mp3)$/i.test(n));
  return {
    daw_version: dawVersions[daw] || '',
    tempo: m.bpm,
    time_signature: '4/4',
    total_tracks: 8 + (m.name.length % 9),
    plugins: buildPlugins(daw),
    track_summary: {
      audio: audio.length ? audio : ['Vocals', 'Drums', 'Bass'],
      midi: ['Lead Synth', 'Pad', 'Keys'],
      return: ['Reverb', 'Delay'],
    },
  };
}

const MOCK = [
  { name: 'Midnight Drive', daw: 'Ableton Live', genre: 'Synthwave', bpm: 110, key: 'A min',
    description: 'Late-night synthwave cut with an arpeggiated lead.',
    branches: { main: ['Blocked out the intro pads', 'Added the arp lead + bass', 'Widened the pad stack', 'Mixed the drop, tightened lows'],
      'halftime-flip': ['Branch from the drop', 'Halftime drums, darker mood'] } },
  { name: 'Lowrider Funk', daw: 'FL Studio', genre: 'Funk', bpm: 96, key: 'E maj',
    description: 'Slappy funk groove with live-feel drums.',
    branches: { main: ['Laid the bassline', 'Rhodes + clav comping', 'Horn stabs on the chorus', 'Balanced the drum bus'] } },
  { name: 'Room 204', daw: 'Logic Pro', genre: 'Lo-fi Hip Hop', bpm: 84, key: 'F# min',
    description: 'Dusty lo-fi beat, tape-saturated keys.',
    branches: { main: ['Chopped the piano loop', 'Added swing + vinyl noise', 'Sidechained the pad'],
      'darker-mix': ['Branch: pull the highs down', 'Muddier, warmer master'],
      'no-drums': ['Branch: ambient version', 'Removed drums, long reverb tails'] } },
  { name: 'Static Bloom', daw: 'Reaper', genre: 'Ambient', bpm: 70, key: 'C maj',
    description: 'Generative ambient bed with granular textures.',
    branches: { main: ['Granular texture bed', 'Layered the drones', 'Automated the filter sweep'] } },
  { name: 'Neon Alley', daw: 'Ableton Live', genre: 'House', bpm: 124, key: 'G min',
    description: 'Peak-time house roller.',
    branches: { main: ['Four-on-the-floor + bass', 'Added the vocal chop hook', 'Built the breakdown', 'Loudness pass on the master'],
      'peak-time-edit': ['Branch: club edit', 'Longer intro, bigger drop'] } },
  { name: 'Paper Planes', daw: 'FL Studio', genre: 'Trap', bpm: 140, key: 'D# min',
    description: '808-heavy trap with pitched vocal chops.',
    branches: { main: ['808 glides + hats', 'Melody on the bells', 'Vocal chop topline', 'Mix pass on the 808'] } },
  { name: 'Cold Harbor', daw: 'Pro Tools', genre: 'Cinematic', bpm: 90, key: 'D min',
    description: 'Orchestral hybrid cue for a short film.',
    branches: { main: ['Strings + low brass sketch', 'Added the taiko hits', 'Rising tension build', 'Printed stems'] } },
  { name: 'Velvet Hours', daw: 'Logic Pro', genre: 'R&B', bpm: 72, key: 'Bb min',
    description: 'Slow-burn R&B with layered harmonies.',
    branches: { main: ['Chord progression + Rhodes', 'Stacked the background vocals', 'Added the finger snaps'] } },
  { name: 'Dust & Gold', daw: 'Ableton Live', genre: 'Indie', bpm: 118, key: 'A maj',
    description: 'Jangly indie track with live guitars.',
    branches: { main: ['Guitar hook + scratch vocal', 'Drums and tambourine', 'Doubled the guitars'] } },
  { name: 'Afterglow', daw: 'Reaper', genre: 'Downtempo', bpm: 100, key: 'E min',
    description: 'Downtempo groove with warm analog bass.',
    branches: { main: ['Analog bass groove', 'Added the Rhodes chords', 'Percussion loop + shaker', 'Glue compression on the bus'] } },
];

/**
 * Merge the mock plugins into the global installed-plugin cache so the panel
 * shows them as owned (green check) instead of "Get plugin". The real cache is
 * backed up once and restored on clean. Matching in the app is space-insensitive
 * substring, so lowercased names match the metadata plugin names.
 */
function seedPluginCache() {
  if (fs.existsSync(PLUGIN_CACHE_FILE) && !fs.existsSync(PLUGIN_CACHE_BACKUP)) {
    fs.copyFileSync(PLUGIN_CACHE_FILE, PLUGIN_CACHE_BACKUP);
  }
  const existing = readJson(PLUGIN_CACHE_FILE, { plugins: [] });
  const real = Array.isArray(existing.plugins) ? existing.plugins : [];
  const have = new Set(real.map((p) => String(p.name || '').toLowerCase().replace(/\s+/g, '')));

  const names = new Map();
  for (const m of MOCK) for (const p of buildPlugins(m.daw)) names.set(p.name.toLowerCase(), p.name);
  const additions = [];
  for (const [lower, orig] of names) {
    if (have.has(lower.replace(/\s+/g, ''))) continue;
    additions.push({ name: lower, type: 'AU', path: `/Library/Audio/Plug-Ins/Components/${orig.replace(/\s+/g, '')}.component` });
  }
  writeJson(PLUGIN_CACHE_FILE, { timestamp: Date.now(), plugins: [...real, ...additions] });
  return additions.length;
}

function restorePluginCache() {
  if (fs.existsSync(PLUGIN_CACHE_BACKUP)) {
    fs.copyFileSync(PLUGIN_CACHE_BACKUP, PLUGIN_CACHE_FILE);
    fs.rmSync(PLUGIN_CACHE_BACKUP, { force: true });
  }
}

function seed(demoUser) {
  const userDir = path.join(VCS_DIR, 'users', demoUser);
  const logsDir = path.join(userDir, 'logs');
  const commitsDir = path.join(userDir, 'commits');
  fs.mkdirSync(logsDir, { recursive: true });
  fs.mkdirSync(commitsDir, { recursive: true });
  fs.mkdirSync(DEMO_DIR, { recursive: true });

  // Remember who was active so `clean` can switch back.
  const marker = readJson(MARKER_FILE, null);
  const previousUser = (marker && marker.previousUser) || (currentUser() !== demoUser ? currentUser() : null);

  const registryData = { projects: {} };
  for (const m of MOCK) {
    const projectId = uuid();
    const ext = EXT[m.daw] || 'als';
    const folder = path.join(DEMO_DIR, m.name);
    fs.mkdirSync(folder, { recursive: true });
    const projectFile = path.join(folder, `${m.name}.${ext}`);
    fs.writeFileSync(projectFile, `DAWLab demo placeholder for ${m.name} (${m.daw}).\n`);
    // Backdate the file well before any checkout so History reads it as "no
    // unsaved changes" -> the current commit shows green "On Device" (not the
    // yellow modified/save state).
    const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    try { fs.utimesSync(projectFile, old, old); } catch { /* noop */ }

    registryData.projects[m.name] = {
      project_id: projectId, name: m.name, path: projectFile, daw: m.daw,
      genre: m.genre, description: m.description, key: m.key, bpm: m.bpm,
      privacy_flag: 'local', tags: [], storage_mode: 'home',
    };

    const branchNames = Object.keys(m.branches);
    const branches = branchNames.map((bname, bi) => ({
      name: bname, commits: buildCommits(m.branches[bname], 30 - bi * 6, demoUser),
    }));

    // Point HEAD at the newest commit on main so it renders green "On Device".
    const mainBranch = branches.find((b) => b.name === 'main') || branches[0];
    const headCommit = mainBranch.commits[mainBranch.commits.length - 1];
    const lastCheckout = { commitId: headCommit.commit_id, timestamp: headCommit.timestamp };

    const fileMap = buildFileTree(m.daw, m.name);
    writeJson(path.join(logsDir, `${projectId}-${m.name}.json`), {
      id: projectId, name: m.name, daw: m.daw, privacy_flag: 'local', collaborators: [],
      description: m.description, bpm: m.bpm, key: m.key, current_branch: 'main', branches,
      lastCheckout, owner_id: null, metadata: buildMetadata(m.daw, m, fileMap), draft: null,
      primaryFile: `${m.name}.${ext}`, ignoredFiles: [],
    });

    // A filemap.json per commit so the FileExplorer shows the tree for any version.
    for (const b of branches) {
      for (const c of b.commits) {
        writeJson(path.join(commitsDir, m.name, c.commit_id, 'filemap.json'), fileMap);
      }
    }

    const nb = branchNames.length;
    const np = buildPlugins(m.daw).length;
    console.log(`+ ${m.name.padEnd(16)} ${m.daw.padEnd(13)} ${nb} branch${nb > 1 ? 'es' : ''}, ${fileMap.length} files, ${np} plugins`);
  }

  writeJson(path.join(userDir, 'registry.json'), registryData);
  writeJson(MARKER_FILE, { demoUser, previousUser });
  const addedPlugins = seedPluginCache();
  setActiveUser(demoUser);

  console.log(`\nSeeded ${MOCK.length} mock projects into user "${demoUser}" and switched to it.`);
  console.log(`Marked ${addedPlugins} plugins as installed (real plugin cache backed up).`);
  if (previousUser) console.log(`Your previous user "${previousUser}" is untouched; \`clean\` switches you back.`);
  console.log('Restart / reopen DAWLab to see them.');
}

function clean() {
  const marker = readJson(MARKER_FILE, null);
  if (!marker) { console.log('No demo marker found — nothing to clean.'); return; }
  const { demoUser, previousUser } = marker;
  const userDir = path.join(VCS_DIR, 'users', demoUser);
  if (fs.existsSync(userDir)) fs.rmSync(userDir, { recursive: true, force: true });
  if (fs.existsSync(DEMO_DIR)) fs.rmSync(DEMO_DIR, { recursive: true, force: true });
  restorePluginCache();
  fs.rmSync(MARKER_FILE, { force: true });
  if (previousUser) { setActiveUser(previousUser); console.log(`Deleted demo user "${demoUser}"; switched back to "${previousUser}".`); }
  else console.log(`Deleted demo user "${demoUser}".`);
}

const cmd = (process.argv[2] || 'seed').toLowerCase();
const demoUser = sanitizeUsername(process.argv[3] || 'demo') || 'demo';
if (cmd === 'seed') seed(demoUser);
else if (cmd === 'clean') clean();
else if (cmd === 'reset') { clean(); seed(demoUser); }
else { console.log('Usage: node scripts/seed-mock-data.cjs [seed|clean|reset] [demoUsername]'); process.exit(1); }
