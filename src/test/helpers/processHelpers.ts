import * as childProcess from 'child_process';
import { ProcessTracker } from '../../processTracker';
import { EventEmitter } from 'events';
import * as sinon from 'sinon';
// import * as vscode from 'vscode';
// import * as utils from '../../utils';

/**
 * Spawns a child process to execute a command and tracks its success by reading output from a temporary file.
 * @param {string} commandCode - The command to execute.
 * @returns {ChildProcess} - The spawned child process.
 */
export async function spawnAndTrackSuccess(
  commandCode: string,
  additionalForbiddenVars: string[] = [],
  sandbox: sinon.SinonSandbox | sinon.SinonStatic = sinon
): Promise<{ child: childProcess.ChildProcessWithoutNullStreams, env: any }> {
    // Mock child_process.spawn to avoid actual process spawning
    const mockChild = new EventEmitter() as any;
    mockChild.pid =  Math.floor(Math.random() * 10000) + 1000; // Random PID for each process
    mockChild.stdout = new EventEmitter();
    mockChild.stderr = new EventEmitter();
    mockChild.kill = sandbox.stub().returns(true);
    let env: any;

    const spawnStub = sandbox.stub(childProcess, 'spawn').callsFake((command: string, args: any, options: any) => {
      env = options.env;
      return mockChild;
    });

    const child = ProcessTracker.spawnAndTrack({
        code: commandCode,
        command: 'sleep',
        args: ['2'],
        options: { stdio: 'ignore' },
        additionalForbiddenVars
    });
    // Simulate stdout message so that the process is considered successful
    mockChild.stdout.emit('data', 'test');

    const createdProcess = await child;

    // tear down only the spawn stub and leave the rest of the sandbox intact
    spawnStub.restore();

    return { child: createdProcess, env };
}
