import * as vscode from 'vscode';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { waitForRdbgSessionAndGetSocket } from './rdbgSockets';
import { getOrCreateTerminal } from './utils';
import { listRdbgSocks } from './utils';

// Utility: determine if a line is a spec/test line
/**
 * Determines if a line of Ruby code is a spec/test line (e.g., it, describe, scenario).
 * @param line The line of code to check.
 * @returns True if the line is a spec/test line, false otherwise.
 */
export function isSpecLine(line: string): boolean {
    const trimmed = line.trim();
    return (
        trimmed.startsWith('it ') ||
        trimmed.startsWith('describe ') ||
        trimmed.startsWith('RSpec.describe') ||
        trimmed.startsWith('scenario ') ||
        trimmed.startsWith('context ') ||
        trimmed.startsWith('feature ') ||
        trimmed.startsWith('shared_examples ')
    );
}

// Generic CodeLensProvider for spec lines
/**
 * Provides CodeLenses for spec lines in Ruby spec files, enabling run/debug actions.
 */
class SpecCodeLensProvider implements vscode.CodeLensProvider {
    private commandId: string;
    private title: string;
    private tooltip: string;

    constructor(commandId: string, title: string, tooltip: string) {
        this.commandId = commandId;
        this.title = title;
        this.tooltip = tooltip;
    }

    /**
     * Scans the document for spec lines and returns CodeLenses for each.
     * @param document The text document to scan.
     * @param _token Cancellation token (unused).
     * @returns An array of CodeLenses for spec lines.
     */
    provideCodeLenses(document: vscode.TextDocument, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.CodeLens[]> {
        if (!document.fileName.endsWith('_spec.rb')) {
            return [];
        }
        const codeLenses: vscode.CodeLens[] = [];
        const text = document.getText();
        const lines = text.split('\n');
        for (let i = 0; i < lines.length; i++) {
            if (isSpecLine(lines[i])) {
                const range = new vscode.Range(i, 0, i, lines[i].length);
                const command: vscode.Command = {
                    title: this.title,
                    command: this.commandId,
                    tooltip: this.tooltip,
                    arguments: [document.uri, range.start.line]
                };
                codeLenses.push(new vscode.CodeLens(range, command));
            }
        }
        return codeLenses;
    }
}

let rspecTerminal: vscode.Terminal | undefined;

/**
 * Activates the RSpec Runner extension, registering CodeLens providers and commands.
 * @param context The VS Code extension context.
 */
export function activate(context: vscode.ExtensionContext) {
    const debugCodeLensProvider = new SpecCodeLensProvider(
        'rspec-runner.debugRubySpec',
        '$(debug-alt)\u00A0Debug',
        'Debug this spec'
    );
    const runCodeLensProvider = new SpecCodeLensProvider(
        'rspec-runner.runRubySpec',
        '$(run)\u00A0Run',
        'Run this spec (headless)'
    );
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider({ language: 'ruby', pattern: '**/*_spec.rb' }, debugCodeLensProvider)
    );
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider({ language: 'ruby', pattern: '**/*_spec.rb' }, runCodeLensProvider)
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('rspec-runner.debugRubySpec', debugRubySpec)
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('rspec-runner.debugEntireRubySpec', () => {
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document.fileName.endsWith('_spec.rb')) {
                debugRubySpec(editor.document.uri, 0);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('rspec-runner.runRubySpec', runRubySpec)
    );
}

/**
 * Launches rdbg in a terminal and attaches the VS Code debugger to a specific spec file/line.
 * @param uri The URI of the spec file.
 * @param line The line number to debug (0 for the whole file).
 */
// Remove all usage of launchRdbgInTerminal and startRdbgDebugger, and replace with direct rdbg invocation and VS Code debug attach logic using ProcessTracker approach.

async function debugRubySpec(uri: vscode.Uri, line: number) {
    const fullPath = uri.fsPath;
    const specIndex = fullPath.indexOf('spec/');
    let relativePath: string;
    if (specIndex !== -1) {
        relativePath = fullPath.substring(specIndex);
    } else {
        relativePath = path.basename(fullPath);
    }
    if (!rspecTerminal) {
        rspecTerminal = await getOrCreateTerminal('RSpec Runner');
    }
    // Build the rspec command with file and line
    const command = line === 0
        ? `bundle exec rspec ${relativePath}`
        : `bundle exec rspec ${relativePath}:${line + 1}`;
    // Start rdbg in the terminal
    const rdbgCmd = `bundle exec rdbg --open --session-name=_RSPEC --command -- ${command}`;
    rspecTerminal.sendText(rdbgCmd);
    // Wait for the rdbg socket to appear
    const pid = await new Promise<number>((resolve) => {
        rspecTerminal!.processId.then(pid => resolve(pid!));
    });

    // Attempt to find the rdbg socket for this SESSION using listRdbgSocks
    // Retry for up to 5 seconds before giving up
    const maxRetries = 10; // 5 seconds with 500ms intervals
    const retryInterval = 500; // 500ms
    let socketFile: string | undefined;
    let lastSocksResult: any;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const socksResult = await listRdbgSocks();
            lastSocksResult = socksResult;
            const lines = socksResult.stdout.split('\n').filter(Boolean);
            socketFile = lines.find((line: string) => line.includes(`-_RSPEC`));
            
            if (socketFile) {
                break; // Found the socket, exit the retry loop
            }
            
            // Wait before the next attempt (except on the last attempt)
            if (attempt < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, retryInterval));
            }
        } catch (error) {
            // If this is the last attempt, let the error propagate
            if (attempt === maxRetries - 1) {
                throw error;
            }
            // Otherwise, wait and try again
            await new Promise(resolve => setTimeout(resolve, retryInterval));
        }
    }

    if (!socketFile) {
        throw new Error(`No rdbg socket found for _RSPEC session\nAvailable sockets:\n${lastSocksResult}`);
    }
    // Start VS Code debugger and attach to rdbg, passing socketPath as debugPort
    await vscode.debug.startDebugging(undefined, {
        type: 'rdbg',
        name: `Attach to rdbg (RSpec)`,
        request: 'attach',
        debugPort: socketFile,
        autoAttach: true,
        cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd(),
    });
}

/**
 * Runs a spec file or a specific line in headless mode (no debugger attached).
 * @param uri The URI of the spec file.
 * @param line The line number to run (0 for the whole file).
 */
async function runRubySpec(uri: vscode.Uri, line: number) {
    const fullPath = uri.fsPath;
    const specIndex = fullPath.indexOf('spec/');
    let relativePath: string;
    if (specIndex !== -1) {
        relativePath = fullPath.substring(specIndex);
    } else {
        relativePath = path.basename(fullPath);
    }
    if (!rspecTerminal) {
        rspecTerminal = await getOrCreateTerminal('RSpec Runner');
    }
    const baseCommand = `HEADLESS=1 bundle exec rspec`;
    const rspecCommand = line === 0
        ? `${baseCommand} ${relativePath}`
        : `${baseCommand} ${relativePath}:${line + 1}`;
    rspecTerminal.sendText(rspecCommand);
}

/**
 * Deactivates the RSpec Runner extension (no-op).
 */
export function deactivate() {}

// Export for testing
export { SpecCodeLensProvider };