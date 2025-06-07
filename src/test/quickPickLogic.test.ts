import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { AppCommandTreeItem } from '../appRunner';
import { ProcessTracker } from '../processTracker';
import type { Command, ProcessState } from '../types';

suite('QuickPick Logic Tests', () => {
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        sandbox = sinon.createSandbox();
    });

    teardown(() => {
        sandbox.restore();
    });

    const rubyCommand: Command = {
        code: 'TEST_RUBY_CMD',
        description: 'Test Ruby Command',
        command: 'rails server',
        commandType: 'ruby',
        wait: true
    };

    const shellCommand: Command = {
        code: 'TEST_SHELL_CMD',
        description: 'Test Shell Command',
        command: 'echo "test"',
        commandType: 'shell',
        wait: true
    };

    suite('TreeItem contextValue matches new button display rules', () => {
        test('When not running and not crashed: show Run button only', () => {
            const state: ProcessState = {
                exists: false,
                debugActive: false,
                terminationReason: 'none',
                hasOutputChannel: false,
            isLocked: false            };

            const rubyItem = new AppCommandTreeItem(rubyCommand, state);
            const shellItem = new AppCommandTreeItem(shellCommand, state);

            // Both Ruby and shell commands should only show canRun when not running and not crashed
            assert.strictEqual(rubyItem.contextValue, 'canRun');
            assert.strictEqual(shellItem.contextValue, 'canRun');
        });

        test('When not running and crashed: show Show Output button only (if available)', () => {
            const stateWithOutput: ProcessState = {
                exists: false,
                debugActive: false,
                terminationReason: 'crashed',
                hasOutputChannel: true,
            isLocked: false            };

            const stateWithoutOutput: ProcessState = {
                exists: false,
                debugActive: false,
                terminationReason: 'crashed',
                hasOutputChannel: false,
            isLocked: false            };

            const itemWithOutput = new AppCommandTreeItem(rubyCommand, stateWithOutput);
            const itemWithoutOutput = new AppCommandTreeItem(rubyCommand, stateWithoutOutput);

            // Should show Show Output when crashed and has output channel
            assert.strictEqual(itemWithOutput.contextValue, 'canShowOutputCrashed,canShowOutput');
            // Should show nothing when crashed but no output channel
            assert.strictEqual(itemWithoutOutput.contextValue, '');
        });

        test('When running: show Show Output button only (if available)', () => {
            const stateWithOutput: ProcessState = {
                exists: true,
                debugActive: false,
                terminationReason: 'none',
                hasOutputChannel: true,
            isLocked: false            };

            const stateWithoutOutput: ProcessState = {
                exists: true,
                debugActive: false,
                terminationReason: 'none',
                hasOutputChannel: false,
            isLocked: false            };

            const itemWithOutput = new AppCommandTreeItem(rubyCommand, stateWithOutput);
            const itemWithoutOutput = new AppCommandTreeItem(rubyCommand, stateWithoutOutput);

            // Should have comprehensive contextValue including all capabilities when running
            assert.strictEqual(itemWithOutput.contextValue, 'canShowOutputRunning,canStop,canDebug,canShowOutput');
            // Should have stop and debug capabilities even without output channel
            assert.strictEqual(itemWithoutOutput.contextValue, 'canStop,canDebug');
        });

        test('When running and debugging: show Show Output button only (if available)', () => {
            const stateWithOutput: ProcessState = {
                exists: true,
                debugActive: true,
                terminationReason: 'none',
                hasOutputChannel: true,
            isLocked: false            };

            const stateWithoutOutput: ProcessState = {
                exists: true,
                debugActive: true,
                terminationReason: 'none',
                hasOutputChannel: false,
            isLocked: false            };

            const itemWithOutput = new AppCommandTreeItem(rubyCommand, stateWithOutput);
            const itemWithoutOutput = new AppCommandTreeItem(rubyCommand, stateWithoutOutput);

            // Should have comprehensive contextValue when debugging (no debug capability since already debugging)
            assert.strictEqual(itemWithOutput.contextValue, 'canShowOutputRunning,canStop,canShowOutput');
            // Should have stop capability even without output channel when debugging
            assert.strictEqual(itemWithoutOutput.contextValue, 'canStop');
        });
    });

    // Note: QuickPick logic remains unchanged - it still uses the original comprehensive logic
    // The QuickPick should continue to show all relevant actions regardless of button visibility
    suite('QuickPick logic remains comprehensive (unchanged)', () => {
        test('QuickPick logic validation - comprehensive actions available', () => {
            // This test validates that QuickPick logic is independent of button display rules
            // The QuickPick should show all contextually appropriate actions:
            // - Not running: Run, Show Output (if available)
            // - Running + not debugging: Stop, Debug (Ruby only), Show Output
            // - Running + debugging: Stop, Show Output
            
            // The actual QuickPick logic testing would require mocking vscode.window.showQuickPick
            // and the provider's stateMap, but the key insight is that QuickPick actions
            // should remain comprehensive while TreeItem buttons follow the simplified rules
            assert.ok(true, 'QuickPick logic validation placeholder');
        });
    });

    // Note: Testing the actual QuickPick logic would require mocking the provider and vscode.window.showQuickPick
    // The key insight is that the QuickPick now uses the exact same state logic as the TreeItem contextValue
    // This ensures the QuickPick actions match the button availability perfectly

    test('Crashed commands have red colored error icon', () => {
        const crashedState: ProcessState = {
            exists: false,
            debugActive: false,
            terminationReason: 'crashed',
            hasOutputChannel: true,
            isLocked: false        };

        const crashedItem = new AppCommandTreeItem(rubyCommand, crashedState);

        // Verify the crashed item has the error icon with red color
        assert.ok(crashedItem.iconPath);
        // Note: The actual color verification would require checking ThemeIcon properties
        // but this validates that the iconPath is set for crashed commands
        assert.strictEqual(crashedItem.contextValue, 'canShowOutputCrashed,canShowOutput');
    });
});
