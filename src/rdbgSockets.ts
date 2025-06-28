import { exec } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { listRdbgSocks, unlinkSocket, extractPidFromRdbgSocketPath } from './utils';
import { RdbgSocketPath } from './types';
import { FsHelper } from './fsHelper';

export const RDBG_SOCK_DIR = '/tmp/rdbg-socks';

/**
 * Ensures the rdbg socket directory exists.
 * Creates the directory if it doesn't exist.
 */
export function ensureRdbgSocketDirectory(): void {
    if (!FsHelper.existsSync(RDBG_SOCK_DIR)) {
        FsHelper.mkdirSync(RDBG_SOCK_DIR, { recursive: true });
    }
}

/**
 * Checks if a given rdbg socket is stale (not used by any process) and deletes it if so.
 * @param socket The socket file path
 * @returns true if the socket is in use (not stale), false if it was deleted as stale
 */
export async function checkAndCleanRdbgSocket(socket: RdbgSocketPath): Promise<boolean> {
    let pid: number;
    try {
        if (socket === null) {
            throw new Error('Socket path is null');
        }
        pid = extractPidFromRdbgSocketPath(socket);
    } catch (e: any) {
        // If PID cannot be extracted, treat as stale and delete
        await unlinkSocket(socket);
        return false;
    }
    // Check if the process with this PID is running
    try {
        process.kill(pid, 0); // Does not actually kill, just checks if process exists
        return true;
    } catch (e: any) {
        // Process does not exist, so socket is stale
        await unlinkSocket(socket);
        return false;
    }
}

/**
 * Cleans up stale rdbg socket files that are not attached to any process.
 * Uses checkAndCleanRdbgSocket for each socket.
 */
export async function cleanupStaleRdbgSockets(): Promise<void> {
    const { stdout } = await listRdbgSocks();
    const sockets = stdout.split('\n').map((line: string) => line.trim()).filter(Boolean);
    for (const socket of sockets) {
        await checkAndCleanRdbgSocket(socket);
    }
}

/**
 * Finds the rdbg socket path for a given session name, without waiting.
 * @param sessionSuffix The session name or suffix to look for in the socket list
 * @returns The socket path if found, or null if not found
 */
export async function findRdbgSocketForSession(sessionSuffix: string): Promise<RdbgSocketPath | null> {
    try {
        const { stdout } = await listRdbgSocks();
        const line = stdout.split('\n').find(line => line.trim().endsWith(sessionSuffix));
        if (line) {
            return line.trim();
        }
    } catch (e) {
        // Ignore errors, return null
    }
    return null;
}

/**
 * Waits for an rdbg session socket to appear, polling at the specified interval.
 * @param sessionSuffix The session name or suffix to look for in the socket list
 * @param timeoutMs Maximum time to wait in milliseconds (default: 10000)
 * @param pollIntervalMs Polling interval in milliseconds (default: 250)
 * @returns The socket path if found, or null if not found within the timeout
 */
export async function waitForRdbgSessionAndGetSocket(sessionSuffix: string, timeoutMs: number = 10000, pollIntervalMs: number = 250): Promise<string | null> {
    // Debug: list initial rdbg sockets
    try {
        const { stdout: initialStdout } = await listRdbgSocks();
    } catch (e) {
        vscode.window.showErrorMessage('Error listing initial rdbg sockets');
    }
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const socket = await findRdbgSocketForSession(sessionSuffix);
        if (socket) {
            return socket;
        }
        await new Promise(res => setTimeout(res, pollIntervalMs));
    }
    return null;
}

/**
 * Cleans up and finds the rdbg socket path for a given session name, only cleaning the specific session.
 * @param sessionSuffix The session name or suffix to look for in the socket list
 * @returns The socket path if found after cleanup, or null if not found
 */
export async function cleanupAndFindRdbgSocketForSession(sessionSuffix: string): Promise<string | null> {
    const socket = await findRdbgSocketForSession(sessionSuffix);
    if (socket) {
        await checkAndCleanRdbgSocket(socket);
        // After cleaning, check again if the socket still exists
        return await findRdbgSocketForSession(sessionSuffix);
    }
    return null;
}