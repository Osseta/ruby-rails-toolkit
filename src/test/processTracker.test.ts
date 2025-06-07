import * as assert from 'assert';
import { ProcessTracker } from '../processTracker';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import * as sinon from 'sinon';

suite('ProcessTracker', () => {
    const code = 'TESTCMD';
    const pidDir = ProcessTracker.getPidDir();
    const pidFile = ProcessTracker.getPidFilePath(code);

    teardown(() => {
        if (fs.existsSync(pidFile)) {fs.unlinkSync(pidFile);}
    });

    test('spawnAndTrack creates a pid file and isRunning returns true', function(done) {
        const child = ProcessTracker.spawnAndTrack({
            code,
            command: 'sleep',
            args: ['2'],
            options: { stdio: 'ignore' }
        });
        setTimeout(() => {
            assert.ok(fs.existsSync(pidFile));
            assert.ok(ProcessTracker.isRunning(code));
            child.kill();
            done();
        }, 200);
    });

    test('stopProcess kills process and removes pid file', function(done) {
        const child = ProcessTracker.spawnAndTrack({
            code,
            command: 'sleep',
            args: ['2'],
            options: { stdio: 'ignore' }
        });
        setTimeout(() => {
            ProcessTracker.stopProcess(code);
            assert.ok(!ProcessTracker.isRunning(code));
            assert.ok(!fs.existsSync(pidFile));
            done();
        }, 200);
    });

    test('isRunning returns false if no pid file', () => {
        assert.ok(!ProcessTracker.isRunning('NONEXISTENT'));
    });

    suite('preprocessOutputData', () => {
        let sandbox: sinon.SinonSandbox;

        setup(() => {
            sandbox = sinon.createSandbox();
            
            // Mock vscode.workspace.workspaceFolders for preprocessing tests
            sandbox.stub(vscode.workspace, 'workspaceFolders').value([{
                uri: { fsPath: '/mock/workspace' }
            }]);
        });

        teardown(() => {
            sandbox.restore();
        });

        test('should prepend file:// to relative file paths with workspace directory', () => {
            const testCases = [
                { input: '    dir/file.rb"', expected: '    file:///mock/workspace/dir/file.rb"' },
                { input: 'dir/file.rb"', expected: 'file:///mock/workspace/dir/file.rb"' },
                { input: '   dir/file.rb dome other text"', expected: '   file:///mock/workspace/dir/file.rb dome other text"' },
                { input: 'ededed deded dir/file.rb"', expected: 'ededed deded file:///mock/workspace/dir/file.rb"' },
                { input: '    src/component.ts"', expected: '    file:///mock/workspace/src/component.ts"' },
                { input: 'config/app.yml"', expected: 'file:///mock/workspace/config/app.yml"' },
                { input: 'test/spec.js some text"', expected: 'file:///mock/workspace/test/spec.js some text"' }
            ];

            testCases.forEach(({ input, expected }) => {
                const result = ProcessTracker.preprocessOutputData(input);
                assert.strictEqual(result, expected, `Failed for input: ${input}`);
            });
        });

        test('should prepend file:// to absolute file paths', () => {
            const testCases = [
                { input: '    /dir/file.rb"', expected: '    file:///dir/file.rb"' },
                { input: '/dir/file.rb"', expected: 'file:///dir/file.rb"' },
                { input: '   /dir/file.rb dome other text"', expected: '   file:///dir/file.rb dome other text"' },
                { input: 'error in /dir/file.rb"', expected: 'error in file:///dir/file.rb"' },
                { input: '    /src/component.ts"', expected: '    file:///src/component.ts"' },
                { input: '/config/app.yml"', expected: 'file:///config/app.yml"' },
                { input: 'error in /styles/main.css"', expected: 'error in file:///styles/main.css"' }
            ];

            testCases.forEach(({ input, expected }) => {
                const result = ProcessTracker.preprocessOutputData(input);
                assert.strictEqual(result, expected, `Failed for input: ${input}`);
            });
        });

        test('should prepend file:// to file paths with line numbers', () => {
            const testCases = [
                { input: '    dir/file.rb:45"', expected: '    file:///mock/workspace/dir/file.rb:45"' },
                { input: 'dir/file.rb:45"', expected: 'file:///mock/workspace/dir/file.rb:45"' },
                { input: '   dir/file.rb:45 dome other text"', expected: '   file:///mock/workspace/dir/file.rb:45 dome other text"' },
                { input: 'ededed deded dir/file.rb:45"', expected: 'ededed deded file:///mock/workspace/dir/file.rb:45"' },
                { input: '/absolute/path/file.rb:123', expected: 'file:///absolute/path/file.rb:123' },
                { input: 'src/component.ts:25"', expected: 'file:///mock/workspace/src/component.ts:25"' },
                { input: 'test/spec.js:10"', expected: 'file:///mock/workspace/test/spec.js:10"' },
                { input: '/absolute/styles.css:50', expected: 'file:///absolute/styles.css:50' }
            ];

            testCases.forEach(({ input, expected }) => {
                const result = ProcessTracker.preprocessOutputData(input);
                assert.strictEqual(result, expected, `Failed for input: ${input}`);
            });
        });

        test('should handle complex nested file paths', () => {
            const testCases = [
                { input: 'app/models/user.rb:123', expected: 'file:///mock/workspace/app/models/user.rb:123' },
                { input: 'spec/controllers/api/v1/users_controller_spec.rb:45', expected: 'file:///mock/workspace/spec/controllers/api/v1/users_controller_spec.rb:45' },
                { input: 'config/environments/development.rb', expected: 'file:///mock/workspace/config/environments/development.rb' },
                { input: 'lib/utils/string_helper.rb:67', expected: 'file:///mock/workspace/lib/utils/string_helper.rb:67' },
                { input: 'src/components/ui/button.tsx:30', expected: 'file:///mock/workspace/src/components/ui/button.tsx:30' },
                { input: 'tests/integration/api/users.test.js:155', expected: 'file:///mock/workspace/tests/integration/api/users.test.js:155' },
                { input: 'config/webpack/production.config.js', expected: 'file:///mock/workspace/config/webpack/production.config.js' },
                { input: 'docs/api/v2/endpoints.md:89', expected: 'file:///mock/workspace/docs/api/v2/endpoints.md:89' }
            ];

            testCases.forEach(({ input, expected }) => {
                const result = ProcessTracker.preprocessOutputData(input);
                assert.strictEqual(result, expected, `Failed for input: ${input}`);
            });
        });

        test('should handle multiple file paths in one line', () => {
            const input = 'Comparing app/old.rb:10 and app/new.rb:20 files, also check src/utils.ts:5';
            const expected = 'Comparing file:///mock/workspace/app/old.rb:10 and file:///mock/workspace/app/new.rb:20 files, also check file:///mock/workspace/src/utils.ts:5';
            const result = ProcessTracker.preprocessOutputData(input);
            assert.strictEqual(result, expected);
        });

        test('should not modify lines that already have file:// prefix', () => {
            const input = 'file:///path/to/file.txt\nfile://app/models/user.rb:45';
            const expected = 'file:///path/to/file.txt\nfile://app/models/user.rb:45';
            const result = ProcessTracker.preprocessOutputData(input);
            assert.strictEqual(result, expected);
        });

        test('should not modify lines without valid file paths', () => {
            const input = 'Simple output\nNo paths here\nJust text\nSome/thing without extension';
            const expected = 'Simple output\nNo paths here\nJust text\nSome/thing without extension';
            const result = ProcessTracker.preprocessOutputData(input);
            assert.strictEqual(result, expected);
        });

        test('should handle files with various extensions', () => {
            const testCases = [
                { input: 'src/file.rb:10', expected: 'file:///mock/workspace/src/file.rb:10' },
                { input: 'app/models/user.rb', expected: 'file:///mock/workspace/app/models/user.rb' },
                { input: 'spec/models/user_spec.rb:25', expected: 'file:///mock/workspace/spec/models/user_spec.rb:25' },
                { input: 'lib/helper.rb', expected: 'file:///mock/workspace/lib/helper.rb' },
                { input: 'config/initializers/setup.rb:100', expected: 'file:///mock/workspace/config/initializers/setup.rb:100' },
                { input: 'src/component.ts:15', expected: 'file:///mock/workspace/src/component.ts:15' },
                { input: 'config/app.yml', expected: 'file:///mock/workspace/config/app.yml' },
                { input: 'test/spec.js:25', expected: 'file:///mock/workspace/test/spec.js:25' },
                { input: 'docs/readme.md', expected: 'file:///mock/workspace/docs/readme.md' },
                { input: 'styles/main.css:100', expected: 'file:///mock/workspace/styles/main.css:100' },
                { input: 'package.json:50', expected: 'file:///mock/workspace/package.json:50' },
                { input: 'src/utils.py:75', expected: 'file:///mock/workspace/src/utils.py:75' },
                { input: 'config/settings.xml:200', expected: 'file:///mock/workspace/config/settings.xml:200' }
            ];

            testCases.forEach(({ input, expected }) => {
                const result = ProcessTracker.preprocessOutputData(input);
                assert.strictEqual(result, expected, `Failed for input: ${input}`);
            });
        });


        test('should handle empty lines correctly', () => {
            const input = 'app/file.rb:10\n\nlib/helper.rb:20\n';
            const expected = 'file:///mock/workspace/app/file.rb:10\n\nfile:///mock/workspace/lib/helper.rb:20\n';
            const result = ProcessTracker.preprocessOutputData(input);
            assert.strictEqual(result, expected);
        });

        test('should preserve line endings and formatting', () => {
            const input = 'Error in app/models/user.rb:45\nWarning in lib/utils.rb:10\n';
            const expected = 'Error in file:///mock/workspace/app/models/user.rb:45\nWarning in file:///mock/workspace/lib/utils.rb:10\n';
            const result = ProcessTracker.preprocessOutputData(input);
            assert.strictEqual(result, expected);
        });

        test('should handle files with underscores and hyphens', () => {
            const testCases = [
                { input: 'app/user_model.rb:15', expected: 'file:///mock/workspace/app/user_model.rb:15' },
                { input: 'spec/user-spec.rb:30', expected: 'file:///mock/workspace/spec/user-spec.rb:30' },
                { input: 'lib/my_helper-utils.rb', expected: 'file:///mock/workspace/lib/my_helper-utils.rb' },
                { input: 'src/user_component.tsx:25', expected: 'file:///mock/workspace/src/user_component.tsx:25' },
                { input: 'tests/user-integration.spec.js:40', expected: 'file:///mock/workspace/tests/user-integration.spec.js:40' },
                { input: 'config/database_config.yml', expected: 'file:///mock/workspace/config/database_config.yml' }
            ];

            testCases.forEach(({ input, expected }) => {
                const result = ProcessTracker.preprocessOutputData(input);
                assert.strictEqual(result, expected, `Failed for input: ${input}`);
            });
        });

        test('should handle files ending with quotes and other delimiters', () => {
            const testCases = [
                { input: 'Error in "app/models/user.rb:45"', expected: 'Error in "file:///mock/workspace/app/models/user.rb:45"' },
                { input: "File: 'lib/helper.rb:10'", expected: "File: 'file:///mock/workspace/lib/helper.rb:10'" },
                { input: 'Check app/file.rb at end of line', expected: 'Check file:///mock/workspace/app/file.rb at end of line' }
            ];

            testCases.forEach(({ input, expected }) => {
                const result = ProcessTracker.preprocessOutputData(input);
                assert.strictEqual(result, expected, `Failed for input: ${input}`);
            });
        });

        test('should handle files with extra text after line numbers', () => {
            const testCases = [
                { input: 'dir/file.rb:45:on frrcr', expected: 'file:///mock/workspace/dir/file.rb:45 :on frrcr' },
                { input: 'app/models/user.rb:123:in method', expected: 'file:///mock/workspace/app/models/user.rb:123 :in method' },
                { input: 'Error in spec/user_spec.rb:67:block (2 levels)', expected: 'Error in file:///mock/workspace/spec/user_spec.rb:67 :block (2 levels)' },
                { input: '/absolute/path/file.rb:89:warning', expected: 'file:///absolute/path/file.rb:89 :warning' },
                { input: 'lib/helper.rb:15:deprecated', expected: 'file:///mock/workspace/lib/helper.rb:15 :deprecated' },
                { input: 'src/component.ts:50:error', expected: 'file:///mock/workspace/src/component.ts:50 :error' },
                { input: 'test/unit.js:25:failed', expected: 'file:///mock/workspace/test/unit.js:25 :failed' },
                { input: 'config/app.yml:10:invalid', expected: 'file:///mock/workspace/config/app.yml:10 :invalid' },
                { input: '/absolute/styles.css:100:missing', expected: 'file:///absolute/styles.css:100 :missing' }
            ];

            testCases.forEach(({ input, expected }) => {
                const result = ProcessTracker.preprocessOutputData(input);
                assert.strictEqual(result, expected, `Failed for input: ${input}`);
            });
        });

        test('should show output channel on 500 error when configuration is true', () => {
            // Mock configuration to return true
            const getConfigurationStub = sandbox.stub(vscode.workspace, 'getConfiguration');
            const configMock = {
                get: sandbox.stub().withArgs('showProcessOutputOnServer500Errors', true).returns(true)
            };
            getConfigurationStub.withArgs('runRspec').returns(configMock as any);

            // Mock output channel
            const outputChannelMock = {
                show: sandbox.stub()
            };
            
            // Set up the output channel in the tracker
            (ProcessTracker as any).outputChannels.set('TEST_CODE', outputChannelMock);

            const input = 'Some log message\nCompleted 500 Internal Server Error in 123ms\nOther log';
            ProcessTracker.preprocessOutputData(input, 'TEST_CODE');

            // Verify the output channel was shown
            assert.strictEqual(outputChannelMock.show.callCount, 1);
            assert.strictEqual(outputChannelMock.show.getCall(0).args[0], true);
        });

        test('should not show output channel on 500 error when configuration is false', () => {
            // Mock configuration to return false
            const getConfigurationStub = sandbox.stub(vscode.workspace, 'getConfiguration');
            const configMock = {
                get: sandbox.stub().withArgs('showProcessOutputOnServer500Errors', true).returns(false)
            };
            getConfigurationStub.withArgs('runRspec').returns(configMock as any);

            // Mock output channel
            const outputChannelMock = {
                show: sandbox.stub()
            };
            
            // Set up the output channel in the tracker
            (ProcessTracker as any).outputChannels.set('TEST_CODE', outputChannelMock);

            const input = 'Some log message\nCompleted 500 Internal Server Error in 123ms\nOther log';
            ProcessTracker.preprocessOutputData(input, 'TEST_CODE');

            // Verify the output channel was NOT shown
            assert.strictEqual(outputChannelMock.show.callCount, 0);
        });

        test('should not show output channel when no 500 error is present', () => {
            // Mock configuration to return true
            const getConfigurationStub = sandbox.stub(vscode.workspace, 'getConfiguration');
            const configMock = {
                get: sandbox.stub().withArgs('showProcessOutputOnServer500Errors', true).returns(true)
            };
            getConfigurationStub.withArgs('runRspec').returns(configMock as any);

            // Mock output channel
            const outputChannelMock = {
                show: sandbox.stub()
            };
            
            // Set up the output channel in the tracker
            (ProcessTracker as any).outputChannels.set('TEST_CODE', outputChannelMock);

            const input = 'Some log message\nCompleted 200 OK in 123ms\nOther log';
            ProcessTracker.preprocessOutputData(input, 'TEST_CODE');

            // Verify the output channel was NOT shown
            assert.strictEqual(outputChannelMock.show.callCount, 0);
        });

        test('should not show output channel when no code is provided', () => {
            // Mock configuration to return true
            const getConfigurationStub = sandbox.stub(vscode.workspace, 'getConfiguration');
            const configMock = {
                get: sandbox.stub().withArgs('showProcessOutputOnServer500Errors', true).returns(true)
            };
            getConfigurationStub.withArgs('runRspec').returns(configMock as any);

            const input = 'Some log message\nCompleted 500 Internal Server Error in 123ms\nOther log';
            ProcessTracker.preprocessOutputData(input); // No code parameter

            // Since no code is provided, the configuration should not even be checked
            assert.strictEqual(getConfigurationStub.callCount, 0);
        });

        test('should use default value when configuration is not set', () => {
            // Mock configuration where the setting doesn't exist, so default value should be used
            const getConfigurationStub = sandbox.stub(vscode.workspace, 'getConfiguration');
            const configMock = {
                get: sandbox.stub().withArgs('showProcessOutputOnServer500Errors', true).returns(true)
            };
            getConfigurationStub.withArgs('runRspec').returns(configMock as any);

            // Mock output channel
            const outputChannelMock = {
                show: sandbox.stub()
            };
            
            // Set up the output channel in the tracker
            (ProcessTracker as any).outputChannels.set('TEST_CODE', outputChannelMock);

            const input = 'Some log message\nCompleted 500 Internal Server Error in 123ms\nOther log';
            ProcessTracker.preprocessOutputData(input, 'TEST_CODE');

            // Since the config returns the default value (true), the output channel should be shown
            assert.strictEqual(outputChannelMock.show.callCount, 1);
            assert.strictEqual(outputChannelMock.show.getCall(0).args[0], true);
        });
    });
});
