import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import * as rdbgSockets from '../rdbgSockets';
import { RdbgSocketPath } from '../types';
import * as utils from '../utils';
import { FsHelper } from '../fsHelper';

let unlinkStub: sinon.SinonStub;

suite('rdbgSockets', () => {
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
    // Mock workspaceHash to return a predictable value
    sandbox.stub(utils, 'workspaceHash').returns('mock-hash-1234');
    unlinkStub = sandbox.stub();
    sandbox.replace(require('fs'), 'unlink', unlinkStub);
    sandbox.stub(require('../utils'), 'unlinkSocket');
    sandbox.stub(require('../utils'), 'listRdbgSocks');
    sandbox.stub(require('../utils'), 'extractPidFromRdbgSocketPath');
    
    // Mock vscode.workspace.getConfiguration
    if (!vscode.workspace) {
      (vscode as any).workspace = {};
    }
    if (!vscode.workspace.getConfiguration) {
      vscode.workspace.getConfiguration = sandbox.stub();
    }
  });

  teardown(() => {
    sandbox.restore();
  });

  suite('RDBG_SOCK_DIR constant', () => {
    test('should be set to /tmp/rdbg-socks', () => {
      assert.strictEqual(rdbgSockets.RDBG_SOCK_DIR, '/tmp/rdbg-socks');
    });
  });

  suite('ensureRdbgSocketDirectory', () => {
    test('should create directory if it does not exist', () => {
      const existsSyncStub = sandbox.stub(FsHelper, 'existsSync').returns(false);
      const mkdirSyncStub = sandbox.stub(FsHelper, 'mkdirSync');

      rdbgSockets.ensureRdbgSocketDirectory();

      assert.strictEqual(existsSyncStub.calledWith('/tmp/rdbg-socks'), true);
      assert.strictEqual(mkdirSyncStub.calledWith('/tmp/rdbg-socks', { recursive: true }), true);
    });

    test('should not create directory if it already exists', () => {
      const existsSyncStub = sandbox.stub(FsHelper, 'existsSync').returns(true);
      const mkdirSyncStub = sandbox.stub(FsHelper, 'mkdirSync');

      rdbgSockets.ensureRdbgSocketDirectory();

      assert.strictEqual(existsSyncStub.calledWith('/tmp/rdbg-socks'), true);
      assert.strictEqual(mkdirSyncStub.called, false);
    });
  });

  test('checkAndCleanRdbgSocket keeps socket if process is running', async () => {
    const extractPidStub = require('../utils').extractPidFromRdbgSocketPath as sinon.SinonStub;
    extractPidStub.returns(1234);
    const processKillStub = sinon.stub(process, 'kill');
    // Simulate process exists (does not throw)
    const unlinkSocketStub = require('../utils').unlinkSocket as sinon.SinonStub;
    const result = await rdbgSockets.checkAndCleanRdbgSocket('/tmp/rdbg-1234-session' as RdbgSocketPath);
    assert.strictEqual(result, true);
    assert.strictEqual(unlinkSocketStub.called, false);
    processKillStub.restore();
  });

  test('checkAndCleanRdbgSocket deletes socket if process is not running', async () => {
    const extractPidStub = require('../utils').extractPidFromRdbgSocketPath as sinon.SinonStub;
    extractPidStub.returns(5678);
    const processKillStub = sinon.stub(process, 'kill').throws(new Error('No such process'));
    const unlinkSocketStub = require('../utils').unlinkSocket as sinon.SinonStub;
    const result = await rdbgSockets.checkAndCleanRdbgSocket('/tmp/rdbg-5678-session' as RdbgSocketPath);
    assert.strictEqual(result, false);
    assert.strictEqual(unlinkSocketStub.calledWith('/tmp/rdbg-5678-session'), true);
    processKillStub.restore();
  });

  test('waitForRdbgSessionAndGetSocket returns socket path if found', async () => {
    const listRdbgSocksStub = require('../utils').listRdbgSocks as sinon.SinonStub;
    listRdbgSocksStub.resolves({ stdout: '/tmp/sock1-SESSION\n/tmp/sock2\n' });
    const result = await rdbgSockets.waitForRdbgSessionAndGetSocket('SESSION', 100, 10);
    assert.strictEqual(result, '/tmp/sock1-SESSION');
  });

  test('waitForRdbgSessionAndGetSocket returns null if not found', async () => {
    const listRdbgSocksStub = require('../utils').listRdbgSocks as sinon.SinonStub;
    listRdbgSocksStub.resolves({ stdout: '/tmp/sock1\n/tmp/sock2\n' });
    const result = await rdbgSockets.waitForRdbgSessionAndGetSocket('SESSION', 50, 10);
    assert.strictEqual(result, null);
  });

  suite('getRdbgSocketDirEnvPrefix', () => {
    test('returns environment variable prefix when setting is enabled', () => {
      // Mock configuration to return true for useCustomRdbgSocketDirectory
      const configMock = {
        get: sandbox.stub().callsFake((key: string, defaultValue?: any) => {
          if (key === 'useCustomRdbgSocketDirectory') {
            return true;
          }
          return defaultValue;
        })
      };
      (vscode.workspace.getConfiguration as sinon.SinonStub).resetBehavior();
      (vscode.workspace.getConfiguration as sinon.SinonStub).returns(configMock);

      const result = rdbgSockets.getRdbgSocketDirEnvPrefix();
      assert.strictEqual(result, 'RUBY_DEBUG_SOCK_DIR=/tmp/rdbg-socks ');
    });

    test('returns empty string when setting is disabled', () => {
      // Mock configuration to return false for useCustomRdbgSocketDirectory
      const configMock = {
        get: sandbox.stub().callsFake((key: string, defaultValue?: any) => {
          if (key === 'useCustomRdbgSocketDirectory') {
            return false;
          }
          return defaultValue;
        })
      };
      (vscode.workspace.getConfiguration as sinon.SinonStub).resetBehavior();
      (vscode.workspace.getConfiguration as sinon.SinonStub).returns(configMock);

      const result = rdbgSockets.getRdbgSocketDirEnvPrefix();
      assert.strictEqual(result, '');
    });

    test('defaults to enabled when setting is not found', () => {
      // Mock configuration to return undefined for useCustomRdbgSocketDirectory (using default)
      const configMock = {
        get: sandbox.stub().callsFake((key: string, defaultValue?: any) => {
          if (key === 'useCustomRdbgSocketDirectory') {
            return defaultValue; // Should return the default value of true
          }
          return defaultValue;
        })
      };
      (vscode.workspace.getConfiguration as sinon.SinonStub).resetBehavior();
      (vscode.workspace.getConfiguration as sinon.SinonStub).returns(configMock);

      const result = rdbgSockets.getRdbgSocketDirEnvPrefix();
      assert.strictEqual(result, 'RUBY_DEBUG_SOCK_DIR=/tmp/rdbg-socks ');
    });
  });
});
