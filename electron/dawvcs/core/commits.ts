import fs from 'fs'
import path from 'path'
import { getCommitsDir } from './constants'
import { writeJsonSync } from './fs-utils'
import { FileMapEntry } from '../types'

export function getCommitPath(projectName: string, commitId: string, commitsDir: string = getCommitsDir()) {
    return path.join(commitsDir, projectName, commitId)
}

export function saveCommit(projectName: string, commitId: string, fileMap: FileMapEntry[], commitsDir: string = getCommitsDir()) {
    const commitPath = getCommitPath(projectName, commitId, commitsDir)
    fs.mkdirSync(commitPath, { recursive: true })
    writeJsonSync(path.join(commitPath, 'filemap.json'), fileMap)
}

export function getCommitFileMap(projectName: string, commitId: string, commitsDir: string = getCommitsDir()): FileMapEntry[] {
    const commitPath = getCommitPath(projectName, commitId, commitsDir)
    const filemapFile = path.join(commitPath, 'filemap.json')

    if (!fs.existsSync(filemapFile)) {
        throw new Error(`No filemap found for commit ${commitId}`)
    }

    return JSON.parse(fs.readFileSync(filemapFile, 'utf8')) as FileMapEntry[]
}

export function commitExists(projectName: string, commitId: string, commitsDir: string = getCommitsDir()): boolean {
    const commitPath = getCommitPath(projectName, commitId, commitsDir)
    return fs.existsSync(path.join(commitPath, 'filemap.json'))
}

export function deleteProjectCommits(projectName: string, commitsDir: string = getCommitsDir()) {
    const projectCommitsDir = path.join(commitsDir, projectName)
    if (fs.existsSync(projectCommitsDir)) {
        // We can delete recursively
        fs.rmSync(projectCommitsDir, { recursive: true, force: true })
    }
}
