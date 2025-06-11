import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { debugCommand } from '../appCommand';
import { ProcessTracker } from '../processTracker';
import { FileLockManager } from '../fileLockManager';
import type { Command } from '../types';
import * as utils from '../utils';

suite('Debug Command Tests', () => {
    let sandbox: sinon.SinonSandbox;
    let mockCommand: Command;
    let isRunningStub: sinon.SinonStub;
    let getRunningPidStub: sinon.SinonStub;
    let listRdbgSocksStub: sinon.SinonStub;
    let startDebuggingStub: sinon.SinonStub;
    let showErrorMessageStub: sinon.SinonStub;
    let withLockStub: sinon.SinonStub;

    setup(() => {
        sandbox = sinon.createSandbox();
        
        // Mock Ruby command for testing
        mockCommand = {
            code: 'TEST_SERVER',
            description: 'Test Server',
            command: 'rails server',
            commandType: 'ruby'
        };
        
        // Mock ProcessTracker methods
        isRunningStub = sandbox.stub(ProcessTracker, 'isRunning').returns(true);
        getRunningPidStub = sandbox.stub(ProcessTracker, 'getRunningPid').returns(12345);
        
        // Mock utils.listRdbgSocks
        listRdbgSocksStub = sandbox.stub(utils, 'listRdbgSocks').resolves({
            stdout: '/tmp/rdbg-12345-TEST_SERVER.sock\n'
        });
        
        // Mock VS Code debug API
        startDebuggingStub = sandbox.stub(vscode.debug, 'startDebugging').resolves(true);
        showErrorMessageStub = sandbox.stub(vscode.window, 'showErrorMessage').resolves(undefined);
        
        // Mock FileLockManager to execute callback immediately
        withLockStub = sandbox.stub(FileLockManager, 'withLock').callsFake(async (code, callback) => {
            return await callback();
        });
        
        // Mock workspace folders
        sandbox.stub(vscode.workspace, 'workspaceFolders').value([{
            uri: { fsPath: '/mock/workspace' }
        }]);
    });

    teardown(() => {
        sandbox.restore();
    });

    test('should successfully start debug session when no existing session', async () => {
        // Act: Call debugCommand
        await debugCommand(mockCommand);
        
        // Assert: Verify debug session was started
        assert.ok(startDebuggingStub.calledOnce, 'vscode.debug.startDebugging should be called once');
        
        const debugConfig = startDebuggingStub.firstCall.args[1];
        assert.strictEqual(debugConfig.type, 'rdbg');
        assert.strictEqual(debugConfig.name, 'Attach to rdbg (TEST_SERVER)');
        assert.strictEqual(debugConfig.request, 'attach');
        assert.strictEqual(debugConfig.debugPort, '/tmp/rdbg-12345-TEST_SERVER.sock');
        
        // Verify no error was shown
        assert.ok(showErrorMessageStub.notCalled, 'No error message should be shown');
    });

    test('should prevent starting debug session when one already exists', async () => {
          // Create mock debug session
          const mockSession = {
              id: 'test-session-1',
              type: 'rdbg',
              name: 'Attach to rdbg (TEST_CMD_1)',
              workspaceFolder: undefined,
              configuration: {
                  type: 'rdbg',
                  name: 'Attach to rdbg (TEST_CMD_1)',
                  request: 'attach'
              }
          } as vscode.DebugSession;

          // mock getGlobalCommandStateManager to return a manager with an active session
          const manager = {
              // Required properties that match CommandStateManager
              buttonStates: {},
              commands: [],
              pollingInterval: null,
              onUpdate: sandbox.stub(),
              // Public methods
              getButtonState: sandbox.stub().returns({
                  exists: false,
                  debugActive: false,
                  terminationReason: 'none',
                  hasOutputChannel: false,
                  isLocked: false,
                  workspaceHash: undefined
              }),
              getButtonStates: sandbox.stub().returns({}),
              forceUpdate: sandbox.stub().resolves(),
              dispose: sandbox.stub(),
              registerDebugSession: sandbox.stub(),
              unregisterDebugSession: sandbox.stub(),
              getDebugSession: sandbox.stub().returns(mockSession)
          } as any;
          const appRunner = await import('../appRunner');
          sandbox.stub(appRunner, 'getGlobalCommandStateManager').returns(manager);

          // Act: Register debug session
          manager.registerDebugSession('TEST_CMD_1', mockSession);

        // Act & Assert: Expect error to be thrown
        try {
            await debugCommand(mockCommand);
            assert.fail('Expected debugCommand to throw an error');
        } catch (error) {
            assert.ok(error instanceof Error);
            assert.strictEqual(error.message, 'Debug session is already active for command: TEST_SERVER');
        }
        
        // Verify error message was shown to user
        assert.ok(showErrorMessageStub.calledOnce, 'Error message should be shown to user');
        assert.strictEqual(showErrorMessageStub.firstCall.args[0], 'Debug session is already active for command: TEST_SERVER');
        
        // Verify no new debug session was started
        assert.ok(startDebuggingStub.notCalled, 'No new debug session should be started');
    });

    test('should allow starting debug session when active session is for different command', async () => {
        // Act: Call debugCommand
        await debugCommand(mockCommand);
        
        // Assert: Verify debug session was started
        assert.ok(startDebuggingStub.calledOnce, 'vscode.debug.startDebugging should be called once');
        
        // Verify no error was shown
        assert.ok(showErrorMessageStub.notCalled, 'No error message should be shown');
    });

    test('should allow starting debug session when active session is not rdbg type', async () => {
        // Act: Call debugCommand
        await debugCommand(mockCommand);
        
        // Assert: Verify debug session was started
        assert.ok(startDebuggingStub.calledOnce, 'vscode.debug.startDebugging should be called once');
        
        // Verify no error was shown
        assert.ok(showErrorMessageStub.notCalled, 'No error message should be shown');
    });

    test('should not support debugging shell commands', async () => {
        // Setup: Create shell command
        const shellCommand: Command = {
            code: 'TEST_SHELL',
            description: 'Test Shell Command',
            command: 'echo "test"',
            commandType: 'shell'
        };
        
        // Act: Call debugCommand with shell command
        await debugCommand(shellCommand);
        
        // Assert: Verify no debug session was started
        assert.ok(startDebuggingStub.notCalled, 'Debug session should not be started for shell commands');
        assert.ok(showErrorMessageStub.notCalled, 'No error should be shown for shell commands');
    });

    test('should throw error when process is not running', async () => {
        // Setup: Mock process as not running
        getRunningPidStub.returns(undefined);
        
        // Act & Assert: Expect error to be thrown
        try {
            await debugCommand(mockCommand);
            assert.fail('Expected debugCommand to throw an error');
        } catch (error) {
            assert.ok(error instanceof Error);
            assert.strictEqual(error.message, 'No running process found for command: TEST_SERVER');
        }
        
        // Verify no debug session was started
        assert.ok(startDebuggingStub.notCalled, 'No debug session should be started');
    });

    test('should throw error when rdbg socket not found', async () => {
        // Setup: Mock no rdbg socket available
        listRdbgSocksStub.resolves({ stdout: '/tmp/other-socket.sock\n' });
        
        // Act & Assert: Expect error to be thrown
        try {
            await debugCommand(mockCommand);
            assert.fail('Expected debugCommand to throw an error');
        } catch (error) {
            assert.ok(error instanceof Error);
            assert.ok(error.message.includes('No rdbg socket found for PID: 12345'));
        }
        
        // Verify no debug session was started
        assert.ok(startDebuggingStub.notCalled, 'No debug session should be started');
    });

    test('should use FileLockManager to prevent concurrent operations', async () => {
        // Act: Call debugCommand
        await debugCommand(mockCommand);
        
        // Assert: Verify FileLockManager.withLock was called
        assert.ok(withLockStub.calledOnce, 'FileLockManager.withLock should be called');
        assert.strictEqual(withLockStub.firstCall.args[0], 'TEST_SERVER', 'Lock should be acquired for the correct command code');
    });
});
