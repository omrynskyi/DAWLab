import { parentPort, workerData } from 'worker_threads';
import path from 'path';
import fs from 'fs';
import { AbletonParser, MetadataParser } from './parser';
import { LogicProParser } from './logicProParser';

async function run() {
    const { projectPath, commitId, daw } = workerData;

    console.log(`[Worker] Started metadata extraction for commit: ${commitId}`);
    console.log(`[Worker] Project path: ${projectPath}, DAW: ${daw}`);

    try {
        let parser: MetadataParser;
        let targetPath: string;

        if (daw === 'Logic Pro X') {
            // Logic Pro: find the .logicx bundle in the project directory
            const files = fs.readdirSync(projectPath);
            const logicxBundle = files.find(f => {
                const fullPath = path.join(projectPath, f);
                return f.endsWith('.logicx') && fs.statSync(fullPath).isDirectory();
            });

            if (!logicxBundle) {
                throw new Error('No .logicx bundle found in project path');
            }

            targetPath = path.join(projectPath, logicxBundle);
            console.log(`[Worker] Using Logic Pro bundle: ${logicxBundle}`);
            parser = new LogicProParser();
        } else {
            // Ableton Live: find the .als file
            const files = fs.readdirSync(projectPath);
            const alsFiles = files.filter(f => f.endsWith('.als'));
            
            if (alsFiles.length === 0) {
                throw new Error('No .als file found in project path');
            }

            // Sort by size to find the primary project file if multiple exist
            const primaryAls = alsFiles.sort((a, b) => {
                const sizeA = fs.statSync(path.join(projectPath, a)).size;
                const sizeB = fs.statSync(path.join(projectPath, b)).size;
                return sizeB - sizeA;
            })[0];

            targetPath = path.join(projectPath, primaryAls);
            console.log(`[Worker] Using primary project file: ${primaryAls} (${(fs.statSync(targetPath).size / 1024).toFixed(1)} KB)`);
            parser = new AbletonParser();
        }
        
        const metadata = await parser.parse(targetPath);

        console.log(`[Worker] Extraction successful. Found ${metadata.plugins.length} plugins, ${metadata.total_tracks} tracks.`);

        // Debug: Write metadata to temp file for inspection
        try {
            const debugPath = path.join(projectPath, `.dawlab-metadata-debug.json`);
            fs.writeFileSync(debugPath, JSON.stringify(metadata, null, 2));
            console.log(`[Worker] Debug info exported to: ${debugPath}`);
        } catch (e) {}

        if (parentPort) {
            parentPort.postMessage({
                success: true,
                commitId,
                metadata
            });
        }

    } catch (err: any) {
        console.error(`[Worker] Error during extraction: ${err.message}`);
        if (parentPort) {
            parentPort.postMessage({
                success: false,
                commitId,
                error: err.message
            });
        }
    }
}

run();
