import * as vscode from 'vscode';
import { activate as activateRspecRunner, deactivate as deactivateRspecRunner } from './rspecRunner';
import { AppRunnerTreeDataProvider, registerAppRunnerTreeView } from './appRunner';
import { FileLockManager } from './fileLockManager';
import { ProcessTracker } from './processTracker';
import { getLogger, LogLevel } from './logger';
import { ExtensionVscodeWrapper, defaultExtensionVscodeWrapper } from './extensionVscodeWrapper';

/**
 * Applies global configuration for output channels to hide control characters
 * This ensures RSpec/Rails output channels don't show red escape character icons
 */
function applyOutputChannelConfiguration(vscodeWrapper: ExtensionVscodeWrapper = defaultExtensionVscodeWrapper) {
    const config = vscodeWrapper.getConfiguration('rubyToolkit');
    const hideAnsiPunctuation = config.get<boolean>('hideAnsiPunctuation', true);
    const editorConfig = vscodeWrapper.getConfiguration("", { languageId: "Log" });
    editorConfig.update("editor.renderControlCharacters", !hideAnsiPunctuation, vscodeWrapper.ConfigurationTarget.Global, true);
}

export function activate(context: import('vscode').ExtensionContext, vscodeWrapper: ExtensionVscodeWrapper = defaultExtensionVscodeWrapper) {
    // Initialize logger
    const logger = getLogger();
    logger.info('Activating Ruby & Rails Toolkit extension');
    
    // Initialize ProcessTracker with extension context for user-specific directories
    ProcessTracker.initialize(context);
    logger.debug('ProcessTracker initialized');
    
    // Check if RSpec integration is disabled
    const config = vscodeWrapper.getConfiguration('rubyToolkit');
    const disableRspecIntegration = config.get<boolean>('disableRspecIntegration', true);

    if (!disableRspecIntegration) {
        activateRspecRunner(context);
        logger.debug('RSpec Runner activated');
    } else {
        logger.debug('RSpec integration disabled by configuration');
    }
    
    registerAppRunnerTreeView(context);
    logger.debug('App Runner TreeView registered');
    
    applyOutputChannelConfiguration(vscodeWrapper);
    logger.debug('Output channel configuration applied');
    
    // Watch for configuration changes
    const configWatcher = vscodeWrapper.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('rubyToolkit.hideAnsiPunctuation')) {
            applyOutputChannelConfiguration(vscodeWrapper);
            logger.debug('Output channel configuration updated');
        }
        
        if (event.affectsConfiguration('rubyToolkit.disableRspecIntegration')) {
            vscodeWrapper.showInformationMessage(
                'RSpec integration setting changed. Please reload the window for changes to take effect.',
                'Reload Window'
            ).then(selection => {
                if (selection === 'Reload Window') {
                    vscodeWrapper.executeCommand('workbench.action.reloadWindow');
                }
            });
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