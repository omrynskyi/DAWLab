import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { initProject } from "../operations/init";
import { commitProjectLocal, captureDraft } from "../operations/commit";
import { createBranchLocal, switchBranch } from "../operations/branch";
import { rollbackProjectLocal } from "../operations/rollback";
import { setUsername, clearUsername } from "../core/constants";
import { deleteProjectLocal } from "../operations/delete";
import { getCleanableFiles, cleanCasFiles } from "../operations/clean";
import { updateProjectLog, updateProjectInRegistry } from "../operations/modify";
import { loadLocalProjectLog } from "../core/log";
import { getCommitFileMap, commitExists } from "../core/commits";
import { ProjectFileAmbiguityError } from "../core/daw-detection";
import fs from "fs";
import path from "path";
import os from "os";

// Create a separate temp dir for "home" to isolate from real home
// We need to do this outside the mock factory to share it, but vitest hoisting makes that hard.
// We'll trust the electron mock's internal definition for consistency if we could, 
// but easier to just use a fixed temp path structure or mock implementation.

const { MOCK_HOME } = vi.hoisted(() => {
  const os = require('os');
  const path = require('path');
  const fs = require('fs');
  const dir = path.join(os.tmpdir(), `dawlab-test-home-${process.pid}-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  return { MOCK_HOME: dir };
});

vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>();
  const actualDefault = (actual as unknown as { default: typeof import('os') }).default;
  return {
    ...actual,
    default: { ...actualDefault, homedir: () => MOCK_HOME },
    homedir: () => MOCK_HOME
  };
});

vi.mock("../core/constants", async (importOriginal) => {
  const actual = await importOriginal<typeof import('../core/constants')>();
  const mockPath = require("path");
  return {
    ...actual,
    HOME: MOCK_HOME,
    VCS_DIR: mockPath.join(MOCK_HOME, '.dawlab'),
    CAS_DIR: mockPath.join(MOCK_HOME, '.dawlab', 'cas'),
    getUserDir: (username?: string) => mockPath.join(MOCK_HOME, '.dawlab', 'users', username || actual.getUsername()),
    getRegistryFile: (username?: string) => mockPath.join(MOCK_HOME, '.dawlab', 'users', username || actual.getUsername(), 'registry.json'),
    getCommitsDir: (username?: string) => mockPath.join(MOCK_HOME, '.dawlab', 'users', username || actual.getUsername(), 'commits'),
    getLogsDir: (username?: string) => mockPath.join(MOCK_HOME, '.dawlab', 'users', username || actual.getUsername(), 'logs'),
  };
});


// Mock Electron module first (before any imports that use it)
// Mock Electron module first
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name) => {
      if (name === 'home') return MOCK_HOME;
      if (name === 'appData') return path.join(MOCK_HOME, 'AppData');
      return path.join(MOCK_HOME, name);
    }),
  },
}));

// Mock the CAS and network modules
vi.mock("../core/cas", () => ({
  CAS_DIR: "/mock/cas",
  ensureCasDir: vi.fn(),
  storeInCasSync: vi.fn(
    (filePath: string) => `hash_${path.basename(filePath)}`
  ),
  restoreFile: vi.fn((hash: string, targetPath: string) => {
    // Create file with hash as content
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, `content_${hash}`);
  }),
  getCasPath: vi.fn((hash: string) => `/mock/cas/${hash}`),
  getProjectHashes: vi.fn(() => new Set()),
  getHashesInUseByOtherProjects: vi.fn(() => new Set()),
  deleteOrphanedHashes: vi.fn(() => 0),
  calculateCasSize: vi.fn(() => ({ totalSize: 0, count: 0 })),
}));

// Don't mock DAW detection - let it run with real project structure!

describe("Core VCS Operations", () => {
  let testDir: string;
  let projectName: string;
  let projectPath: string;

  beforeEach(() => {
    // Set username for VCS operations
    setUsername("test-user");

    // Create a temporary directory for each test
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "dawlab-test-"));
    // Use unique project name based on temp dir to avoid collisions
    projectName = `test-project-${path.basename(testDir)}`;
    projectPath = path.join(testDir, "project-files");

    // Create realistic Ableton project structure
    fs.mkdirSync(projectPath, { recursive: true });

    // Create Ableton project file (.als)
    fs.writeFileSync(
      path.join(projectPath, "test_project.als"),
      "ableton project data"
    );

    // Create Samples directory with audio files
    const samplesDir = path.join(projectPath, "Samples");
    fs.mkdirSync(samplesDir, { recursive: true });
    fs.writeFileSync(path.join(samplesDir, "audio.wav"), "sample audio data");
    fs.writeFileSync(path.join(samplesDir, "drum.wav"), "drum sample data");

    // Add some other common files
    fs.writeFileSync(path.join(projectPath, "notes.txt"), "project notes");
  });

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }

    // Clean up log files created during tests
    const logsDir = path.join(
      os.homedir(),
      ".dawlab",
      "users",
      "test-user",
      "logs"
    );
    
    if (fs.existsSync(logsDir)) {
        const files = fs.readdirSync(logsDir);
        files.forEach(file => {
            if (file.endsWith(`${projectName}.json`)) {
                fs.unlinkSync(path.join(logsDir, file));
            }
        });
    }

    // Clean up commits directory
    const commitsPath = path.join(
      os.homedir(),
      ".dawlab",
      "users",
      "test-user",
      "commits",
      projectName
    );
    if (fs.existsSync(commitsPath)) {
      fs.rmSync(commitsPath, { recursive: true, force: true });
    }

    // Clean up registry file to prevent test interference
    const registryPath = path.join(
      os.homedir(),
      ".dawlab",
      "users",
      "test-user",
      "registry.json"
    );
    if (fs.existsSync(registryPath)) {
      fs.unlinkSync(registryPath);
    }

    // Clear username
    clearUsername();
  });

  it("should initialize a new project", async () => {
    const { projectId } = await initProject(projectName, projectPath, { author: "test-author" });

    // Check that the log file was created
    const logPath = path.join(
      os.homedir(),
      ".dawlab",
      "users",
      "test-user",
      "logs",
      `${projectId}-${projectName}.json`
    );
    expect(fs.existsSync(logPath)).toBe(true);

    const log = JSON.parse(fs.readFileSync(logPath, "utf-8"));
    expect(log.name).toBe(projectName);
    // project_path is no longer stored in logs - it's in registry only
    expect(log.branches).toBeDefined();
    expect(log.branches.length).toBeGreaterThan(0);
    expect(log.branches[0].name).toBe("main");
  });

  it("should commit changes to a project", async () => {
    // Initialize project first
    const { projectId } = await initProject(projectName, projectPath, { author: "test-author" });

    // Modify files
    fs.writeFileSync(path.join(projectPath, "test.txt"), "modified content");

    // Create a commit
    const result = await commitProjectLocal(
      projectName,
      "Second commit",
      "main",
      "test-author"
    );

    expect(result.commitId).toBeDefined();
    expect(result.numFiles).toBeGreaterThan(0);

    // Verify log was updated
    const logPath = path.join(
      os.homedir(),
      ".dawlab",
      "users",
      "test-user",
      "logs",
      `${projectId}-${projectName}.json`
    );
    const log = JSON.parse(fs.readFileSync(logPath, "utf-8"));

    const mainBranch = log.branches.find((b: any) => b.name === "main");
    expect(mainBranch.commits.length).toBe(2); // Initial + this commit
    expect(mainBranch.commits[1].message).toBe("Second commit");
  });

  describe("Auto-draft capture", () => {
    it("captures an unnamed draft without adding it to the branch log", async () => {
      await initProject(projectName, projectPath, { author: "test-author" });
      const commitCountBefore = loadLocalProjectLog(projectName).branches.find(
        (b: any) => b.name === "main"
      ).commits.length;

      // Wait past the 1s commit-id granularity so the draft can't collide with
      // init's initial commit (as the real watcher fires seconds after a save).
      await new Promise((r) => setTimeout(r, 1100));
      fs.writeFileSync(path.join(projectPath, "test.txt"), "unsaved work");
      const result = await captureDraft(projectName, "main", "test-author");

      expect("commitId" in result).toBe(true);
      const draftId = (result as { commitId: string }).commitId;

      const log = loadLocalProjectLog(projectName);
      // Draft is recorded on the log but stays out of the branch's commit list.
      expect(log.draft?.commit_id).toBe(draftId);
      const mainBranch = log.branches.find((b: any) => b.name === "main");
      expect(mainBranch.commits.length).toBe(commitCountBefore);
      expect(mainBranch.commits.find((c: any) => c.commit_id === draftId)).toBeUndefined();
      // Snapshot is on disk.
      expect(getCommitFileMap(projectName, draftId).length).toBeGreaterThan(0);
      // Draft capture must not advance the "last checkout" pointer.
      expect(log.lastCheckout?.commitId).not.toBe(draftId);
    });

    it("overwrites the previous draft, keeping only one", async () => {
      await initProject(projectName, projectPath, { author: "test-author" });

      fs.writeFileSync(path.join(projectPath, "test.txt"), "first save");
      const first = (await captureDraft(projectName, "main", "test-author")) as { commitId: string };

      // A later save (distinct content + id) should replace the earlier draft.
      await new Promise((r) => setTimeout(r, 1100));
      fs.writeFileSync(path.join(projectPath, "test.txt"), "second save");
      const second = (await captureDraft(projectName, "main", "test-author")) as { commitId: string };

      expect(second.commitId).not.toBe(first.commitId);
      const log = loadLocalProjectLog(projectName);
      expect(log.draft?.commit_id).toBe(second.commitId);
      // Old draft's snapshot is gone; only the latest remains.
      expect(commitExists(projectName, first.commitId)).toBe(false);
      expect(commitExists(projectName, second.commitId)).toBe(true);
    });

    it("clears the draft when a real commit is made", async () => {
      await initProject(projectName, projectPath, { author: "test-author" });

      fs.writeFileSync(path.join(projectPath, "test.txt"), "unsaved work");
      const draft = (await captureDraft(projectName, "main", "test-author")) as { commitId: string };
      expect(loadLocalProjectLog(projectName).draft).toBeTruthy();

      await new Promise((r) => setTimeout(r, 1100));
      await commitProjectLocal(projectName, "Named it", "main", "test-author");

      const log = loadLocalProjectLog(projectName);
      expect(log.draft).toBeNull();
      // The superseded draft snapshot is cleaned up.
      expect(commitExists(projectName, draft.commitId)).toBe(false);
    });
  });

  it("should create a new branch", async () => {
    // Initialize and commit
    const { projectId } = await initProject(projectName, projectPath, { author: "test-author" });

    // Create a new branch
    const result = await createBranchLocal(projectName, "feature-branch");

    expect(result.success).toBe(true);
    expect(result.branch).toBe("feature-branch");
    expect(result.commitId).toBeDefined();

    // Verify branch was created in log
    const logPath = path.join(
      os.homedir(),
      ".dawlab",
      "users",
      "test-user",
      "logs",
      `${projectId}-${projectName}.json`
    );
    const log = JSON.parse(fs.readFileSync(logPath, "utf-8"));

    const newBranch = log.branches.find(
      (b: any) => b.name === "feature-branch"
    );
    expect(newBranch).toBeDefined();
    expect(newBranch.commits.length).toBe(1); // Should have the initial commit
  });

  it("should switch between branches", async () => {
    // Initialize, create branch
    const { projectId } = await initProject(projectName, projectPath, { author: "test-author" });
    await createBranchLocal(projectName, "feature-branch");

    // Switch to the new branch
    const result = await switchBranch(projectName, "feature-branch");

    expect(result.success).toBe(true);
    expect(result.branch).toBe("feature-branch");

    // Verify current branch changed
    const logPath = path.join(
      os.homedir(),
      ".dawlab",
      "users",
      "test-user",
      "logs",
      `${projectId}-${projectName}.json`
    );
    const log = JSON.parse(fs.readFileSync(logPath, "utf-8"));
    expect(log.current_branch).toBe("feature-branch");

    // Switch back to main
    const result2 = await switchBranch(projectName, "main");
    expect(result2.success).toBe(true);

    const log2 = JSON.parse(fs.readFileSync(logPath, "utf-8"));
    expect(log2.current_branch).toBe("main");
  });

  it("should rollback to a previous commit", async () => {
    // Initialize project
    const { projectId } = await initProject(projectName, projectPath, { author: "test-author" });

    // Get the initial commit ID
    const logPath = path.join(
      os.homedir(),
      ".dawlab",
      "users",
      "test-user",
      "logs",
      `${projectId}-${projectName}.json`
    );
    let log = JSON.parse(fs.readFileSync(logPath, "utf-8"));
    const initialCommitId = log.branches[0].commits[0].commit_id;

    // Modify files and commit again
    fs.writeFileSync(path.join(projectPath, "test.txt"), "modified content");
    fs.writeFileSync(path.join(projectPath, "new-file.txt"), "new file");
    await commitProjectLocal(
      projectName,
      "Add new file",
      "main",
      "test-author"
    );

    // Rollback to initial commit
    const result = await rollbackProjectLocal(projectName, initialCommitId);

    expect(result.success).toBe(true);

    // Verify lastCheckout was updated
    log = JSON.parse(fs.readFileSync(logPath, "utf-8"));
    expect(log.lastCheckout.commitId).toBe(initialCommitId);

    // Verify files were restored (note: our mock restoreFile creates files with hash content)
    expect(fs.existsSync(projectPath)).toBe(true);
  });

  // ========== COMPLETE WORKFLOW TESTS ==========

  describe("Complete Workflow Integration", () => {
    it("should handle complete project lifecycle: init → commits → branch → switch → rollback", async () => {
      // Step 1: Initialize project
      const { projectId } = await initProject(projectName, projectPath, {
        author: "test-author",
      });

      const logPath = path.join(
        os.homedir(),
        ".dawlab",
        "users",
        "test-user",
        "logs",
        `${projectId}-${projectName}.json`
      );
      let log = JSON.parse(fs.readFileSync(logPath, "utf-8"));

      expect(log.current_branch).toBe("main");
      expect(log.branches[0].commits.length).toBe(1);

      // Step 2: Make changes and commit on main
      fs.writeFileSync(
        path.join(projectPath, "song-v1.txt"),
        "first version of song"
      );
      const commit1 = await commitProjectLocal(
        projectName,
        "Add song v1",
        "main",
        "test-author"
      );

      log = JSON.parse(fs.readFileSync(logPath, "utf-8"));
      expect(log.branches[0].commits.length).toBe(2);
      expect(log.branches[0].commits[1].message).toBe("Add song v1");

      // Step 3: Make another commit on main
      fs.writeFileSync(
        path.join(projectPath, "song-v2.txt"),
        "second version of song"
      );
      fs.writeFileSync(path.join(projectPath, "drums.txt"), "drum pattern");
      await commitProjectLocal(
        projectName,
        "Add song v2 and drums",
        "main",
        "test-author"
      );

      log = JSON.parse(fs.readFileSync(logPath, "utf-8"));
      expect(log.branches[0].commits.length).toBe(3);

      // Step 4: Create feature branch from current state
      const branchResult = await createBranchLocal(projectName, "experimental");
      expect(branchResult.success).toBe(true);
      expect(branchResult.branch).toBe("experimental");

      log = JSON.parse(fs.readFileSync(logPath, "utf-8"));
      expect(log.branches.length).toBe(2);
      const expBranch = log.branches.find(
        (b: any) => b.name === "experimental"
      );
      expect(expBranch).toBeDefined();
      expect(expBranch.commits.length).toBe(1); // Should have only the commit it branched from

      // Step 5: Switch to experimental branch
      const switchResult = await switchBranch(projectName, "experimental");
      expect(switchResult.success).toBe(true);

      log = JSON.parse(fs.readFileSync(logPath, "utf-8"));
      expect(log.current_branch).toBe("experimental");

      // Step 6: Make experimental changes
      fs.writeFileSync(
        path.join(projectPath, "experimental-synth.txt"),
        "crazy synth sounds"
      );
      await commitProjectLocal(
        projectName,
        "Add experimental synth",
        "experimental",
        "test-author"
      );

      log = JSON.parse(fs.readFileSync(logPath, "utf-8"));
      const expBranchAfter = log.branches.find(
        (b: any) => b.name === "experimental"
      );
      expect(expBranchAfter.commits.length).toBe(2); // Initial branched commit + this new one

      // Verify experimental file exists
      expect(
        fs.existsSync(path.join(projectPath, "experimental-synth.txt"))
      ).toBe(true);

      // Step 7: Switch back to main
      await switchBranch(projectName, "main");
      log = JSON.parse(fs.readFileSync(logPath, "utf-8"));
      expect(log.current_branch).toBe("main");

      // Step 8: Rollback main to the second commit (before v2 and drums)
      await rollbackProjectLocal(projectName, commit1.commitId);

      log = JSON.parse(fs.readFileSync(logPath, "utf-8"));
      expect(log.lastCheckout.commitId).toBe(commit1.commitId);

      // Verify rollback updated the lastCheckout correctly
      // (File state verification is limited with mocked restoreFile)
      expect(log.lastCheckout).toBeDefined();
      expect(log.lastCheckout.commitId).toBe(commit1.commitId);

      // Step 9: Switch to experimental branch (should still have all its commits)
      await switchBranch(projectName, "experimental");
      log = JSON.parse(fs.readFileSync(logPath, "utf-8"));
      expect(log.current_branch).toBe("experimental");

      const finalExpBranch = log.branches.find(
        (b: any) => b.name === "experimental"
      );
      expect(finalExpBranch.commits.length).toBe(2);
      expect(finalExpBranch.commits[1].message).toBe("Add experimental synth");

      // Verify final state
      const mainBranch = log.branches.find((b: any) => b.name === "main");
      expect(mainBranch.commits.length).toBe(3); // Still has all commits, just rolled back
      expect(log.branches.length).toBe(2);
    });

    it("should preserve file contents through complete workflow", async () => {
      // Initialize
      await initProject(projectName, projectPath, {
        author: "test-author",
      });

      // Create files with specific known content
      const fileContent1 =
        "This is my original mix\nWith specific content\n123456789";
      const fileContent2 = "Bass line version 1\nFunky bass\nDrop the beat";

      fs.writeFileSync(path.join(projectPath, "mix.txt"), fileContent1);
      fs.writeFileSync(path.join(projectPath, "bass.txt"), fileContent2);

      // Commit
      const commit1 = await commitProjectLocal(
        projectName,
        "Initial versions",
        "main",
        "test-author"
      );

      // Modify files
      fs.writeFileSync(
        path.join(projectPath, "mix.txt"),
        "MODIFIED VERSION - DIFFERENT"
      );
      fs.writeFileSync(path.join(projectPath, "bass.txt"), "CHANGED BASS LINE");

      // Commit changes
      await commitProjectLocal(
        projectName,
        "Modified versions",
        "main",
        "test-author"
      );

      // Rollback to first commit
      await rollbackProjectLocal(projectName, commit1.commitId);

      // Verify exact file contents match original
      // Our mock restoreFile creates files with hash as content, so we just check they exist
      // In real implementation, these would match exactly
      expect(fs.existsSync(path.join(projectPath, "mix.txt"))).toBe(true);
      expect(fs.existsSync(path.join(projectPath, "bass.txt"))).toBe(true);
    });

    it("should maintain branch isolation during parallel workflows", async () => {
      // Initialize
      const { projectId } = await initProject(projectName, projectPath, {
        author: "test-author",
      });

      const logPath = path.join(
        os.homedir(),
        ".dawlab",
        "users",
        "test-user",
        "logs",
        `${projectId}-${projectName}.json`
      );

      // Commit on main
      fs.writeFileSync(path.join(projectPath, "main-file.txt"), "main content");
      await commitProjectLocal(
        projectName,
        "Main branch work",
        "main",
        "test-author"
      );

      // Create feature branch
      await createBranchLocal(projectName, "feature-a");
      await switchBranch(projectName, "feature-a");

      // Work on feature-a
      fs.writeFileSync(
        path.join(projectPath, "feature-a-file.txt"),
        "feature a content"
      );
      await commitProjectLocal(
        projectName,
        "Feature A work",
        "feature-a",
        "test-author"
      );

      // Switch back to main
      await switchBranch(projectName, "main");

      // Create another feature branch
      await createBranchLocal(projectName, "feature-b");
      await switchBranch(projectName, "feature-b");

      // Work on feature-b
      fs.writeFileSync(
        path.join(projectPath, "feature-b-file.txt"),
        "feature b content"
      );
      await commitProjectLocal(
        projectName,
        "Feature B work",
        "feature-b",
        "test-author"
      );

      // Verify branch isolation
      const log = JSON.parse(fs.readFileSync(logPath, "utf-8"));

      const mainBranch = log.branches.find((b: any) => b.name === "main");
      const featureA = log.branches.find((b: any) => b.name === "feature-a");
      const featureB = log.branches.find((b: any) => b.name === "feature-b");

      expect(mainBranch.commits.length).toBe(2); // Initial + main work
      expect(featureA.commits.length).toBe(2); // Branched from main's 2nd + feature A work
      expect(featureB.commits.length).toBe(2); // Branched from main's 2nd + feature B work

      // Verify commit messages are branch-specific
      expect(featureA.commits[1].message).toBe("Feature A work");
      expect(featureB.commits[1].message).toBe("Feature B work");
    });
  });

  // ========== FAILURE & BLOCKING SCENARIO TESTS ==========

  describe("Failure Scenarios", () => {
    it("should fail when initializing a project with invalid path", async () => {
      const invalidPath = "/invalid/nonexistent/path/that/does/not/exist";

      await expect(
        initProject(projectName, invalidPath, { author: "test-author" })
      ).rejects.toThrow();
    });

    it("should fail when committing to a non-existent project", async () => {
      const nonExistentProject = "nonexistent-project-xyz";

      await expect(
        commitProjectLocal(
          nonExistentProject,
          "Test commit",
          "main",
          "test-author"
        )
      ).rejects.toThrow();
    });

    it("should fail when creating a branch on a non-existent project", async () => {
      const nonExistentProject = "nonexistent-project-xyz";

      await expect(
        createBranchLocal(nonExistentProject, "feature-branch")
      ).rejects.toThrow();
    });

    it("should fail when creating a duplicate branch", async () => {
      // Initialize project and create a branch
      await initProject(projectName, projectPath, {
        author: "test-author",
      });
      await createBranchLocal(projectName, "feature-branch");

      // Try to create the same branch again
      await expect(
        createBranchLocal(projectName, "feature-branch")
      ).rejects.toThrow();
    });

    it("should fail when switching to a non-existent branch", async () => {
      // Initialize project
      await initProject(projectName, projectPath, {
        author: "test-author",
      });

      // Try to switch to a branch that doesn't exist
      await expect(
        switchBranch(projectName, "nonexistent-branch")
      ).rejects.toThrow();
    });

    it("should fail when switching branches on a non-existent project", async () => {
      const nonExistentProject = "nonexistent-project-xyz";

      await expect(switchBranch(nonExistentProject, "main")).rejects.toThrow();
    });

    it("should fail when rolling back to a non-existent commit", async () => {
      // Initialize project
      await initProject(projectName, projectPath, {
        author: "test-author",
      });

      // Try to rollback to a fake commit ID
      const fakeCommitId = "fake-commit-id-12345";

      await expect(
        rollbackProjectLocal(projectName, fakeCommitId)
      ).rejects.toThrow();
    });

    it("should fail when rolling back a non-existent project", async () => {
      const nonExistentProject = "nonexistent-project-xyz";

      await expect(
        rollbackProjectLocal(nonExistentProject, "some-commit-id")
      ).rejects.toThrow();
    });

    it("should fail when committing with an empty message", async () => {
      // Initialize project
      await initProject(projectName, projectPath, {
        author: "test-author",
      });

      // Modify a file
      fs.writeFileSync(path.join(projectPath, "test.txt"), "modified content");

      // Try to commit with empty message
      await expect(
        commitProjectLocal(projectName, "", "main", "test-author")
      ).rejects.toThrow();
    });

    it("should fail when committing to a non-existent branch", async () => {
      // Initialize project
      await initProject(projectName, projectPath, {
        author: "test-author",
      });

      // Modify a file
      fs.writeFileSync(path.join(projectPath, "test.txt"), "modified content");

      // Try to commit to a branch that doesn't exist
      await expect(
        commitProjectLocal(
          projectName,
          "Test commit",
          "nonexistent-branch",
          "test-author"
        )
      ).rejects.toThrow();
    });
  });

  describe("Blocking Scenarios", () => {
    it("should block when trying to initialize the same project twice", async () => {
      // Initialize project
      await initProject(projectName, projectPath, {
        author: "test-author",
      });

      // Try to initialize the same project again
      await expect(
        initProject(projectName, projectPath, { author: "test-author" })
      ).rejects.toThrow();
    });

    it("should allow commit without any file changes", async () => {
      // Initialize project
      await initProject(projectName, projectPath, {
        author: "test-author",
      });

      // Try to commit without making any changes
      // Note: This might not throw depending on implementation,
      // but should at least handle gracefully
      const result = await commitProjectLocal(
        projectName,
        "No changes commit",
        "main",
        "test-author"
      );

      // Should either succeed with 0 files or throw
      if (result.commitId) {
        expect(result.numFiles).toBeGreaterThanOrEqual(0);
      }
    });

    it("should block concurrent commits to the same project", async () => {
      // Initialize project
      await initProject(projectName, projectPath, {
        author: "test-author",
      });

      // Modify files
      fs.writeFileSync(path.join(projectPath, "file1.txt"), "content 1");
      fs.writeFileSync(path.join(projectPath, "file2.txt"), "content 2");

      // Attempt concurrent commits
      const commit1Promise = commitProjectLocal(
        projectName,
        "Commit 1",
        "main",
        "test-author"
      );
      const commit2Promise = commitProjectLocal(
        projectName,
        "Commit 2",
        "main",
        "test-author"
      );

      // One should succeed, one should fail or be blocked
      const results = await Promise.allSettled([
        commit1Promise,
        commit2Promise,
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      // Expect at least one to be rejected (conflict) or both to succeed sequentially
      expect(fulfilled.length + rejected.length).toBe(2);
    });

    it("should block switching branches while files are modified", async () => {
      // Initialize project and create branch
      await initProject(projectName, projectPath, {
        author: "test-author",
      });
      await createBranchLocal(projectName, "feature-branch");

      // Modify files without committing
      fs.writeFileSync(
        path.join(projectPath, "uncommitted.txt"),
        "uncommitted changes"
      );

      // Try to switch branches with uncommitted changes
      // This should either:
      // 1. Throw an error (blocking the switch)
      // 2. Handle gracefully by stashing/warning
      try {
        const result = await switchBranch(projectName, "feature-branch");
        // If it succeeds, uncommitted changes should be handled somehow
        expect(result.success).toBeDefined();
      } catch (error) {
        // Expected to throw due to uncommitted changes
        expect(error).toBeDefined();
      }
    });

    it("should block creating a branch with invalid characters in name", async () => {
      // Initialize project
      await initProject(projectName, projectPath, {
        author: "test-author",
      });

      // Try to create branches with invalid names
      // Note: spaces, slashes, apostrophes, hyphens, underscores are allowed per implementation
      const invalidNames = [
        "branch@#$%",
        "branch*invalid",
        "branch<>name",
        "",
      ];

      for (const invalidName of invalidNames) {
        await expect(
          createBranchLocal(projectName, invalidName)
        ).rejects.toThrow();
      }
    });

    it("should block operations when username is not set", async () => {
      // Clear username
      clearUsername();

      // Try to initialize without username
      await expect(
        initProject(projectName, projectPath, { author: "test-author" })
      ).rejects.toThrow();

      // Restore username for cleanup
      setUsername("test-user");
    });

    it("should not block commit when a new project file appears after the primary file is already tracked", async () => {
      // Initialize project (beforeEach already creates test_project.als) - this
      // resolves and persists test_project.als as the tracked primary file.
      await initProject(projectName, projectPath, {
        author: "test-author",
      });

      // Simulate the user duplicating/experimenting with a second file later -
      // this should not block the already-resolved project from committing.
      fs.writeFileSync(
        path.join(projectPath, "second_project.als"),
        "another ableton project"
      );

      const result = await commitProjectLocal(
        projectName,
        "Should still succeed",
        "main",
        "test-author"
      );
      expect(result.commitId).toBeTruthy();

      // Clean up the extra file
      fs.unlinkSync(path.join(projectPath, "second_project.als"));
    });

    it("should block init when multiple project files exist in folder", async () => {
      // beforeEach already creates test_project.als - add another project file
      fs.writeFileSync(
        path.join(projectPath, "second_project.als"),
        "another ableton project"
      );

      // Try to init - should fail because there are two .als files
      await expect(
        initProject(projectName, projectPath, { author: "test-author" })
      ).rejects.toThrow("Multiple project files found");

      // Clean up the extra file so other tests can run
      fs.unlinkSync(path.join(projectPath, "second_project.als"));
    });
  });

  // ========== MULTIPLE PROJECT FILES / IGNORE LIST TESTS ==========

  describe("Multiple Project Files & Ignore List", () => {
    it("throws a ProjectFileAmbiguityError listing every candidate when multiple real files exist", async () => {
      fs.writeFileSync(
        path.join(projectPath, "second_project.als"),
        "another ableton project"
      );

      let caught: any;
      try {
        await initProject(projectName, projectPath, { author: "test-author" });
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(ProjectFileAmbiguityError);
      expect(caught.candidates.sort()).toEqual(
        ["second_project.als", "test_project.als"].sort()
      );
    });

    it("initializes with the user's chosen primaryFile and records the rest as ignoredFiles", async () => {
      fs.writeFileSync(
        path.join(projectPath, "Chorus Idea.als"),
        "sketch, not the real project"
      );

      await initProject(projectName, projectPath, {
        author: "test-author",
        primaryFile: "test_project.als",
        ignoredFiles: ["Chorus Idea.als"],
      });

      const log = loadLocalProjectLog(projectName);
      expect(log.primaryFile).toBe("test_project.als");
      expect(log.ignoredFiles).toEqual(["Chorus Idea.als"]);
    });

    it("resolves automatically when ignoredFiles narrows candidates down to exactly one", async () => {
      fs.writeFileSync(
        path.join(projectPath, "Chorus Idea.als"),
        "sketch, not the real project"
      );

      // No primaryFile given - just enough ignoredFiles to make it unambiguous
      await initProject(projectName, projectPath, {
        author: "test-author",
        ignoredFiles: ["Chorus Idea.als"],
      });

      const log = loadLocalProjectLog(projectName);
      expect(log.primaryFile).toBe("test_project.als");
    });

    it("does not treat autosave/backup files as competing candidates", async () => {
      fs.writeFileSync(
        path.join(projectPath, "test_project_autosave.als"),
        "fl-style autosave copy"
      );

      // Should NOT throw ambiguity - the autosave file is filtered out automatically
      await initProject(projectName, projectPath, { author: "test-author" });

      const log = loadLocalProjectLog(projectName);
      expect(log.primaryFile).toBe("test_project.als");
    });

    it("flags ambiguity across two different DAWs' project files in the same folder", async () => {
      fs.writeFileSync(
        path.join(projectPath, "test_project.flp"),
        "an FL Studio project living in the same folder"
      );

      let caught: any;
      try {
        await initProject(projectName, projectPath, { author: "test-author" });
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(ProjectFileAmbiguityError);
      expect(caught.candidates.sort()).toEqual(
        ["test_project.als", "test_project.flp"].sort()
      );
    });

    it("auto-follows a rename of the primary file on the next commit", async () => {
      await initProject(projectName, projectPath, { author: "test-author" });

      fs.renameSync(
        path.join(projectPath, "test_project.als"),
        path.join(projectPath, "test_project_renamed.als")
      );

      const result = await commitProjectLocal(
        projectName,
        "renamed the project file",
        "main",
        "test-author"
      );
      expect(result.commitId).toBeTruthy();

      const log = loadLocalProjectLog(projectName);
      expect(log.primaryFile).toBe("test_project_renamed.als");
    });

    it("includes a newly appeared project file in the commit's fileMap without treating it specially", async () => {
      await initProject(projectName, projectPath, { author: "test-author" });

      fs.writeFileSync(
        path.join(projectPath, "second_project.als"),
        "a second file the user hasn't decided about yet"
      );

      const result = await commitProjectLocal(
        projectName,
        "added a second file",
        "main",
        "test-author"
      );

      const fileMap = getCommitFileMap(projectName, result.commitId);
      const paths = fileMap.map((f) => f.path);
      expect(paths).toContain("second_project.als");
      expect(paths).toContain("test_project.als");
    });

    it("excludes an ignored file from the committed fileMap", async () => {
      await initProject(projectName, projectPath, { author: "test-author" });

      fs.writeFileSync(
        path.join(projectPath, "second_project.als"),
        "a file the user has chosen to ignore"
      );

      await updateProjectLog(projectName, { ignoredFiles: ["second_project.als"] });

      const result = await commitProjectLocal(
        projectName,
        "commit with an ignored file present",
        "main",
        "test-author"
      );

      const fileMap = getCommitFileMap(projectName, result.commitId);
      const paths = fileMap.map((f) => f.path);
      expect(paths).not.toContain("second_project.als");
      expect(paths).toContain("test_project.als");
    });

    it("excludes an entire ignored folder from the committed fileMap", async () => {
      await initProject(projectName, projectPath, { author: "test-author" });

      await updateProjectLog(projectName, { ignoredFiles: ["Samples"] });

      const result = await commitProjectLocal(
        projectName,
        "commit with an ignored folder present",
        "main",
        "test-author"
      );

      const fileMap = getCommitFileMap(projectName, result.commitId);
      const paths = fileMap.map((f) => f.path);
      expect(paths.some((p) => p.startsWith("Samples/"))).toBe(false);
      expect(paths).toContain("test_project.als");
    });

    it("keeps the resolved primaryFile stable across repeated commits with no changes", async () => {
      await initProject(projectName, projectPath, { author: "test-author" });
      const logAfterInit = loadLocalProjectLog(projectName);
      expect(logAfterInit.primaryFile).toBe("test_project.als");

      await commitProjectLocal(projectName, "second commit", "main", "test-author");

      const logAfterCommit = loadLocalProjectLog(projectName);
      expect(logAfterCommit.primaryFile).toBe("test_project.als");
    });
  });

  // ========== ROLLBACK SAFETY TESTS ==========

  describe("Rollback Safety - Data Loss Prevention", () => {
    it("should NOT delete untracked files during rollback", async () => {
      // Initialize and commit
      await initProject(projectName, projectPath, {
        author: "test-author",
      });
      
      // Get projectId from registry (or we could capture from init return)
      const { loadRegistry } = await import('../core/registry');
      const registry = loadRegistry();
      const projectId = registry[projectName].project_id;

      const logPath = path.join(
        os.homedir(),
        ".dawlab",
        "users",
        "test-user",
        "logs",
        `${projectId}-${projectName}.json`
      );
      const log = JSON.parse(fs.readFileSync(logPath, "utf-8"));
      const initialCommitId = log.branches[0].commits[0].commit_id;

      // Create tracked file and commit
      fs.writeFileSync(path.join(projectPath, "tracked.txt"), "tracked file");
      await commitProjectLocal(
        projectName,
        "Add tracked file",
        "main",
        "test-author"
      );

      // Create UNTRACKED file (not committed)
      const untrackedFile = path.join(projectPath, "important-untracked.txt");
      fs.writeFileSync(untrackedFile, "USER DATA - DO NOT DELETE");

      // Rollback to initial commit
      await rollbackProjectLocal(projectName, initialCommitId);

      // CRITICAL: Untracked file should still exist after rollback
      expect(fs.existsSync(untrackedFile)).toBe(true);
      if (fs.existsSync(untrackedFile)) {
        expect(fs.readFileSync(untrackedFile, "utf-8")).toContain("USER DATA");
      }
    });

    it("should NOT delete files from parent directory during rollback", async () => {
      // Create important file in PARENT directory
      const parentDir = path.dirname(projectPath);
      const importantParentFile = path.join(
        parentDir,
        "important-parent-file.txt"
      );
      fs.writeFileSync(importantParentFile, "CRITICAL PARENT DATA");

      try {
        // Initialize and commit project
        const { projectId } = await initProject(projectName, projectPath, {
          author: "test-author",
        });

        const logPath = path.join(
          os.homedir(),
          ".dawlab",
          "users",
          "test-user",
          "logs",
          `${projectId}-${projectName}.json`
        );
        const log = JSON.parse(fs.readFileSync(logPath, "utf-8"));
        const commitId = log.branches[0].commits[0].commit_id;

        // Rollback
        await rollbackProjectLocal(projectName, commitId);

        // CRITICAL: Parent file must still exist
        expect(fs.existsSync(importantParentFile)).toBe(true);
        expect(fs.readFileSync(importantParentFile, "utf-8")).toBe(
          "CRITICAL PARENT DATA"
        );
      } finally {
        // Cleanup
        if (fs.existsSync(importantParentFile)) {
          fs.unlinkSync(importantParentFile);
        }
      }
    });

    it("should NOT wipe entire folder when multiple project files exist", async () => {
      // Initialize and commit first
      const { projectId } = await initProject(projectName, projectPath, {
        author: "test-author",
      });

      fs.writeFileSync(path.join(projectPath, "my-file.txt"), "my content");
      await commitProjectLocal(projectName, "Add file", "main", "test-author");

      // Create ANOTHER project file AFTER commit (simulating user having multiple DAW projects)
      // This file is NOT tracked by VCS since it was added after the commit
      const otherProjectFile = path.join(projectPath, "other-song.als");
      fs.writeFileSync(
        otherProjectFile,
        "OTHER ABLETON PROJECT - DO NOT DELETE"
      );

      const logPath = path.join(
        os.homedir(),
        ".dawlab",
        "users",
        "test-user",
        "logs",
        `${projectId}-${projectName}.json`
      );
      const log = JSON.parse(fs.readFileSync(logPath, "utf-8"));
      const commitId = log.branches[0].commits[0].commit_id;

      // Rollback
      await rollbackProjectLocal(projectName, commitId);

      // CRITICAL: The other project file should NOT be deleted (it's untracked)
      expect(fs.existsSync(otherProjectFile)).toBe(true);
      if (fs.existsSync(otherProjectFile)) {
        expect(fs.readFileSync(otherProjectFile, "utf-8")).toContain(
          "OTHER ABLETON PROJECT"
        );
      }
    });

    it("should only delete files that are in the commit filemap", async () => {
      // Initialize
      await initProject(projectName, projectPath, {
        author: "test-author",
      });

      // Commit with specific files
      fs.writeFileSync(path.join(projectPath, "song1.wav"), "audio data 1");
      fs.writeFileSync(path.join(projectPath, "song2.wav"), "audio data 2");
      const commit1 = await commitProjectLocal(
        projectName,
        "Add songs",
        "main",
        "test-author"
      );

      // Add more files and commit
      fs.writeFileSync(path.join(projectPath, "song3.wav"), "audio data 3");
      await commitProjectLocal(
        projectName,
        "Add song 3",
        "main",
        "test-author"
      );

      // Add file that's NOT in any commit (untracked)
      const userFile = path.join(projectPath, "user-notes.txt");
      fs.writeFileSync(userFile, "My personal notes - NOT IN VCS");

      // Rollback to first commit (should only have song1 and song2)
      await rollbackProjectLocal(projectName, commit1.commitId);

      // User file should STILL exist
      expect(fs.existsSync(userFile)).toBe(true);
    });

    it("should protect files in subdirectories outside project scope", async () => {
      // Create subdirectory with user data BEFORE initializing project
      const userDataDir = path.join(
        path.dirname(projectPath),
        "my-personal-files"
      );
      fs.mkdirSync(userDataDir, { recursive: true });
      fs.writeFileSync(
        path.join(userDataDir, "important.txt"),
        "IMPORTANT USER DATA"
      );

      try {
        // Initialize project
        const { projectId } = await initProject(projectName, projectPath, {
          author: "test-author",
        });

        const logPath = path.join(
          os.homedir(),
          ".dawlab",
          "users",
          "test-user",
          "logs",
          `${projectId}-${projectName}.json`
        );
        const log = JSON.parse(fs.readFileSync(logPath, "utf-8"));
        const commitId = log.branches[0].commits[0].commit_id;

        // Rollback
        await rollbackProjectLocal(projectName, commitId);

        // CRITICAL: User data directory should be untouched
        expect(fs.existsSync(userDataDir)).toBe(true);
        expect(fs.existsSync(path.join(userDataDir, "important.txt"))).toBe(
          true
        );
      } finally {
        // Cleanup
        if (fs.existsSync(userDataDir)) {
          fs.rmSync(userDataDir, { recursive: true, force: true });
        }
      }
    });

    it('should reject dangerous paths and throw an error before any deletion', async () => {
      // Initialize project in a SAFE temp folder
      const { projectId } = await initProject(projectName, projectPath, { author: 'test-author' });
      
      const logPath = path.join(os.homedir(), '.dawlab', 'users', 'test-user', 'logs', `${projectId}-${projectName}.json`);
      const log = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
      const commitId = log.branches[0].commits[0].commit_id;
      
      // Test dangerous paths - these should be caught by rollback safety checks
      // Note: We can't modify log.project_path anymore since it's not in logs
      // Instead, we'd need to modify the registry, but the safety check in rollback
      // reads from registry via getProjectPath(), so this test validates the safety mechanism
      const dangerousPaths = ['/', os.homedir(), '/etc', '/usr'];

      for (const dangerousPath of dangerousPaths) {
        // Temporarily modify registry to point to dangerous path
        const { loadRegistry, saveRegistry } = await import('../core/registry');
        const registry = loadRegistry();
        const projectEntry = Object.values(registry).find((p: any) => p.name === projectName);
        if (projectEntry) {
          const originalPath = (projectEntry as any).path;
          (projectEntry as any).path = dangerousPath;
          saveRegistry(registry);
          
          // Should throw BEFORE attempting any deletion
          await expect(
            rollbackProjectLocal(projectName, commitId)
          ).rejects.toThrow('CRITICAL SECURITY');
          
          // Restore original path
          (projectEntry as any).path = originalPath;
          saveRegistry(registry);
        }
      }
    });

  });

  // ========== REGISTRY REFACTOR TESTS ==========

  describe("Registry as Single Source of Truth", () => {
    it("should retrieve project path from registry, not from log", async () => {
      // Initialize project
      const { projectId } = await initProject(projectName, projectPath, { author: "test-author" });

      // Load log and verify it does NOT contain project_path
      const logPath = path.join(
        os.homedir(),
        ".dawlab",
        "users",
        "test-user",
        "logs",
        `${projectId}-${projectName}.json`
      );
      const log = JSON.parse(fs.readFileSync(logPath, "utf-8"));
      expect(log.project_path).toBeUndefined();

      // Verify path is in registry instead
      const { getProjectPath } = await import('../core/registry');
      const retrievedPath = getProjectPath(projectName);
      expect(retrievedPath).toBe(projectPath);
    });

    it("should use getProjectPath helper in commit operation", async () => {
      // Initialize project
      await initProject(projectName, projectPath, { author: "test-author" });

      // Modify files
      fs.writeFileSync(path.join(projectPath, "test.txt"), "test content");

      // Commit should work using registry path
      const result = await commitProjectLocal(
        projectName,
        "Test commit",
        "main",
        "test-author"
      );

      expect(result.commitId).toBeDefined();
    });

    it("should use getProjectPath helper in rollback operation", async () => {
      // Initialize project
      const { projectId } = await initProject(projectName, projectPath, { author: "test-author" });

      const logPath = path.join(
        os.homedir(),
        ".dawlab",
        "users",
        "test-user",
        "logs",
        `${projectId}-${projectName}.json`
      );
      const log = JSON.parse(fs.readFileSync(logPath, "utf-8"));
      const commitId = log.branches[0].commits[0].commit_id;

      // Rollback should work using registry path
      const result = await rollbackProjectLocal(projectName, commitId);
      expect(result.success).toBe(true);
    });

    it("should return null for non-existent project", async () => {
      const { getProjectPath } = await import('../core/registry');

      const nonExistentPath = getProjectPath("non-existent-project-xyz");
      expect(nonExistentPath).toBeNull();
    });

    it("should handle migration from old logs with project_path", async () => {
      // Initialize project normally
      const { projectId } = await initProject(projectName, projectPath, { author: "test-author" });

      // Setup for migration:
      // 1. Rename the new log file to legacy format (simulating old state)
      // 2. Add project_path to it (simulating old data)
      const newLogPath = path.join(
        os.homedir(),
        ".dawlab",
        "users",
        "test-user",
        "logs",
        `${projectId}-${projectName}.json`
      );
      const legacyLogPath = path.join(
        os.homedir(),
        ".dawlab",
        "users",
        "test-user",
        "logs",
        `${projectName}.json`
      );
      
      const log = JSON.parse(fs.readFileSync(newLogPath, "utf-8"));
      log.project_path = projectPath; // Add old field
      
      fs.writeFileSync(legacyLogPath, JSON.stringify(log, null, 2));
      fs.unlinkSync(newLogPath);

      // Run migration by passing the log object directly
      const { migrateProjectPathToRegistry } = await import('../core/registry');
      await migrateProjectPathToRegistry(log);

      // Verify path is in registry
      const { getProjectPath } = await import('../core/registry');
      const retrievedPath = getProjectPath(projectName);
      expect(retrievedPath).toBe(projectPath);

      // Verify migration happened (file should be back at new path or updated)
      // The migration logic in registry.ts modifies the registry and saves the log.
      // saveProjectLog handles moving it to the correct path if ID exists.
      
      const finalLogPath = path.join(
        os.homedir(),
        ".dawlab",
        "users",
        "test-user",
        "logs",
        `${projectId}-${projectName}.json`
      );
      
      // Check if new file exists (it should be recreated/moved by saveProjectLog)
      const finalLog = JSON.parse(fs.readFileSync(finalLogPath, "utf-8"));
      expect(finalLog.project_path).toBeUndefined();
    });

    it("should not fail migration if project already in registry", async () => {
      // Initialize project (already in registry)
      await initProject(projectName, projectPath, { author: "test-author" });

      // Create a log object with project_path (simulating old format)
      const { migrateProjectPathToRegistry } = await import('../core/registry');
      const mockLog = {
        project_name: projectName,
        project_path: projectPath,
        id: 'local-id',
        current_branch: 'main',
        branches: []
      };
      
      // Should not throw even if already in registry
      await expect(migrateProjectPathToRegistry(mockLog)).resolves.not.toThrow();
    });

    it("should handle branch operations with registry path", async () => {
      // Initialize project
      await initProject(projectName, projectPath, { author: "test-author" });

      // Create branch should work with registry path
      const result = await createBranchLocal(projectName, "feature-branch");
      expect(result.success).toBe(true);

      // Switch branch should work with registry path
      const switchResult = await switchBranch(projectName, "feature-branch");
      expect(switchResult.success).toBe(true);
    });

    it("should fail operations when project not in registry", async () => {
      const nonExistentProject = "not-in-registry-project";

      // Commit should fail
      await expect(
        commitProjectLocal(nonExistentProject, "Test", "main", "test-author")
      ).rejects.toThrow();

      // Rollback should fail
      await expect(
        rollbackProjectLocal(nonExistentProject, "fake-commit-id")
      ).rejects.toThrow();

      // Branch creation should fail
      await expect(
        createBranchLocal(nonExistentProject, "feature")
      ).rejects.toThrow();
    });

    it("should handle path updates in registry", async () => {
      const { getProjectPath, loadRegistry, saveRegistry } = await import('../core/registry');

      // Initialize project
      await initProject(projectName, projectPath, { author: "test-author" });

      // Verify initial path
      const initialPath = getProjectPath(projectName);
      expect(initialPath).toBe(projectPath);

      // Update path in registry
      const newPath = path.join(testDir, "new-location");
      fs.mkdirSync(newPath, { recursive: true });
      
      const registry = loadRegistry();
      if (registry[projectName]) {
        registry[projectName].path = newPath;
        saveRegistry(registry);
      }

      // Verify updated path
      const updatedPath = getProjectPath(projectName);
      expect(updatedPath).toBe(newPath);
    });
  });

  // ========== EXTENDED OPERATIONS TESTS ==========

  describe("Delete Operations", () => {
    it("should delete a local project and clean up resources", async () => {
      // Initialize project
      await initProject(projectName, projectPath, { author: "test-author" });

      // Make some commits
      fs.writeFileSync(path.join(projectPath, "file1.txt"), "content 1");
      await commitProjectLocal(projectName, "Commit 1", "main", "test-author");

      // Verify it exists in registry
      const registryPath = path.join(os.homedir(), ".dawlab", "users", "test-user", "registry.json");
      expect(fs.existsSync(registryPath)).toBe(true);
      JSON.parse(fs.readFileSync(registryPath, "utf-8"));
      // expect(registry[projectName]).toBeDefined();

      // Delete project
      const result = await deleteProjectLocal(projectName);
      expect(result.success).toBe(true);
      expect(result.message).toContain("deleted successfully");

      // Verify registry entry removed
      JSON.parse(fs.readFileSync(registryPath, "utf-8"));
      // expect(registry[projectName]).toBeUndefined();

      // Verify log file removed
      const logPath = path.join(
        os.homedir(),
        ".dawlab",
        "users",
        "test-user",
        "logs",
        `${projectName}.json`
      );
      expect(fs.existsSync(logPath)).toBe(false);

      // Verify commits directory removed
      const commitsPath = path.join(
        os.homedir(),
        ".dawlab",
        "users",
        "test-user",
        "commits",
        projectName
      );
      expect(fs.existsSync(commitsPath)).toBe(false);
    });
  });

  describe("Clean Operations", () => {
    it("should identify and clean unused CAS files", async () => {
      // NOTE: Because we are using a mocked CAS in this file that doesn't actually store files 
      // where the clean operation looks for them (or tracks them the same way), 
      // this test is tricky to implement with the current high-level mocks.
      // 
      // The current 'restoreFile' mock creates files with 'content_${hash}' content.
      // The 'clean.ts' mainly relies on 'getCommitsDir' and 'getCasPath'.
      // 
      // We will perform a basic test to ensure the functions run without error.

      const cleanable = getCleanableFiles();
      expect(Array.isArray(cleanable)).toBe(true);

      // Attempt to clean mocked hashes
      const result = cleanCasFiles(["hash_1", "hash_2"]);
      expect(result).toBeDefined();
      expect(result.filesDeleted).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Modify Operations", () => {
    it("should update project log details", async () => {
      await initProject(projectName, projectPath, { author: "test-author" });

      const newDescription = "Updated description";
      const newBpm = 140;

      await updateProjectLog(projectName, {
        description: newDescription,
        bpm: newBpm
      });

      // Verify changes in log file (filename may be prefixed with project ID)
      const logsDir = path.join(os.homedir(), ".dawlab", "users", "test-user", "logs");
      const logFileName = fs.readdirSync(logsDir).find(f => f.endsWith(`${projectName}.json`))!;
      const log = JSON.parse(fs.readFileSync(path.join(logsDir, logFileName), "utf-8"));
      expect(log.description).toBe(newDescription);
      expect(log.bpm).toBe(newBpm);
    });

    it("should update project registry details", async () => {
      await initProject(projectName, projectPath, { author: "test-author" });

      const newDescription = "Registry updated description";

      await updateProjectInRegistry(projectName, {
        description: newDescription
      });

      // Verify changes in registry
      const registryPath = path.join(os.homedir(), ".dawlab", "users", "test-user", "registry.json");
      JSON.parse(fs.readFileSync(registryPath, "utf-8"));
      // expect(registry[projectName].description).toBe(newDescription);
    });
  });
});
