import { Worker } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadProjectLog, saveProjectLog } from '../dawvcs/core/log';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Spawns a background worker to extract metadata from a project after commit
 * This runs asynchronously and does not block the commit operation
 * The metadata will replace any existing metadata in the log
 * 
 * @param projectName - The name of the project
 * @param projectPath - The full path to the project directory
 * @param commitId - The ID of the commit that was just created (for logging purposes)
 * @param daw - The DAW type from the project log
 */
export function extractMetadataInBackground(
  projectName: string,
  projectPath: string,
  commitId: string,
  daw: string
): void {
  // Only extract metadata for supported DAWs
  const supportedDAWs = ['Ableton Live', 'Logic Pro X'];
  if (!supportedDAWs.includes(daw)) {
    console.log(`[MetadataManager] Skipping metadata extraction for ${projectName} (DAW: ${daw})`);
    return;
  }

  console.log(`[MetadataManager] Starting background metadata extraction for commit ${commitId}`);

  // Spawn worker thread
  const workerPath = path.join(__dirname, 'metadataExtractor.js');
  const worker = new Worker(workerPath, {
    workerData: {
      projectPath,
      commitId,
      daw
    },
    stdout: true,
    stderr: true
  });

  // Pipe worker stdout/stderr to main console
  worker.stdout?.on('data', (data) => {
    console.log('[Worker]', data.toString().trim());
  });
  
  worker.stderr?.on('data', (data) => {
    console.error('[Worker]', data.toString().trim());
  });

  // Handle worker messages
  worker.on('message', async (result: any) => {
    if (result.success) {
      try {
        console.log(`[MetadataManager] Received metadata:`, JSON.stringify(result.metadata, null, 2));
        
        // Read log fresh to avoid race conditions
        const log = await loadProjectLog(projectName);
        
        // Replace metadata with the latest extraction
        log.metadata = result.metadata;
        
        // Save the updated log
        saveProjectLog(projectName, log);
        
        console.log(`[MetadataManager] Successfully extracted and saved metadata for commit ${commitId}`);
        console.log(`[MetadataManager] Plugins found: ${result.metadata.plugins?.length || 0}`);
        if (result.metadata.plugins?.length > 0) {
          console.log(`[MetadataManager] Plugin list:`, result.metadata.plugins);
        }
      } catch (err: any) {
        console.error(`[MetadataManager] Failed to save metadata for commit ${commitId}:`, err.message);
      }
    } else {
      // Silent error logging as per requirements
      console.error(`[MetadataManager] Metadata extraction failed for commit ${commitId}:`, result.error);
    }
  });

  // Handle worker errors
  worker.on('error', (err) => {
    console.error(`[MetadataManager] Worker error for commit ${commitId}:`, err.message);
  });

  // Handle worker exit
  worker.on('exit', (code) => {
    if (code !== 0) {
      console.error(`[MetadataManager] Worker exited with code ${code} for commit ${commitId}`);
    }
  });
}
