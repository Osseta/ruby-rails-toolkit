import * as childProcess from 'child_process';
import { ProcessTracker } from '../../processTracker';
import { EventEmitter } from 'events';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { FsHelperMock } from './fsHelperMock';

export class ProcessHelper {
   static mockOutputChannel: any;
   static createOutputChannelStub: sinon.SinonStub | undefined;

   static reset(): void {
     this.mockOutputChannel = undefined;
     this.createOutputChannelStub = undefined;
   }

   static mock(sandbox?: sinon.SinonSandbox): void {
      this.reset();
      const stubber = sandbox || sinon;

      // Mock vscode.window.createOutputChannel
      this.mockOutputChannel = {
          show: stubber.stub(),
          append: stubber.stub(),
          appendLine: stubber.stub(),
          dispose: stubber.stub(),
          clear: stubber.stub(),
          // Add LogOutputChannel methods
          trace: stubber.stub(),
          debug: stubber.stub(),
          info: stubber.stub(),
          warn: stubber.stub(),
          error: stubber.stub(),
          logLevel: 1 // vscode.LogLevel.Info
      };

      // Ensure vscode.window exists
      if (!vscode.window) {
          (vscode as any).window = {};
      }
      
      if (!vscode.window.createOutputChannel) {
          (vscode.window as any).createOutputChannel = () => this.mockOutputChannel;
      }
      this.createOutputChannelStub = stubber.stub(vscode.window, 'createOutputChannel').returns(this.mockOutputChannel as any);

      // Mock process.kill to prevent actual process operations
      // For signal 0 (existence check), return true for our mock PIDs
      stubber.stub(process, 'kill').callsFake((pid: any, signal?: any) => {
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
   }

  /**
   * Spawns a child process to execute a command and tracks its success by reading output from a temporary file.
   * @param {string} commandCode - The command to execute.
   * @returns {ChildProcess} - The spawned child process.
   */
  static async spawnAndTrackSuccess(
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

}