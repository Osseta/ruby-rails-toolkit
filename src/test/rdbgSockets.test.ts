import * as assert from 'assert';
import * as sinon from 'sinon';
import * as rdbgSockets from '../rdbgSockets';
import { RdbgSocketPath } from '../types';
import * as utils from '../utils';

let unlinkStub: sinon.SinonStub;

suite('rdbgSockets', () => {
  setup(() => {
    sinon.restore();
    // Mock workspaceHash to return a predictable value
    sinon.stub(utils, 'workspaceHash').returns('mock-hash-1234');
    unlinkStub = sinon.stub();
    sinon.replace(require('fs'), 'unlink', unlinkStub);
    sinon.stub(require('../utils'), 'unlinkSocket');
    sinon.stub(require('../utils'), 'listRdbgSocks');
    sinon.stub(require('../utils'), 'extractPidFromRdbgSocketPath');
  });

  teardown(() => {
    sinon.restore();
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
});
