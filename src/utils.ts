import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';
import { RdbgSocketPath } from './types';
import * as fs from 'fs';
import * as util from 'util';

const execAsync = promisify(exec);

export function workspaceHash(): string {
    const folder = vscode.workspace.workspaceFolders?.[0];
    const folderUri = folder?.uri.toString() || '';
    return crypto.createHash('sha256').update(folderUri).digest('hex').slice(0, 8);
}

/**
 * Gets or creates a named terminal. If the terminal does not exist, it is created and shown.
 * Waits for the terminal to be ready before returning it.
 * @param name The name of the terminal
 * @returns Promise<vscode.Terminal>
 */
export async function getOrCreateTerminal(name: string): Promise<vscode.Terminal> {
    // Try to find an existing terminal with the given name
    let terminal = vscode.window.terminals.find(t => t.name === name);
    if (!terminal) {
      terminal = vscode.window.createTerminal(name);
      terminal.show();
      await new Promise(resolve => setTimeout(resolve, 3000));

      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (workspaceFolder) {
        terminal.sendText(`cd "${workspaceFolder.uri.fsPath}"`);
      }
    } else {
      // If the terminal already exists, just show it
      terminal.show();
    }
    return terminal;
}

/**
 * Lists all rdbg socket files using the rdbg utility.
 * @returns An object with a stdout property containing the list of sockets.
 */
export async function listRdbgSocks(): Promise<{ stdout: string }> {
    return await execAsync('rdbg --util=list-socks');
}

/**
 * Returns the output of lsof -t for a given socket file.
 * @param socket The socket file path
 * @returns The stdout from lsof -t <socket>
 */
export async function getLsofOutputForSocket(socket: RdbgSocketPath): Promise<string> {
    const { stdout } = await execAsync(`lsof -t ${socket}`);
    return stdout;
}

/**
 * Unlinks (deletes) a socket file asynchronously.
 * @param socket The socket file path
 */
export async function unlinkSocket(socket: RdbgSocketPath): Promise<void> {
    if (socket === null) { return; }
    const unlinkAsync = util.promisify(fs.unlink);
    await unlinkAsync(socket);
}

/**
 * Extracts the PID from an rdbg socket path.
 * @param socketPath The rdbg socket path
 * @returns The PID as a number
 * @throws If the PID cannot be extracted
 */
export function extractPidFromRdbgSocketPath(socketPath: string): number {
    const match = socketPath.match(/rdbg-(\d+)-/);
    if (match && match[1]) {
        return parseInt(match[1], 10);
    }
    throw new Error('Could not extract PID from rdbg socket path');
}

