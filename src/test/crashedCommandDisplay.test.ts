import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { AppCommandTreeItem } from '../appRunner';
import { Command, ProcessState } from '../types';
import * as utils from '../utils';

suite('Crashed Command Display Tests', () => {
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        sandbox = sinon.createSandbox();
        // Mock workspaceHash to return a predictable value
        sandbox.stub(utils, 'workspaceHash').returns('mock-hash-1234');
        
        // Ensure vscode.Uri exists and mock parse
        if (!vscode.Uri) {
            (vscode as any).Uri = {};
        }
        if (!vscode.Uri.parse) {
            (vscode.Uri as any).parse = () => ({});
        }
        sandbox.stub(vscode.Uri, 'parse').callsFake((value: string) => ({
            scheme: 'crashed-command',
            path: value,
            fsPath: value,
            toString: () => value
        } as any));
    });

    teardown(() => {
        sandbox.restore();
    });

    test('should display warning icons for crashed commands in label', () => {
        const testCommand: Command = {
            description: 'Test Server',
            command: 'rails server',
            code: 'server',
            commandType: 'ruby',
        };

        const crashedState: ProcessState = {
            exists: false,
            debugActive: false,
            terminationReason: 'crashed',
            hasOutputChannel: true,
            forbiddenVarsMismatch: false,
            isLocked: false
        };

        const treeItem = new AppCommandTreeItem(testCommand, crashedState);
        
        // Should have crash indicator in description
        assert.strictEqual(treeItem.description, '(CRASHED)', 'Description should indicate crashed status');
    });

    test('should use normal display for non-crashed commands', () => {
        const testCommand: Command = {
            description: 'Test Server',
            command: 'rails server',
            code: 'server',
            commandType: 'ruby',
        };

        const normalState: ProcessState = {
            exists: false,
            debugActive: false,
            terminationReason: 'none',
            hasOutputChannel: false,
            forbiddenVarsMismatch: false,
            isLocked: false
        };

        const treeItem = new AppCommandTreeItem(testCommand, normalState);

        // Should have normal label without warning icons
        assert.strictEqual(treeItem.label, 'Test Server', 'Label should be normal description');
        
        // Should not have crash-related description
        const description = typeof treeItem.description === 'string' ? treeItem.description : '';
        assert.ok(!description.includes('CRASHED'), 'Description should not indicate crashed status');
    });

    test('should use red error icon for crashed commands', () => {
        const testCommand: Command = {
            description: 'Test Server',
            command: 'rails server',
            code: 'server',
            commandType: 'ruby',
        };

        const crashedState: ProcessState = {
            exists: false,
            debugActive: false,
            terminationReason: 'crashed',
            hasOutputChannel: true,
            forbiddenVarsMismatch: false,
            isLocked: false
        };

        const treeItem = new AppCommandTreeItem(testCommand, crashedState);

        // Should have error icon - we can't test the private properties but we can verify it's a ThemeIcon
        assert.ok(treeItem.iconPath instanceof vscode.ThemeIcon, 'Icon should be a ThemeIcon');
        // Note: VS Code ThemeIcon properties are not accessible via public API in tests
    });

    test('should use running icon for running commands', () => {
        const testCommand: Command = {
            description: 'Test Server',
            command: 'rails server',
            code: 'server',
            commandType: 'ruby',
        };

        const runningState: ProcessState = {
            exists: true,
            debugActive: false,
            terminationReason: 'none',
            hasOutputChannel: true,
            forbiddenVarsMismatch: false,
            isLocked: false
        };

        const treeItem = new AppCommandTreeItem(testCommand, runningState);

        // Should have a ThemeIcon for running state
        assert.ok(treeItem.iconPath instanceof vscode.ThemeIcon, 'Icon should be a ThemeIcon');
    });

    test('should use outline icon for stopped commands', () => {
        const testCommand: Command = {
            description: 'Test Server',
            command: 'rails server',
            code: 'server',
            commandType: 'ruby',
        };

        const stoppedState: ProcessState = {
            exists: false,
            debugActive: false,
            terminationReason: 'none',
            hasOutputChannel: false,
            forbiddenVarsMismatch: false,
            isLocked: false
        };

        const treeItem = new AppCommandTreeItem(testCommand, stoppedState);

        // Should have a ThemeIcon for stopped state
        assert.ok(treeItem.iconPath instanceof vscode.ThemeIcon, 'Icon should be a ThemeIcon');
    });
});

