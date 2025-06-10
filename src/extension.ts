import * as vscode from 'vscode';
import { activate as activateRspecRunner, deactivate as deactivateRspecRunner } from './rspecRunner';
import { AppRunnerTreeDataProvider, registerAppRunnerTreeView } from './appRunner';
import { FileLockManager } from './fileLockManager';
import { ProcessTracker } from './processTracker';
import { getLogger, LogLevel } from './logger';

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
    // Initialize logger
    const logger = getLogger();
    logger.info('Activating Ruby & Rails Toolkit extension');
    
    // Initialize ProcessTracker with extension context for user-specific directories
    ProcessTracker.initialize(context);
    logger.debug('ProcessTracker initialized');
    
    activateRspecRunner(context);
    logger.debug('RSpec Runner activated');
    
    registerAppRunnerTreeView(context);
    logger.debug('App Runner TreeView registered');
    
    applyOutputChannelConfiguration();
    logger.debug('Output channel configuration applied');
    
    // Watch for configuration changes
    const configWatcher = vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('rubyToolkit.hideAnsiPunctuation')) {
            applyOutputChannelConfiguration();
            logger.debug('Output channel configuration updated');
        }
    });
    
    context.subscriptions.push(configWatcher);
    logger.info('Ruby & Rails Toolkit extension activated successfully');
}

export function deactivate() {
    getLogger().info('Deactivating Ruby & Rails Toolkit extension');
    
    deactivateRspecRunner();
    // Clean up any file locks owned by this process
    FileLockManager.cleanup();
    
    // Dispose of the logger
    getLogger().dispose();
}

// Needed for tests to pass, really not sure why
export { isSpecLine } from './rspecRunner';
export { workspaceHash } from './utils';