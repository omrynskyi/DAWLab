import { XMLParser } from 'fast-xml-parser';
import zlib from 'zlib';
import fs from 'fs';

export interface PluginInfo {
    name: string;
    manufacturer?: string;
    type?: string;
    is_instrument?: boolean;
}

export interface ExtractedMetadata {
    daw_version: string;
    tempo: number;
    time_signature: string;
    total_tracks: number;
    plugins: PluginInfo[];
    track_summary: {
        audio: string[];
        midi: string[];
        return: string[];
        group?: string[];
    };
}

export interface MetadataParser {
    parse(filePath: string): Promise<ExtractedMetadata>;
}

export class AbletonParser implements MetadataParser {
    constructor() {
        console.log('[AbletonParser] Running pure metadata-driven engine (v4)');
    }

    async parse(filePath: string): Promise<ExtractedMetadata> {
        console.log(`[AbletonParser] Parsing: ${filePath}`);
        
        const fileBuffer = fs.readFileSync(filePath);
        let xmlContent: string;

        try {
            xmlContent = zlib.gunzipSync(fileBuffer).toString('utf-8');
        } catch (e) {
            xmlContent = fileBuffer.toString('utf-8');
        }

        const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: "@_",
            isArray: (name) => [
                'AudioTrack', 'MidiTrack', 'ReturnTrack', 'GroupTrack', 
                'AuPluginDevice', 'Vst3PluginDevice', 'PluginDevice'
            ].includes(name)
        });
        const jsonObj = parser.parse(xmlContent);

        if (!jsonObj.Ableton || !jsonObj.Ableton.LiveSet) {
            throw new Error('Invalid Ableton Live project file');
        }

        const liveSet = jsonObj.Ableton.LiveSet;

        // Metadata extraction
        const creator = jsonObj.Ableton['@_Creator'];
        const versionStr = creator ? creator : `Ableton Live ${jsonObj.Ableton['@_MajorVersion']}.${jsonObj.Ableton['@_MinorVersion']}`;
        const dawVersion = versionStr.startsWith('Ableton Live') ? versionStr : `Ableton Live ${versionStr}`;
        
        let tempo = 120;
        try {
            tempo = liveSet.MasterTrack?.DeviceChain?.Mixer?.Tempo?.Manual?.['@_Value'] || 120;
        } catch (e) {}

        let timeSignature = '4/4';
        try {
            const num = liveSet.MasterTrack?.DeviceChain?.Mixer?.TimeSignature?.TimeSignature?.['@_Value'] || 4;
            timeSignature = `${num}/4`; 
        } catch (e) {}

        const tracks = {
            audio: [] as string[],
            midi: [] as string[],
            return: [] as string[],
            group: [] as string[]
        };

        const processTracks = (trackEntries: any) => {
            if (!trackEntries) return;
            const extractNames = (trackArray: any, type: keyof typeof tracks) => {
                const arr = Array.isArray(trackArray) ? trackArray : trackArray ? [trackArray] : [];
                arr.forEach((t: any) => {
                    let name = 'Untitled Track';
                    if (t.Name) {
                        const userName = t.Name.UserName?.['@_Value'];
                        const effectiveName = t.Name.EffectiveName?.['@_Value'];
                        if (userName && String(userName).trim() !== '') {
                            name = userName;
                        } else if (effectiveName) {
                            name = effectiveName;
                        }
                    }
                    tracks[type].push(name);
                });
            };
            extractNames(trackEntries.AudioTrack, 'audio');
            extractNames(trackEntries.MidiTrack, 'midi');
            extractNames(trackEntries.ReturnTrack, 'return');
            extractNames(trackEntries.GroupTrack, 'group');
        };

        processTracks(liveSet.Tracks);

        // Exhaustive Search
        const pluginsList = this.findPlugins(jsonObj);
        console.log(`[AbletonParser] Found ${pluginsList.length} unique plugins`);

        return {
            daw_version: dawVersion,
            tempo: parseFloat(Number(tempo).toFixed(2)),
            time_signature: timeSignature,
            total_tracks: tracks.audio.length + tracks.midi.length + tracks.return.length + tracks.group.length,
            plugins: pluginsList,
            track_summary: tracks
        };
    }

    private findPlugins(root: any): PluginInfo[] {
        const pluginsList: PluginInfo[] = [];
        const seenKeys = new Set<string>();
        const stack: any[] = [root];

        while (stack.length > 0) {
            const obj = stack.pop();
            if (!obj || typeof obj !== 'object') continue;

            if (obj.PluginDesc) {
                const pd = obj.PluginDesc;
                let type: string | undefined;
                let info: any;

                if (pd.Vst3PluginInfo) { type = "VST3"; info = pd.Vst3PluginInfo; }
                else if (pd.VstPluginInfo) { type = "VST2"; info = pd.VstPluginInfo; }
                else if (pd.AuPluginInfo) { type = "AU"; info = pd.AuPluginInfo; }

                if (type && info) {
                    // Logic Priority 1: Direct from info block
                    const nameTag = (type === "VST2") ? "PlugName" : "Name";
                    let name = info[nameTag]?.['@_Value'] || "";
                    
                    // Logic Priority 2: Fallback recursive search in PluginDesc
                    if (!name || name === "") {
                        name = this.findFirstValue(pd, ["Name", "PlugName", "EffectiveName", "UserName"]) || "Unknown";
                    }

                    // Manufacturer Priority 1: Direct child
                    let manufacturer = info.Manufacturer?.['@_Value'] || "";
                    
                    // Manufacturer Priority 2: Anywhere within PluginDesc
                    if (!manufacturer || manufacturer === "") {
                        manufacturer = this.findFirstValue(pd, ["Manufacturer"]) || "";
                    }

                    // Manufacturer Priority 3: BrowserContentPath fallback
                    if (!manufacturer || manufacturer === "") {
                        const bpath = this.findFirstValue(pd, ["BrowserContentPath"]);
                        if (bpath) {
                            const match = bpath.match(/#([^:]+):/);
                            if (match) manufacturer = decodeURIComponent(match[1].replace(/%20/g, ' '));
                        }
                    }

                    if (manufacturer === "") manufacturer = "Unknown";

                    // Strict Instrument vs Effect
                    let isInstrument = false;
                    const bdid = this.findFirstValue(obj, ["BranchDeviceId"]);
                    if (bdid) {
                        if (bdid.includes(':instr:')) isInstrument = true;
                        else if (bdid.includes(':audiofx:')) isInstrument = false;
                    }

                    if (name !== "Unknown") {
                        const key = `${name}|${manufacturer}|${type}|${isInstrument}`.toLowerCase();
                        if (!seenKeys.has(key)) {
                            seenKeys.add(key);
                            pluginsList.push({ name, manufacturer, type, is_instrument: isInstrument });
                            console.log(`[AbletonParser] Identified ${type}: ${name} (${manufacturer}) [${isInstrument ? 'INST' : 'FX'}]`);
                        }
                    }
                }
            }

            // Recursive traversal
            if (Array.isArray(obj)) {
                for (let i = obj.length - 1; i >= 0; i--) stack.push(obj[i]);
            } else {
                for (const k of Object.keys(obj)) {
                    if (k.startsWith('@_')) continue;
                    if (obj[k] && typeof obj[k] === 'object') stack.push(obj[k]);
                }
            }
        }
        return pluginsList;
    }

    private findFirstValue(root: any, tags: string[]): string | null {
        const stack: any[] = [root];
        while (stack.length > 0) {
            const node = stack.pop();
            if (!node || typeof node !== 'object') continue;
            for (const t of tags) {
                if (node[t] && node[t]['@_Value'] !== undefined) {
                    const v = String(node[t]['@_Value']).trim();
                    if (v !== "") return v;
                }
            }
            if (Array.isArray(node)) {
                for (let i = node.length - 1; i >= 0; i--) stack.push(node[i]);
            } else {
                for (const k of Object.keys(node)) {
                    if (k.startsWith('@_')) continue;
                    if (node[k] && typeof node[k] === 'object') stack.push(node[k]);
                }
            }
        }
        return null;
    }
}