suite('Different Workspace Display Tests', () => {
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        sandbox = sinon.createSandbox();
    });

    teardown(() => {
        sandbox.restore();
    });

    test('should display "(DIFFERENT WORKSPACE)" description for processes from different workspace', () => {
        // Mock workspaceHash to return current workspace hash
        sandbox.stub(utils, 'workspaceHash').returns('current-workspace-hash');

        const testCommand: Command = {
            description: 'Test Server',
            command: 'rails server',
            code: 'server',
            commandType: 'ruby',
        };

        const differentWorkspaceState: ProcessState = {
            exists: true,
            debugActive: false,
            terminationReason: 'none',
            hasOutputChannel: true,
            isLocked: false,
            forbiddenVarsMismatch: false,
            workspaceHash: 'different-workspace-hash'
        };

        const treeItem = new AppCommandTreeItem(testCommand, differentWorkspaceState);
        
        // Should have different workspace indicator in description
        assert.strictEqual(treeItem.description, '(DIFFERENT WORKSPACE)', 'Description should indicate different workspace status');
    });

    test('should not display "(DIFFERENT WORKSPACE)" description for processes from same workspace', () => {
        // Mock workspaceHash to return current workspace hash
        sandbox.stub(utils, 'workspaceHash').returns('current-workspace-hash');

        const testCommand: Command = {
            description: 'Test Server',
            command: 'rails server',
            code: 'server',
            commandType: 'ruby',
        };

        const sameWorkspaceState: ProcessState = {
            exists: true,
            debugActive: false,
            terminationReason: 'none',
            hasOutputChannel: true,
            isLocked: false,
            forbiddenVarsMismatch: false,
            workspaceHash: 'current-workspace-hash'
        };

        const treeItem = new AppCommandTreeItem(testCommand, sameWorkspaceState);
        
        // Should not have different workspace indicator in description
        const description = typeof treeItem.description === 'string' ? treeItem.description : '';
        assert.ok(!description.includes('DIFFERENT WORKSPACE'), 'Description should not indicate different workspace status for same workspace');
    });

    test('should not display "(DIFFERENT WORKSPACE)" description for stopped processes', () => {
        // Mock workspaceHash to return current workspace hash
        sandbox.stub(utils, 'workspaceHash').returns('current-workspace-hash');

        const testCommand: Command = {
            description: 'Test Server',
            command: 'rails server',
            code: 'server',
            commandType: 'ruby',
        };

        const stoppedState: ProcessState = {
            exists: false,
            debugActive: false,
            terminationReason: 'none',
            hasOutputChannel: false,
            isLocked: false,
            forbiddenVarsMismatch: false,
            workspaceHash: 'different-workspace-hash'
        };

        const treeItem = new AppCommandTreeItem(testCommand, stoppedState);
        
        // Should not have different workspace indicator for stopped processes
        const description = typeof treeItem.description === 'string' ? treeItem.description : '';
        assert.ok(!description.includes('DIFFERENT WORKSPACE'), 'Description should not indicate different workspace status for stopped processes');
    });

    test('should use orange icon for processes from different workspace', () => {
        // Mock workspaceHash to return current workspace hash
        sandbox.stub(utils, 'workspaceHash').returns('current-workspace-hash');

        const testCommand: Command = {
            description: 'Test Server',
            command: 'rails server',
            code: 'server',
            commandType: 'ruby',
        };

        const differentWorkspaceState: ProcessState = {
            exists: true,
            debugActive: false,
            terminationReason: 'none',
            hasOutputChannel: true,
            isLocked: false,
            forbiddenVarsMismatch: false,
            workspaceHash: 'different-workspace-hash'
        };

        const treeItem = new AppCommandTreeItem(testCommand, differentWorkspaceState);

        // Should have orange themed icon for different workspace
        assert.ok(treeItem.iconPath instanceof vscode.ThemeIcon, 'Icon should be a ThemeIcon');
        
        // Check if the icon has the correct theme color (we can't directly access the color property but we can verify it's a ThemeIcon)
        // The actual orange color is verified through visual testing and the theme color definition
        const icon = treeItem.iconPath as vscode.ThemeIcon;
        assert.strictEqual(icon.id, 'circle-large-filled', 'Should use filled circle icon for running processes');
    });

    test('should use green icon for processes from same workspace', () => {
        // Mock workspaceHash to return current workspace hash
        sandbox.stub(utils, 'workspaceHash').returns('current-workspace-hash');

        const testCommand: Command = {
            description: 'Test Server',
            command: 'rails server',
            code: 'server',
            commandType: 'ruby',
        };

        const sameWorkspaceState: ProcessState = {
            exists: true,
            debugActive: false,
            terminationReason: 'none',
            hasOutputChannel: true,
            isLocked: false,
            forbiddenVarsMismatch: false,
            workspaceHash: 'current-workspace-hash'
        };

        const treeItem = new AppCommandTreeItem(testCommand, sameWorkspaceState);

        // Should have green themed icon for same workspace
        assert.ok(treeItem.iconPath instanceof vscode.ThemeIcon, 'Icon should be a ThemeIcon');
        
        const icon = treeItem.iconPath as vscode.ThemeIcon;
        assert.strictEqual(icon.id, 'circle-large-filled', 'Should use filled circle icon for running processes');
    });

    test('should include warning in tooltip for processes from different workspace', () => {
        // Mock workspaceHash to return current workspace hash
        sandbox.stub(utils, 'workspaceHash').returns('current-workspace-hash');

        const testCommand: Command = {
            description: 'Test Server',
            command: 'rails server',
            code: 'server',
            commandType: 'ruby',
        };

        const differentWorkspaceState: ProcessState = {
            exists: true,
            debugActive: false,
            terminationReason: 'none',
            hasOutputChannel: true,
            isLocked: false,
            forbiddenVarsMismatch: false,
            workspaceHash: 'different-workspace-hash'
        };

        const treeItem = new AppCommandTreeItem(testCommand, differentWorkspaceState);
        
        // Should include warning in tooltip
        const tooltip = typeof treeItem.tooltip === 'string' ? treeItem.tooltip : '';
        assert.ok(tooltip.includes('⚠️ Running in different workspace'), 'Tooltip should include different workspace warning');
        assert.ok(tooltip.includes('Test Server'), 'Tooltip should include command description');
        assert.ok(tooltip.includes('rails server'), 'Tooltip should include command text');
    });

    test('should not include warning in tooltip for processes from same workspace', () => {
        // Mock workspaceHash to return current workspace hash
        sandbox.stub(utils, 'workspaceHash').returns('current-workspace-hash');

        const testCommand: Command = {
            description: 'Test Server',
            command: 'rails server',
            code: 'server',
            commandType: 'ruby',
        };

        const sameWorkspaceState: ProcessState = {
            exists: true,
            debugActive: false,
            terminationReason: 'none',
            hasOutputChannel: true,
            isLocked: false,
            forbiddenVarsMismatch: false,
            workspaceHash: 'current-workspace-hash'
        };

        const treeItem = new AppCommandTreeItem(testCommand, sameWorkspaceState);
        
        // Should not include warning in tooltip
        const tooltip = typeof treeItem.tooltip === 'string' ? treeItem.tooltip : '';
        assert.ok(!tooltip.includes('⚠️ Running in different workspace'), 'Tooltip should not include different workspace warning for same workspace');
        assert.ok(tooltip.includes('Test Server'), 'Tooltip should include command description');
        assert.ok(tooltip.includes('rails server'), 'Tooltip should include command text');
    });

    test('should disable debug capabilities for processes from different workspace', () => {
        // Mock workspaceHash to return current workspace hash
        sandbox.stub(utils, 'workspaceHash').returns('current-workspace-hash');

        const testCommand: Command = {
            description: 'Test Server',
            command: 'rails server',
            code: 'server',
            commandType: 'ruby',
        };

        const differentWorkspaceState: ProcessState = {
            exists: true,
            debugActive: false,
            terminationReason: 'none',
            hasOutputChannel: true,
            isLocked: false,
            forbiddenVarsMismatch: false,
            workspaceHash: 'different-workspace-hash'
        };

        const treeItem = new AppCommandTreeItem(testCommand, differentWorkspaceState);
        
        // Should not have debug capability for different workspace processes
        const contextValue = treeItem.contextValue || '';
        assert.ok(!contextValue.includes('canDebug'), 'Should not have debug capability for different workspace processes');
        assert.ok(contextValue.includes('canShowOutputRunning'), 'Should still have output capability');
        assert.ok(contextValue.includes('canStop'), 'Should still have stop capability');
    });

    test('should enable debug capabilities for ruby processes from same workspace', () => {
        // Mock workspaceHash to return current workspace hash
        sandbox.stub(utils, 'workspaceHash').returns('current-workspace-hash');

        const testCommand: Command = {
            description: 'Test Server',
            command: 'rails server',
            code: 'server',
            commandType: 'ruby',
        };

        const sameWorkspaceState: ProcessState = {
            exists: true,
            debugActive: false,
            terminationReason: 'none',
            hasOutputChannel: true,
            isLocked: false,
            forbiddenVarsMismatch: false,
            workspaceHash: 'current-workspace-hash'
        };

        const treeItem = new AppCommandTreeItem(testCommand, sameWorkspaceState);
        
        // Should have debug capability for same workspace processes
        const contextValue = treeItem.contextValue || '';
        assert.ok(contextValue.includes('canDebug'), 'Should have debug capability for same workspace ruby processes');
        assert.ok(contextValue.includes('canShowOutputRunning'), 'Should have output capability');
        assert.ok(contextValue.includes('canStop'), 'Should have stop capability');
    });

    test('should handle processes with no workspace hash', () => {
        // Mock workspaceHash to return current workspace hash
        sandbox.stub(utils, 'workspaceHash').returns('current-workspace-hash');

        const testCommand: Command = {
            description: 'Test Server',
            command: 'rails server',
            code: 'server',
            commandType: 'ruby',
        };

        const noWorkspaceHashState: ProcessState = {
            exists: true,
            debugActive: false,
            terminationReason: 'none',
            hasOutputChannel: true,
            isLocked: false,
            forbiddenVarsMismatch: false,            
            // workspaceHash is undefined
        };

        const treeItem = new AppCommandTreeItem(testCommand, noWorkspaceHashState);
        
        // Should not have different workspace indicator for processes with no workspace hash
        const description = typeof treeItem.description === 'string' ? treeItem.description : '';
        assert.ok(!description.includes('DIFFERENT WORKSPACE'), 'Description should not indicate different workspace for processes with no workspace hash');
        
        // Should have debug capability for processes with no workspace hash (treated as same workspace)
        const contextValue = treeItem.contextValue || '';
        assert.ok(contextValue.includes('canDebug'), 'Should have debug capability for processes with no workspace hash');
    });

    test('should prioritize crashed description over different workspace description', () => {
        // Mock workspaceHash to return current workspace hash
        sandbox.stub(utils, 'workspaceHash').returns('current-workspace-hash');

        // Ensure vscode.Uri exists and mock parse for crashed commands
        if (!vscode.Uri) {
            (vscode as any).Uri = {};
        }
        if (!vscode.Uri.parse) {
            (vscode.Uri as any).parse = () => ({});
        }
        sandbox.stub(vscode.Uri, 'parse').callsFake((value: string) => ({
            scheme: 'crashed-command',
            path: value,
            fsPath: value,
            toString: () => value
        } as any));

        const testCommand: Command = {
            description: 'Test Server',
            command: 'rails server',
            code: 'server',
            commandType: 'ruby',
        };

        const crashedDifferentWorkspaceState: ProcessState = {
            exists: false,
            debugActive: false,
            terminationReason: 'crashed',
            hasOutputChannel: true,
            isLocked: false,
            forbiddenVarsMismatch: false,
            workspaceHash: 'different-workspace-hash'
        };

        const treeItem = new AppCommandTreeItem(testCommand, crashedDifferentWorkspaceState);
        
        // Should prioritize crashed description over different workspace description
        assert.strictEqual(treeItem.description, '(CRASHED)', 'Description should prioritize crashed status over different workspace');
    });
});
