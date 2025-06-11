import * as vscode from 'vscode';

/**
 * Wrapper class for VS Code API calls used specifically in extension.ts
 * This allows for easier testing by providing a mockable interface
 */
export class ExtensionVscodeWrapper {
    /**
     * Gets workspace configuration
     */
    getConfiguration(section?: string, scope?: vscode.ConfigurationScope): vscode.WorkspaceConfiguration {
        return vscode.workspace.getConfiguration(section, scope);
    }

    /**
     * Registers a configuration change listener
     */
    onDidChangeConfiguration(listener: (e: vscode.ConfigurationChangeEvent) => any): vscode.Disposable {
        return vscode.workspace.onDidChangeConfiguration(listener);
    }

    /**
     * Shows an information message with optional actions
     */
    async showInformationMessage(message: string, ...items: string[]): Promise<string | undefined> {
        return vscode.window.showInformationMessage(message, ...items);
    }

    /**
     * Executes a VS Code command
     */
    async executeCommand(command: string, ...rest: any[]): Promise<any> {
        return vscode.commands.executeCommand(command, ...rest);
    }

    /**
     * Gets the ConfigurationTarget enum
     */
    get ConfigurationTarget(): typeof vscode.ConfigurationTarget {
        return vscode.ConfigurationTarget;
    }
}

// Default instance for production use
export const defaultExtensionVscodeWrapper = new ExtensionVscodeWrapper();
