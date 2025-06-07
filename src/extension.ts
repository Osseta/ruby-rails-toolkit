import { activate as activateRspecRunner, deactivate as deactivateRspecRunner } from './rspecRunner';
import { AppRunnerTreeDataProvider, registerAppRunnerTreeView } from './appRunner';
import { FileLockManager } from './fileLockManager';

export function activate(context: import('vscode').ExtensionContext) {
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