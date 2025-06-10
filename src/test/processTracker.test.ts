import * as assert from 'assert';
import { ProcessTracker } from '../processTracker';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import * as utils from '../utils';
import { EventEmitter } from 'events';
import * as childProcess from 'child_process';
import { clear } from 'console';

suite('ProcessTracker', () => {
    const code = 'TESTCMD';
    const pidDir = ProcessTracker.getPidDir();
    const pidFile = ProcessTracker.getPidFilePath(code);

    setup(() => {
        // Mock workspaceHash to return a predictable value
        sinon.stub(utils, 'workspaceHash').returns('mock-hash-1234');
        
        // Ensure vscode.window exists
        if (!vscode.window) {
            (vscode as any).window = {};
        }
        
        // Mock vscode.window.createOutputChannel
        const mockOutputChannel = {
            show: sinon.stub(),
            append: sinon.stub(),
            appendLine: sinon.stub(),
            dispose: sinon.stub(),
            clear: sinon.stub(),
        };
        if (!vscode.window.createOutputChannel) {
            (vscode.window as any).createOutputChannel = () => mockOutputChannel;
        }
        sinon.stub(vscode.window, 'createOutputChannel').returns(mockOutputChannel as any);
        
        // Mock vscode.window.showErrorMessage
        if (!vscode.window.showErrorMessage) {
            (vscode.window as any).showErrorMessage = () => Promise.resolve(undefined);
        }
        sinon.stub(vscode.window, 'showErrorMessage').resolves(undefined);
        
        // Ensure vscode.workspace exists
        if (!vscode.workspace) {
            (vscode as any).workspace = {};
        }
        
        // Mock vscode.workspace.workspaceFolders
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{
            uri: { fsPath: '/mock/workspace' }
        }]);
        
        // Mock vscode.workspace.getConfiguration
        if (!vscode.workspace.getConfiguration) {
            (vscode.workspace as any).getConfiguration = () => ({ get: () => true });
        }
        if (typeof vscode.workspace.getConfiguration === 'function' && !(vscode.workspace.getConfiguration as any).isSinonProxy) {
            sinon.stub(vscode.workspace, 'getConfiguration').returns({
                get: sinon.stub().returns(true) // Default to true for clearOutputChannelOnProcessRun
            } as any);
        }
        
        // Mock child_process.spawn to avoid actual process spawning
        const mockChild = new EventEmitter() as any;
        mockChild.pid = 12345;
        mockChild.stdout = new EventEmitter();
        mockChild.stderr = new EventEmitter();
        mockChild.kill = sinon.stub().returns(true);
        sinon.stub(childProcess, 'spawn').returns(mockChild);
        
        // Mock process.kill to avoid killing actual processes
        sinon.stub(process, 'kill').returns(true as any);
        
        // Mock pollForProcessStop to complete synchronously in tests
        sinon.stub(ProcessTracker as any, 'pollForProcessStop').callsFake((...args: any[]) => {
            const [pid, code, pidFile] = args;
            // Simulate immediate cleanup for test environment
            if (fs.existsSync(pidFile)) {
                fs.unlinkSync(pidFile);
            }
            ProcessTracker.clearWorkspaceHash(code);
        });
    });

    teardown(() => {
        if (fs.existsSync(pidFile)) {fs.unlinkSync(pidFile);}
        sinon.restore();
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
            
            // Note: workspaceHash is already stubbed in the main setup() function
            
            // Mock vscode.workspace.workspaceFolders for preprocessing tests
            sandbox.stub(vscode.workspace, 'workspaceFolders').value([{
                uri: { fsPath: '/mock/workspace' }
            }]);
            
            // Mock vscode.workspace.getConfiguration for preprocessing tests - work with existing stub
            if ((vscode.workspace.getConfiguration as any).isSinonProxy) {
                // getConfiguration is already stubbed, just reset it for this suite
                (vscode.workspace.getConfiguration as sinon.SinonStub).resetBehavior();
                (vscode.workspace.getConfiguration as sinon.SinonStub).returns({
                    get: sandbox.stub().returns(true)
                } as any);
            } else {
                vscode.workspace.getConfiguration = sandbox.stub().returns({
                    get: sandbox.stub().returns(true)
                } as any);
            }
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

        test('should convert Rails render commands to clickable file URIs', () => {
            const testCases = [
                { 
                    input: '  Rendered cart/_order_display.html.slim (Duration: 6.5ms | Allocations: 22377)',
                    expected: '  Rendered file:///mock/workspace/app/views/cart/_order_display.html.slim (Duration: 6.5ms | Allocations: 22377)'
                },
                { 
                    input: '  Rendered order/view.html.slim within layouts/application (Duration: 195.7ms | Allocations: 177750)',
                    expected: '  Rendered file:///mock/workspace/app/views/order/view.html.slim within layouts/application (Duration: 195.7ms | Allocations: 177750)'
                },
                { 
                    input: '  Rendered layouts/_greedysteed_icon_font.html.erb (Duration: 2.0ms | Allocations: 1544)',
                    expected: '  Rendered file:///mock/workspace/app/views/layouts/_greedysteed_icon_font.html.erb (Duration: 2.0ms | Allocations: 1544)'
                },
                { 
                    input: '  Rendered layouts/_navbar.html.slim (Duration: 5.3ms | Allocations: 16045)',
                    expected: '  Rendered file:///mock/workspace/app/views/layouts/_navbar.html.slim (Duration: 5.3ms | Allocations: 16045)'
                },
                { 
                    input: '  Rendered layouts/_breadcrumbs.html.slim (Duration: 2.2ms | Allocations: 2813)',
                    expected: '  Rendered file:///mock/workspace/app/views/layouts/_breadcrumbs.html.slim (Duration: 2.2ms | Allocations: 2813)'
                },
                { 
                    input: '  Rendered layouts/_footer.html.erb (Duration: 0.4ms | Allocations: 191)',
                    expected: '  Rendered file:///mock/workspace/app/views/layouts/_footer.html.erb (Duration: 0.4ms | Allocations: 191)'
                },
                { 
                    input: '  Rendered layouts/_analytics.html.erb (Duration: 0.2ms | Allocations: 156)',
                    expected: '  Rendered file:///mock/workspace/app/views/layouts/_analytics.html.erb (Duration: 0.2ms | Allocations: 156)'
                },
                { 
                    input: '  Rendered layout layouts/application.html.erb (Duration: 280.9ms | Allocations: 263813)',
                    expected: '  Rendered layout file:///mock/workspace/app/views/layouts/application.html.erb (Duration: 280.9ms | Allocations: 263813)'
                }
            ];

            testCases.forEach(({ input, expected }) => {
                const result = ProcessTracker.preprocessOutputData(input);
                assert.strictEqual(result, expected, `Failed for input: ${input}`);
            });
        });

        test('should NOT modify "Rendering" lines that already have file:// URIs', () => {
            const testCases = [
                { 
                    input: '  Rendering layout file:///Users/anthonyrichardson/techony/greedysteed/layouts/application.html.erb',
                    expected: '  Rendering layout file:///Users/anthonyrichardson/techony/greedysteed/layouts/application.html.erb'
                },
                { 
                    input: '  Rendering file:///Users/anthonyrichardson/techony/greedysteed/order/view.html.slim within layouts/application',
                    expected: '  Rendering file:///Users/anthonyrichardson/techony/greedysteed/order/view.html.slim within layouts/application'
                }
            ];

            testCases.forEach(({ input, expected }) => {
                const result = ProcessTracker.preprocessOutputData(input);
                assert.strictEqual(result, expected, `Failed for input: ${input}`);
            });
        });

        test('should NOT modify lines that already contain file:// URIs', () => {
            const testCases = [
                { 
                    input: '  Rendered file:///mock/workspace/app/views/cart/_order_display.html.slim (Duration: 6.5ms)',
                    expected: '  Rendered file:///mock/workspace/app/views/cart/_order_display.html.slim (Duration: 6.5ms)'
                },
                { 
                    input: 'Something file://already/converted/path.rb:123',
                    expected: 'Something file://already/converted/path.rb:123'
                }
            ];

            testCases.forEach(({ input, expected }) => {
                const result = ProcessTracker.preprocessOutputData(input);
                assert.strictEqual(result, expected, `Failed for input: ${input}`);
            });
        });

        test('should handle Rails render commands with various indentation levels', () => {
            const testCases = [
                { 
                    input: 'Rendered users/index.html.erb (Duration: 15.0ms | Allocations: 5000)',
                    expected: 'Rendered file:///mock/workspace/app/views/users/index.html.erb (Duration: 15.0ms | Allocations: 5000)'
                },
                { 
                    input: '    Rendered admin/dashboard.html.slim (Duration: 25.0ms | Allocations: 7500)',
                    expected: '    Rendered file:///mock/workspace/app/views/admin/dashboard.html.slim (Duration: 25.0ms | Allocations: 7500)'
                },
                { 
                    input: '\t\tRendered shared/_header.html.erb (Duration: 3.0ms | Allocations: 800)',
                    expected: '\t\tRendered file:///mock/workspace/app/views/shared/_header.html.erb (Duration: 3.0ms | Allocations: 800)'
                }
            ];

            testCases.forEach(({ input, expected }) => {
                const result = ProcessTracker.preprocessOutputData(input);
                assert.strictEqual(result, expected, `Failed for input: ${input}`);
            });
        });

        test('should handle Rails render commands with different view file extensions', () => {
            const testCases = [
                { 
                    input: '  Rendered products/show.html.haml (Duration: 12.5ms | Allocations: 3200)',
                    expected: '  Rendered file:///mock/workspace/app/views/products/show.html.haml (Duration: 12.5ms | Allocations: 3200)'
                },
                { 
                    input: '  Rendered api/v1/users.json.jbuilder (Duration: 8.2ms | Allocations: 1800)',
                    expected: '  Rendered file:///mock/workspace/app/views/api/v1/users.json.jbuilder (Duration: 8.2ms | Allocations: 1800)'
                },
                { 
                    input: '  Rendered emails/welcome.text.erb (Duration: 4.1ms | Allocations: 950)',
                    expected: '  Rendered file:///mock/workspace/app/views/emails/welcome.text.erb (Duration: 4.1ms | Allocations: 950)'
                }
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
            // Update existing mock to return true
            const configMock = {
                get: sandbox.stub().withArgs('showProcessOutputOnServer500Errors', true).returns(true)
            };
            (vscode.workspace.getConfiguration as any).withArgs('rubyToolkit').returns(configMock);

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
            // Update existing mock to return false
            const configMock = {
                get: sandbox.stub().withArgs('showProcessOutputOnServer500Errors', true).returns(false)
            };
            (vscode.workspace.getConfiguration as any).withArgs('rubyToolkit').returns(configMock);

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
            // Update existing mock to return true
            const configMock = {
                get: sandbox.stub().withArgs('showProcessOutputOnServer500Errors', true).returns(true)
            };
            (vscode.workspace.getConfiguration as any).withArgs('rubyToolkit').returns(configMock);

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
            const input = 'Some log message\nCompleted 500 Internal Server Error in 123ms\nOther log';
            ProcessTracker.preprocessOutputData(input); // No code parameter

            // Since no code is provided, no configuration should be accessed
            // This test just verifies no errors are thrown
        });

        test('should use default value when configuration is not set', () => {
            // Update existing mock to return the default value (true)
            const configMock = {
                get: sandbox.stub().withArgs('showProcessOutputOnServer500Errors', true).returns(true)
            };
            (vscode.workspace.getConfiguration as any).withArgs('rubyToolkit').returns(configMock);

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

        test('should not process lines that already contain file://', () => {
            const testCases = [
                { 
                    input: 'Error in file:///path/to/app/models/user.rb:45', 
                    expected: 'Error in file:///path/to/app/models/user.rb:45',
                    description: 'line with file:// should remain unchanged'
                },
                { 
                    input: 'Check file://src/components/header.tsx:10 for issues', 
                    expected: 'Check file://src/components/header.tsx:10 for issues',
                    description: 'line with file:// prefix should remain unchanged'
                },
                { 
                    input: 'Multiple issues: file:///app/models/user.rb:30 and app/models/post.rb:20', 
                    expected: 'Multiple issues: file:///app/models/user.rb:30 and app/models/post.rb:20',
                    description: 'entire line with file:// anywhere should remain unchanged'
                },
                { 
                    input: 'file://already/processed.rb:123', 
                    expected: 'file://already/processed.rb:123',
                    description: 'complete line with file:// should remain unchanged'
                }
            ];

            testCases.forEach(({ input, expected, description }) => {
                const result = ProcessTracker.preprocessOutputData(input);
                assert.strictEqual(result, expected, `Failed: ${description} - input: ${input}`);
            });
        });

        test('should not process lines that contain [StatsD]', () => {
            const testCases = [
                { 
                    input: '[StatsD] app/models/user.rb:45 method call', 
                    expected: '[StatsD] app/models/user.rb:45 method call',
                    description: 'StatsD log line should remain unchanged'
                },
                { 
                    input: 'Processing [StatsD] metrics for lib/helper.rb:20', 
                    expected: 'Processing [StatsD] metrics for lib/helper.rb:20',
                    description: 'line containing [StatsD] should remain unchanged'
                },
                { 
                    input: '[StatsD] Error in /absolute/path/file.rb:100', 
                    expected: '[StatsD] Error in /absolute/path/file.rb:100',
                    description: 'StatsD line with absolute path should remain unchanged'
                },
                { 
                    input: 'Debug: [StatsD] timing for src/components/button.tsx:30', 
                    expected: 'Debug: [StatsD] timing for src/components/button.tsx:30',
                    description: 'line with [StatsD] anywhere should remain unchanged'
                }
            ];

            testCases.forEach(({ input, expected, description }) => {
                const result = ProcessTracker.preprocessOutputData(input);
                assert.strictEqual(result, expected, `Failed: ${description} - input: ${input}`);
            });
        });

        test('should process normal lines that do not contain filtering keywords', () => {
            const testCases = [
                { 
                    input: 'Error in app/models/user.rb:45', 
                    expected: 'Error in file:///mock/workspace/app/models/user.rb:45',
                    description: 'normal error line should be processed'
                },
                { 
                    input: 'Warning in lib/helper.rb:20', 
                    expected: 'Warning in file:///mock/workspace/lib/helper.rb:20',
                    description: 'normal warning line should be processed'
                },
                { 
                    input: 'Processing src/components/button.tsx:30', 
                    expected: 'Processing file:///mock/workspace/src/components/button.tsx:30',
                    description: 'normal processing line should be processed'
                },
                { 
                    input: 'Loading config/database.yml:15', 
                    expected: 'Loading file:///mock/workspace/config/database.yml:15',
                    description: 'normal loading line should be processed'
                }
            ];

            testCases.forEach(({ input, expected, description }) => {
                const result = ProcessTracker.preprocessOutputData(input);
                assert.strictEqual(result, expected, `Failed: ${description} - input: ${input}`);
            });
        });

        test('should handle mixed lines with and without filtering keywords', () => {
            const input = `Error in app/models/user.rb:45
[StatsD] app/models/post.rb:20 timing
Rendered app/views/users/show.html.erb:15
Warning in lib/helper.rb:30
file://already/processed.rb:123
Processing src/component.tsx:50`;

            const expected = `Error in file:///mock/workspace/app/models/user.rb:45
[StatsD] app/models/post.rb:20 timing
Rendered app/views/users/show.html.erb:15
Warning in file:///mock/workspace/lib/helper.rb:30
file://already/processed.rb:123
Processing file:///mock/workspace/src/component.tsx:50`;

            const result = ProcessTracker.preprocessOutputData(input);
            assert.strictEqual(result, expected, 'Should process only lines without filtering keywords');
        });

        test('should handle edge cases with filtering keywords as part of larger words', () => {
            const testCases = [
                { 
                    input: 'custom[StatsD]Logger app/helper.rb:20', 
                    expected: 'custom[StatsD]Logger app/helper.rb:20',
                    description: 'should NOT process when [StatsD] is part of another word (line.includes behavior)'
                },
                { 
                    input: 'notfile://path but app/models/user.rb:30', 
                    expected: 'notfile://path but app/models/user.rb:30',
                    description: 'should NOT process when file:// is part of another word (line.includes behavior)'
                }
            ];

            testCases.forEach(({ input, expected, description }) => {
                const result = ProcessTracker.preprocessOutputData(input);
                assert.strictEqual(result, expected, `Failed: ${description} - input: ${input}`);
            });
        });
    });

    suite('Clear Output Channel Configuration', () => {
        let sandbox: sinon.SinonSandbox;

        setup(() => {
            sandbox = sinon.createSandbox();
            
            // getConfiguration is already stubbed in main setup, just reset and configure it for this suite
            (vscode.workspace.getConfiguration as sinon.SinonStub).resetBehavior();
        });

        teardown(() => {
            sandbox.restore();
        });

        test('should clear output channel when configuration is true (default)', () => {
            // Mock configuration to return true (default)
            const configMock = {
                get: sandbox.stub().withArgs('clearOutputChannelOnProcessRun', true).returns(true)
            };
            (vscode.workspace.getConfiguration as any).withArgs('rubyToolkit').returns(configMock);

            // Create an output channel that already exists
            const mockOutputChannel = {
                show: sandbox.stub(),
                append: sandbox.stub(),
                appendLine: sandbox.stub(),
                dispose: sandbox.stub(),
                clear: sandbox.stub(),
            };
            (ProcessTracker as any).outputChannels.set(code, mockOutputChannel);

            // Spawn and track a process (this should reuse the existing output channel)
            ProcessTracker.spawnAndTrack({
                code,
                command: 'echo',
                args: ['test'],
                options: {}
            });

            // Verify the configuration was checked and clear was called
            assert.strictEqual((vscode.workspace.getConfiguration as any).callCount, 1);
            assert.strictEqual((vscode.workspace.getConfiguration as any).getCall(0).args[0], 'rubyToolkit');
            assert.strictEqual(configMock.get.callCount, 1);
            assert.strictEqual(configMock.get.getCall(0).args[0], 'clearOutputChannelOnProcessRun');
            assert.strictEqual(configMock.get.getCall(0).args[1], true);
            assert.strictEqual(mockOutputChannel.clear.callCount, 1);
        });

        test('should not clear output channel when configuration is false', () => {
            // Mock configuration to return false
            const configMock = {
                get: sandbox.stub().withArgs('clearOutputChannelOnProcessRun', true).returns(false)
            };
            (vscode.workspace.getConfiguration as any).withArgs('rubyToolkit').returns(configMock);

            // Create an output channel that already exists
            const mockOutputChannel = {
                show: sandbox.stub(),
                append: sandbox.stub(),
                appendLine: sandbox.stub(),
                dispose: sandbox.stub(),
                clear: sandbox.stub(),
            };
            (ProcessTracker as any).outputChannels.set(code, mockOutputChannel);

            // Spawn and track a process (this should reuse the existing output channel)
            ProcessTracker.spawnAndTrack({
                code,
                command: 'echo',
                args: ['test'],
                options: {}
            });

            // Verify the configuration was checked but clear was NOT called
            assert.strictEqual((vscode.workspace.getConfiguration as any).callCount, 1);
            assert.strictEqual((vscode.workspace.getConfiguration as any).getCall(0).args[0], 'rubyToolkit');
            assert.strictEqual(configMock.get.callCount, 1);
            assert.strictEqual(configMock.get.getCall(0).args[0], 'clearOutputChannelOnProcessRun');
            assert.strictEqual(configMock.get.getCall(0).args[1], true);
            assert.strictEqual(mockOutputChannel.clear.callCount, 0);
        });

        test('should create new output channel without clearing when it does not exist', () => {
            // Mock configuration (should not matter since it's a new channel)
            const configMock = {
                get: sandbox.stub().withArgs('clearOutputChannelOnProcessRun', true).returns(true)
            };
            (vscode.workspace.getConfiguration as any).withArgs('rubyToolkit').returns(configMock);

            // Ensure no output channel exists for this code
            (ProcessTracker as any).outputChannels.delete(code);

            // Mock the createOutputChannel method
            const mockOutputChannel = {
                show: sandbox.stub(),
                append: sandbox.stub(),
                appendLine: sandbox.stub(),
                dispose: sandbox.stub(),
                clear: sandbox.stub(),
            };
            (vscode.window.createOutputChannel as any).returns(mockOutputChannel);

            // Spawn and track a process (this should create a new output channel)
            ProcessTracker.spawnAndTrack({
                code,
                command: 'echo',
                args: ['test'],
                options: {}
            });

            // Verify a new output channel was created and clear was NOT called (since it's new)
            assert.strictEqual((vscode.window.createOutputChannel as any).callCount, 1);
            assert.strictEqual(mockOutputChannel.clear.callCount, 0);
            // Configuration should not be checked for new channels
            assert.strictEqual((vscode.workspace.getConfiguration as any).callCount, 0);
        });
    });
});
