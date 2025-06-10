import * as vscode from 'vscode';
import { activate as activateRspecRunner, deactivate as deactivateRspecRunner } from './rspecRunner';
import { AppRunnerTreeDataProvider, registerAppRunnerTreeView } from './appRunner';
import { FileLockManager } from './fileLockManager';
import { ProcessTracker } from './processTracker';

/**
 * Applies global configuration for output channels to hide control characters
 * This ensures RSpec/Rails output channels don't show red escape character icons
 */
function applyOutputChannelConfiguration() {
    const config = vscode.workspace.getConfiguration('rubyToolkit');
    const hideAnsiPunctuation = config.get<boolean>('hideAnsiPunctuation', true);
    const editorConfig = vscode.workspace.getConfiguration("", { languageId: "Log" });
    editorConfig.update("editor.renderControlCharacters", !hideAnsiPunctuation,  vscode.ConfigurationTarget.Global, true);
}

export function activate(context: import('vscode').ExtensionContext) {
    // Initialize ProcessTracker with extension context for user-specific directories
    ProcessTracker.initialize(context);
    
    activateRspecRunner(context);
    registerAppRunnerTreeView(context);
    
    applyOutputChannelConfiguration();
    
    // Watch for configuration changes
    const configWatcher = vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('rubyToolkit.hideAnsiPunctuation')) {
            applyOutputChannelConfiguration();
        }
    });
    
    context.subscriptions.push(configWatcher);
}

export function deactivate() {
    deactivateRspecRunner();
    // Clean up any file locks owned by this process
    FileLockManager.cleanup();
}

// Needed for tests to pass, really not sure why
export { isSpecLine } from './rspecRunner';
export { workspaceHash } from './utils';