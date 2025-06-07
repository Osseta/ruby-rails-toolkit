import { suite, test } from 'mocha';
import { strict as assert } from 'assert';
import { extractPidFromRdbgSocketPath } from '../utils';
import * as sinon from 'sinon';
import * as utils from '../utils';

suite('extractPidFromRdbgSocketPath', () => {
  setup(() => {
    // Mock workspaceHash to return a predictable value
    sinon.stub(utils, 'workspaceHash').returns('mock-hash-1234');
  });

  teardown(() => {
    sinon.restore();
  });

  test('extracts PID from valid rdbg socket path', () => {
    const socketPath = '/tmp/rdbg-12345-RSPEC~abcdef.sock';
    const pid = extractPidFromRdbgSocketPath(socketPath);
    assert.equal(pid, 12345);
  });

  test('throws error for invalid socket path', () => {
    const socketPath = '/tmp/not-an-rdbg-socket.sock';
    assert.throws(() => extractPidFromRdbgSocketPath(socketPath), /Could not extract PID/);
  });

  test('extracts PID when session name contains dashes', () => {
    const socketPath = '/tmp/rdbg-67890-RSPEC-foo-bar.sock';
    const pid = extractPidFromRdbgSocketPath(socketPath);
    assert.equal(pid, 67890);
  });

  test('throws error for empty string', () => {
    assert.throws(() => extractPidFromRdbgSocketPath(''), /Could not extract PID/);
  });
});

// Remove all rdbg/session-specific logic. No changes needed for utils.test.ts for process tracking.
