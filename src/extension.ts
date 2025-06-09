import * as vscode from 'vscode';
import { activate as activateRspecRunner, deactivate as deactivateRspecRunner } from './rspecRunner';
import { AppRunnerTreeDataProvider, registerAppRunnerTreeView } from './appRunner';
import { FileLockManager } from './fileLockManager';
import { ProcessTracker } from './processTracker';

/**
 * Applies token color customizations to hide ANSI punctuation definition elements
 * This approach works for output channels with 'ansi-colors' language identifier
 */
function applyAnsiPunctuationHiding() {
    const config = vscode.workspace.getConfiguration('rubyToolkit');
    const hideAnsiPunctuation = config.get<boolean>('hideAnsiPunctuation', true);
    
    if (!hideAnsiPunctuation) {
        return;
    }

    // Comprehensive list of ANSI-related scopes including escape characters
    const ansiScopes = [
        // Existing punctuation scopes
        'punctuation.definition.ansi.codes.bold.cyan',
        'punctuation.definition.ansi.codes.bold.blue',
        'punctuation.definition.ansi.codes.bold.red',
        'punctuation.definition.ansi.codes.bold.green',
        'punctuation.definition.ansi.codes.bold.yellow',
        'punctuation.definition.ansi.codes.bold.magenta',
        'punctuation.definition.ansi.codes.bold.white',
        'punctuation.definition.ansi.codes.cyan',
        'punctuation.definition.ansi.codes.blue',
        'punctuation.definition.ansi.codes.red',
        'punctuation.definition.ansi.codes.green',
        'punctuation.definition.ansi.codes.yellow',
        'punctuation.definition.ansi.codes.magenta',
        'punctuation.definition.ansi.codes.white',
        'punctuation.definition.ansi.codes.bold',
        'punctuation.definition.ansi.codes.reset',
        'punctuation.definition.ansi.codes.escape.bold.cyan',
        'punctuation.definition.ansi.codes.escape.bold.blue',
        'punctuation.definition.ansi.codes.escape.bold.red',
        'punctuation.definition.ansi.codes.escape.bold.green',
        'punctuation.definition.ansi.codes.escape.bold.yellow',
        'punctuation.definition.ansi.codes.escape.bold.magenta',
        'punctuation.definition.ansi.codes.escape.bold.white',
        'punctuation.definition.ansi.codes.escape.cyan',
        'punctuation.definition.ansi.codes.escape.blue',
        'punctuation.definition.ansi.codes.escape.red',
        'punctuation.definition.ansi.codes.escape.green',
        'punctuation.definition.ansi.codes.escape.yellow',
        'punctuation.definition.ansi.codes.escape.magenta',
        'punctuation.definition.ansi.codes.escape.white',
        'punctuation.definition.ansi.codes.escape.bold',
        'punctuation.definition.ansi.codes.escape.reset',
        'punctuation.definition.ansi.codes.other',
        'punctuation.definition.ansi.codes.escape.other',
        // Add escape character specific scopes for output channels
        'constant.character.escape.ansi'
    ];

    // Get current token color customizations
    const editorConfig = vscode.workspace.getConfiguration('editor');
    const currentCustomizations = editorConfig.get<any>('tokenColorCustomizations') || {};
    const currentRules = currentCustomizations.textMateRules || [];

    // Remove any existing rules for ANSI scopes
    const filteredRules = currentRules.filter((rule: any) => {
        if (!rule.scope) {
            return true;
        }
        const scopes = Array.isArray(rule.scope) ? rule.scope : [rule.scope];
        return !scopes.some((scope: string) => ansiScopes.includes(scope));
    });

    // Add comprehensive rule to hide all ANSI-related elements
    filteredRules.push({
        scope: ansiScopes,
        settings: {
            foreground: '#00000000'  // Transparent color
        }
    });

    // Update the configuration
    const newCustomizations = {
        ...currentCustomizations,
        textMateRules: filteredRules
    };

    editorConfig.update('tokenColorCustomizations', newCustomizations, vscode.ConfigurationTarget.Global);
}



/**
 * Applies global configuration for ANSI output channels to hide control characters
 * This ensures RSpec/Rails output channels don't show red escape character icons
 */
function applyOutputChannelConfiguration() {
    const config = vscode.workspace.getConfiguration('rubyToolkit');
    const hideAnsiPunctuation = config.get<boolean>('hideAnsiPunctuation', true);
    
    if (!hideAnsiPunctuation) {
        return;
    }

    // Apply configuration defaults for ansi-colors language (used by ProcessTracker output channels)
    const editorConfig = vscode.workspace.getConfiguration('editor');
    
    // Get existing language-specific settings
    const existingSettings = editorConfig.get<any>('languageSpecific') || {};
    
    // Ensure ansi-colors language has control character rendering disabled
    const ansiColorsSettings = {
        ...existingSettings['[ansi-colors]'],
        'editor.renderControlCharacters': false,
        'editor.renderWhitespace': 'none'
    };
    
    const updatedSettings = {
        ...existingSettings,
        '[ansi-colors]': ansiColorsSettings
    };
    
    // Update global configuration for immediate effect on output channels
    editorConfig.update('languageSpecific', updatedSettings, vscode.ConfigurationTarget.Global);
}

export function activate(context: import('vscode').ExtensionContext) {
    // Initialize ProcessTracker with extension context for user-specific directories
    ProcessTracker.initialize(context);
    
    activateRspecRunner(context);
    registerAppRunnerTreeView(context);
    
    // Apply comprehensive ANSI hiding for output channels
    applyAnsiPunctuationHiding();
    applyOutputChannelConfiguration();
    
    // Watch for configuration changes
    const configWatcher = vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('rubyToolkit.hideAnsiPunctuation')) {
            applyAnsiPunctuationHiding();
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