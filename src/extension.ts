import { activate as activateRspecRunner, deactivate as deactivateRspecRunner } from './rspecRunner';
import { AppRunnerTreeDataProvider, registerAppRunnerTreeView } from './appRunner';
import { FileLockManager } from './fileLockManager';
import { ProcessTracker } from './processTracker';

export function activate(context: import('vscode').ExtensionContext) {
    // Initialize ProcessTracker with extension context for user-specific directories
    ProcessTracker.initialize(context);
    
    activateRspecRunner(context);
    registerAppRunnerTreeView(context);
}

export function deactivate() {
    deactivateRspecRunner();
    // Clean up any file locks owned by this process
    FileLockManager.cleanup();
}

// Needed for tests to pass, really not sure why
export { isSpecLine } from './rspecRunner';
export { workspaceHash } from './utils';