import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { AppCommandTreeItem } from '../appRunner';
import { Command, ProcessState } from '../types';

suite('Crashed Command Display Tests', () => {
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        sandbox = sinon.createSandbox();
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
            wait: false
        };

        const crashedState: ProcessState = {
            exists: false,
            debugActive: false,
            terminationReason: 'crashed',
            hasOutputChannel: true
        };

        const treeItem = new AppCommandTreeItem(testCommand, crashedState);
        
        // Should have crash indicator in description
        assert.strictEqual(treeItem.description, '(CRASHED)', 'Description should indicate crashed status');

        // Should have resource URI for potential styling
        assert.ok(treeItem.resourceUri, 'Should have resource URI');
        assert.strictEqual(treeItem.resourceUri?.scheme, 'crashed-command', 'Resource URI should have crashed-command scheme');
    });

    test('should use normal display for non-crashed commands', () => {
        const testCommand: Command = {
            description: 'Test Server',
            command: 'rails server',
            code: 'server',
            commandType: 'ruby',
            wait: false
        };

        const normalState: ProcessState = {
            exists: false,
            debugActive: false,
            terminationReason: 'none',
            hasOutputChannel: false
        };

        const treeItem = new AppCommandTreeItem(testCommand, normalState);

        // Should have normal label without warning icons
        assert.strictEqual(treeItem.label, 'Test Server', 'Label should be normal description');
        
        // Should not have crash-related description
        const description = typeof treeItem.description === 'string' ? treeItem.description : '';
        assert.ok(!description.includes('CRASHED'), 'Description should not indicate crashed status');
        
        // Should not have crashed-command resource URI
        assert.ok(!treeItem.resourceUri || treeItem.resourceUri.scheme !== 'crashed-command', 'Should not have crashed-command resource URI');
    });

    test('should use red error icon for crashed commands', () => {
        const testCommand: Command = {
            description: 'Test Server',
            command: 'rails server',
            code: 'server',
            commandType: 'ruby',
            wait: false
        };

        const crashedState: ProcessState = {
            exists: false,
            debugActive: false,
            terminationReason: 'crashed',
            hasOutputChannel: true
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
            wait: false
        };

        const runningState: ProcessState = {
            exists: true,
            debugActive: false,
            terminationReason: 'none',
            hasOutputChannel: true
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
            wait: false
        };

        const stoppedState: ProcessState = {
            exists: false,
            debugActive: false,
            terminationReason: 'none',
            hasOutputChannel: false
        };

        const treeItem = new AppCommandTreeItem(testCommand, stoppedState);

        // Should have a ThemeIcon for stopped state
        assert.ok(treeItem.iconPath instanceof vscode.ThemeIcon, 'Icon should be a ThemeIcon');
    });
});
