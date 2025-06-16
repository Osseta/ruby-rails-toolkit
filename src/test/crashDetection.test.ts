import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { ProcessTracker } from '../processTracker';
import * as appCommand from '../appCommand';
import * as utils from '../utils';
import { spawnAndTrackSuccess } from './helpers/processHelpers';
import { FsHelperMock } from './helpers/fsHelperMock';

suite('Process Crash Detection', () => {
    let sandbox: sinon.SinonSandbox;
    let showErrorMessageStub: sinon.SinonStub;
    let createOutputChannelStub: sinon.SinonStub;
    let outputChannelStub: any;

    setup(() => {
        sandbox = sinon.createSandbox();
        
        // Reset the mock filesystem
        FsHelperMock.reset();
        FsHelperMock.mock(sandbox);
        
        // Mock workspaceHash to return a predictable value
        sandbox.stub(utils, 'workspaceHash').returns('mock-hash-1234');
        
        // Mock output channel
        outputChannelStub = {
            show: sandbox.stub(),
            append: sandbox.stub(),
            appendLine: sandbox.stub(),
            dispose: sandbox.stub(),
            clear: sandbox.stub(),
            // Add LogOutputChannel methods
            trace: sandbox.stub(),
            debug: sandbox.stub(),
            info: sandbox.stub(),
            warn: sandbox.stub(),
            error: sandbox.stub(),
            logLevel: 1 // vscode.LogLevel.Info
        };
        
        // Ensure vscode.window exists
        if (!vscode.window) {
            (vscode as any).window = {};
        }
        if (!vscode.window.createOutputChannel) {
            (vscode.window as any).createOutputChannel = () => outputChannelStub;
        }
        if (!vscode.window.showErrorMessage) {
            (vscode.window as any).showErrorMessage = () => Promise.resolve({ title: 'Show Output' });
        }
        
        createOutputChannelStub = sandbox.stub(vscode.window, 'createOutputChannel').returns(outputChannelStub);
        showErrorMessageStub = sandbox.stub(vscode.window, 'showErrorMessage').resolves({ title: 'Show Output' });
        
        // Ensure vscode.workspace exists
        if (!vscode.workspace) {
            (vscode as any).workspace = {};
        }
        
        // Mock vscode.workspace.workspaceFolders for tests that need it
        sandbox.stub(vscode.workspace, 'workspaceFolders').value([{
            uri: { fsPath: '/mock/workspace' }
        }]);
        
        // Mock vscode.workspace.getConfiguration only if not already done
        if (!vscode.workspace.getConfiguration || typeof vscode.workspace.getConfiguration === 'function') {
            vscode.workspace.getConfiguration = sandbox.stub().returns({
                get: sandbox.stub().returns(true)
            } as any);
        }


        // Mock process.kill to prevent actual process operations
        // For signal 0 (existence check), return true for our mock PIDs
        sandbox.stub(process, 'kill').callsFake((pid: any, signal?: any) => {
            if (signal === 0) {
                // For existence check, always return true for our test PIDs
                // (which are in the range 1000-11000 from the spawn mock)
                const numPid = typeof pid === 'string' ? parseInt(pid) : pid;
                if (numPid >= 1000 && numPid < 11000) {
                    return true;
                }
                // For other PIDs, simulate "process not found"
                const error = new Error('kill ESRCH');
                (error as any).code = 'ESRCH';
                throw error;
            }
            // For other signals (like SIGTERM), always return true
            return true;
        });

        // Spy on ProcessTracker.stopProcess to see if it's being called
        sandbox.spy(ProcessTracker, 'stopProcess');

        // Mock getPidDir to return a predictable path
        sandbox.stub(ProcessTracker as any, 'getPidDir').returns('/mock/pid/dir');
        FsHelperMock.mkdirSync('/mock/pid/dir', { recursive: true });

        // Mock waitForProcessStop to complete synchronously in tests and perform cleanup
        sandbox.stub(ProcessTracker as any, 'waitForProcessStop').callsFake((...args: any[]) => {
            const [pid, code, pidFile] = args;
            // Simulate the cleanup that the real method would do using FsHelperMock
            if (FsHelperMock.existsSync(pidFile)) {
                FsHelperMock.unlinkSync(pidFile);
            }
            (ProcessTracker as any).clearWorkspaceHash(code);
            return Promise.resolve();
        });
    });

    teardown(() => {
        sandbox.restore();
        // Reset mock filesystem state between tests
        FsHelperMock.reset();
        // Clean up any test files
        ProcessTracker.clearAllTerminationReasons();
        // Clear output channels map to prevent test interference
        (ProcessTracker as any).outputChannels.clear();
    });

    test('should show output channel and error message when process crashes', async () => {
        const code = 'TEST_CRASH';
        
        // Spawn a process that will crash (simulate by triggering exit event)
        const { child } = await spawnAndTrackSuccess(code);

        // Simulate process crash (exit without user intervention)
        child.emit('exit', 1, null);

        // Wait a bit for async operations
        await new Promise(resolve => setTimeout(resolve, 10));

        // Verify termination reason was set to crashed
        assert.strictEqual(ProcessTracker.getTerminationReason(code), 'crashed');
        
        // Verify output channel was shown
        assert(outputChannelStub.show.calledWith(true), 'Output channel should be shown');
        
        // Verify error message was displayed
        assert(showErrorMessageStub.calledOnce, 'Error message should be displayed');
        assert(showErrorMessageStub.calledWith(
            `Process "${code}" crashed unexpectedly. Check the output channel for details.`,
            'Show Output'
        ), 'Error message should contain correct text');
        
        // Verify process exit message was logged
        assert(outputChannelStub.appendLine.calledWith('\n[Process exited with code 1]'), 
               'Process exit should be logged');
    });

    test('should not show error message when process is stopped by user', async () => {
        const code = 'TEST_USER_STOP';
        
        // Spawn a process
        const { child } = await spawnAndTrackSuccess(code);

        // Simulate user stopping the process
        await ProcessTracker.stopProcess(code);
        
        // Simulate process exit after user stop
        child.emit('exit', 0, 'SIGTERM');

        // Wait a bit for async operations
        await new Promise(resolve => setTimeout(resolve, 10));

        // Verify termination reason was set to user-requested
        assert.strictEqual(ProcessTracker.getTerminationReason(code), 'user-requested');
        
        // Verify error message was NOT displayed for user-requested termination
        assert(showErrorMessageStub.notCalled, 'Error message should not be displayed for user termination');
    });

    test('should reuse output channel for same process code', async () => {
        const code = 'TEST_REUSE';
        
        // Spawn process twice with same code
        await spawnAndTrackSuccess(code);
        await spawnAndTrackSuccess(code);

        // Verify createOutputChannel was called only once
        assert.strictEqual(createOutputChannelStub.callCount, 1, 
                          'Output channel should be reused for same process code');
    });

    test('should dispose output channel when requested', async () => {
        const code = 'TEST_DISPOSE';
        
        // Spawn a process
        await spawnAndTrackSuccess(code);
        
        // Dispose the output channel
        ProcessTracker.disposeOutputChannel(code);
        
        // Verify output channel was disposed
        assert(outputChannelStub.dispose.calledOnce, 'Output channel should be disposed');
    });

    test('should dispose all output channels when requested', async () => {
        const codes = ['TEST_DISPOSE_ALL_1', 'TEST_DISPOSE_ALL_2'];
        
        // Spawn multiple processes
        for (const code of codes) {
            await spawnAndTrackSuccess(code);
        }
        
        // Dispose all output channels
        ProcessTracker.disposeAllOutputChannels();
        
        // Verify all output channels were disposed
        assert.strictEqual(outputChannelStub.dispose.callCount, codes.length, 
                          'All output channels should be disposed');
    });

    test('should not mark processes as crashed when stopped via stopAllCommands', async () => {
        // Use the existing spy from setup() to monitor calls
        const stopProcessSpy = ProcessTracker.stopProcess as sinon.SinonSpy;
        stopProcessSpy.resetHistory(); // Reset call history for this test
        
        // Spawn multiple processes
        const codes = ['TEST_STOP_ALL_1', 'TEST_STOP_ALL_2'];
        const children = [];
        for (const code of codes) {
            const { child } = await spawnAndTrackSuccess(code);
            children.push(child);
        }

        // Call stopAllCommands (now stops all processes regardless of config)
        await appCommand.stopAllCommands();

        // Verify stopProcess was called for each running process
        assert.strictEqual(stopProcessSpy.callCount, codes.length, 
            'stopProcess should be called for each running process');

        // Simulate processes exiting after being stopped
        children.forEach((child, index) => {
            child.emit('exit', 0, 'SIGTERM');
        });

        // Wait a bit for async operations
        await new Promise(resolve => setTimeout(resolve, 10));

        // Verify termination reasons were set to user-requested (not crashed)
        codes.forEach(code => {
            assert.strictEqual(ProcessTracker.getTerminationReason(code), 'user-requested',
                `Process ${code} should be marked as user-requested, not crashed`);
        });

        // Verify error message was NOT displayed for any process
        assert(showErrorMessageStub.notCalled, 
            'Error message should not be displayed when processes are stopped via stopAllCommands');
    });
});