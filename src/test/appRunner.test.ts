import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { ProcessTracker } from '../processTracker';
import { AppCommandTreeItem } from '../appRunner';
import type { Command, ProcessState } from '../types';

suite('AppRunner', () => {
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        sandbox = sinon.createSandbox();
    });

    teardown(() => {
        sandbox.restore();
    });

    suite('AppCommandTreeItem contextValue', () => {
        const testCommand: Command = {
            code: 'TEST_CMD',
            description: 'Test Command',
            command: 'echo "test"',
            commandType: 'shell',
            wait: true
        };

        test('should include canRun when process not running and not crashed', () => {
            const state: ProcessState = {
                exists: false,
                debugActive: false,
                terminationReason: 'none',
                hasOutputChannel: false,
            isLocked: false            };

            const item = new AppCommandTreeItem(testCommand, state);
            assert.strictEqual(item.contextValue, 'canRun');
        });

        test('should include canShowOutputCrashed when process not running and crashed', () => {
            const state: ProcessState = {
                exists: false,
                debugActive: false,
                terminationReason: 'crashed',
                hasOutputChannel: true,
            isLocked: false            };

            const item = new AppCommandTreeItem(testCommand, state);
            assert.strictEqual(item.contextValue, 'canShowOutputCrashed,canShowOutput');
        });

        test('should include canShowOutputRunning when process is running', () => {
            const state: ProcessState = {
                exists: true,
                debugActive: false,
                terminationReason: 'none',
                hasOutputChannel: true,
            isLocked: false            };

            const item = new AppCommandTreeItem(testCommand, state);
            assert.strictEqual(item.contextValue, 'canShowOutputRunning,canStop,canShowOutput');
        });

        test('should include canShowOutputRunning and canDebug for ruby commands when running but not debugging', () => {
            const rubyCommand: Command = {
                ...testCommand,
                commandType: 'ruby'
            };
            const state: ProcessState = {
                exists: true,
                debugActive: false,
                terminationReason: 'none',
                hasOutputChannel: true,
            isLocked: false            };

            const item = new AppCommandTreeItem(rubyCommand, state);
            assert.strictEqual(item.contextValue, 'canShowOutputRunning,canStop,canDebug,canShowOutput');
        });

        test('should not include canShowOutputCrashed when crashed but no output channel', () => {
            const state: ProcessState = {
                exists: false,
                debugActive: false,
                terminationReason: 'crashed',
                hasOutputChannel: false,
            isLocked: false            };

            const item = new AppCommandTreeItem(testCommand, state);
            assert.strictEqual(item.contextValue, '');
        });

        test('should include canShowOutputRunning when debugging is active', () => {
            const rubyCommand: Command = {
                ...testCommand,
                commandType: 'ruby'
            };
            const state: ProcessState = {
                exists: true,
                debugActive: true,
                terminationReason: 'none',
                hasOutputChannel: true,
            isLocked: false            };

            const item = new AppCommandTreeItem(rubyCommand, state);
            assert.strictEqual(item.contextValue, 'canShowOutputRunning,canStop,canShowOutput');
        });
    });

    suite('ProcessTracker output channel methods', () => {
        test('should return true when output channel exists', () => {
            // Create a mock output channel first
            const mockOutputChannel = {
                show: sandbox.stub(),
                append: sandbox.stub(),
                appendLine: sandbox.stub(),
                dispose: sandbox.stub()
            };
            sandbox.stub(vscode.window, 'createOutputChannel').returns(mockOutputChannel as any);

            // Spawn a process to create the output channel
            ProcessTracker.spawnAndTrack({
                code: 'TEST_HAS_OUTPUT',
                command: 'echo "test"',
                args: []
            });

            assert.strictEqual(ProcessTracker.hasOutputChannel('TEST_HAS_OUTPUT'), true);
            
            // Clean up
            ProcessTracker.disposeOutputChannel('TEST_HAS_OUTPUT');
        });

        test('should return false when output channel does not exist', () => {
            assert.strictEqual(ProcessTracker.hasOutputChannel('NONEXISTENT'), false);
        });

        test('should return output channel when it exists', () => {
            // Create a mock output channel first
            const mockOutputChannel = {
                show: sandbox.stub(),
                append: sandbox.stub(),
                appendLine: sandbox.stub(),
                dispose: sandbox.stub()
            };
            sandbox.stub(vscode.window, 'createOutputChannel').returns(mockOutputChannel as any);

            // Spawn a process to create the output channel
            ProcessTracker.spawnAndTrack({
                code: 'TEST_GET_OUTPUT',
                command: 'echo "test"',
                args: []
            });

            const outputChannel = ProcessTracker.getOutputChannel('TEST_GET_OUTPUT');
            assert.ok(outputChannel);
            assert.strictEqual(outputChannel, mockOutputChannel);
            
            // Clean up
            ProcessTracker.disposeOutputChannel('TEST_GET_OUTPUT');
        });

        test('should return undefined when output channel does not exist', () => {
            const outputChannel = ProcessTracker.getOutputChannel('NONEXISTENT');
            assert.strictEqual(outputChannel, undefined);
        });
    });
});
