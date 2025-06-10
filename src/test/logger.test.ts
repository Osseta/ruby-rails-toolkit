import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { Logger, getLogger } from '../logger';

suite('Logger Tests', () => {
    let sandbox: sinon.SinonSandbox;
    let mockOutputChannel: any;

    setup(() => {
        sandbox = sinon.createSandbox();
        
        // Reset the singleton instance before each test
        (Logger as any).instance = undefined;
        
        // Mock vscode.LogLevel enum
        if (!vscode.LogLevel) {
            (vscode as any).LogLevel = {
                Trace: 0,
                Debug: 1,
                Info: 2,
                Warning: 3,
                Error: 4
            };
        }
        
        // Mock LogOutputChannel with all the logging methods
        mockOutputChannel = {
            trace: sandbox.stub(),
            debug: sandbox.stub(),
            info: sandbox.stub(),
            warn: sandbox.stub(),
            error: sandbox.stub(),
            show: sandbox.stub(),
            clear: sandbox.stub(),
            dispose: sandbox.stub(),
            logLevel: vscode.LogLevel.Info // Default log level
        };
        
        // Mock vscode.window.createOutputChannel to return our mock when called with log: true
        sandbox.stub(vscode.window, 'createOutputChannel').callsFake((name: string, options?: any) => {
            if (options && options.log) {
                return mockOutputChannel;
            }
            // Return a basic output channel for non-log calls
            return {
                appendLine: sandbox.stub(),
                show: sandbox.stub(),
                clear: sandbox.stub(),
                dispose: sandbox.stub()
            };
        });
    });

    teardown(() => {
        sandbox.restore();
        // Clean up singleton instance
        (Logger as any).instance = undefined;
    });

    test('should create singleton instance', () => {
        const logger1 = Logger.getInstance();
        const logger2 = Logger.getInstance();
        
        assert.strictEqual(logger1, logger2, 'Should return the same instance');
        
        const createChannelStub = vscode.window.createOutputChannel as sinon.SinonStub;
        assert.strictEqual(createChannelStub.callCount, 1, 'Should create output channel only once');
        
        // Verify it was called with the log option
        const call = createChannelStub.getCall(0);
        assert.strictEqual(call.args[0], 'Ruby & Rails Toolkit', 'Should use correct channel name');
        assert.deepStrictEqual(call.args[1], { log: true }, 'Should pass log: true option');
    });

    test('should get logger via convenience function', () => {
        const logger1 = getLogger();
        const logger2 = getLogger();
        
        assert.strictEqual(logger1, logger2, 'Should return the same instance');
        assert.strictEqual(logger1, Logger.getInstance(), 'Should be same as getInstance()');
    });

    test('should log trace messages', () => {
        const logger = Logger.getInstance();
        logger.trace('test trace message');
        
        assert.strictEqual(mockOutputChannel.trace.callCount, 1, 'Should call trace once');
        assert.strictEqual(mockOutputChannel.trace.getCall(0).args[0], 'test trace message');
    });

    test('should log debug messages', () => {
        const logger = Logger.getInstance();
        logger.debug('test debug message');
        
        assert.strictEqual(mockOutputChannel.debug.callCount, 1, 'Should call debug once');
        assert.strictEqual(mockOutputChannel.debug.getCall(0).args[0], 'test debug message');
    });

    test('should log info messages', () => {
        const logger = Logger.getInstance();
        logger.info('test info message');
        
        assert.strictEqual(mockOutputChannel.info.callCount, 1, 'Should call info once');
        assert.strictEqual(mockOutputChannel.info.getCall(0).args[0], 'test info message');
    });

    test('should log warning messages', () => {
        const logger = Logger.getInstance();
        logger.warn('test warning message');
        
        assert.strictEqual(mockOutputChannel.warn.callCount, 1, 'Should call warn once');
        assert.strictEqual(mockOutputChannel.warn.getCall(0).args[0], 'test warning message');
    });

    test('should log error messages', () => {
        const logger = Logger.getInstance();
        logger.error('test error message');
        
        assert.strictEqual(mockOutputChannel.error.callCount, 1, 'Should call error once');
        assert.strictEqual(mockOutputChannel.error.getCall(0).args[0], 'test error message');
    });

    test('should handle message and data parameters', () => {
        const logger = Logger.getInstance();
        const testData = { key: 'value', number: 42 };
        
        logger.info('Test message with data', testData);
        
        assert.strictEqual(mockOutputChannel.info.callCount, 1, 'Should call info once');
        assert.strictEqual(mockOutputChannel.info.getCall(0).args[0], 'Test message with data');
        assert.deepStrictEqual(mockOutputChannel.info.getCall(0).args[1], testData);
    });

    test('should show output channel', () => {
        const logger = Logger.getInstance();
        logger.show();
        
        assert.strictEqual(mockOutputChannel.show.callCount, 1, 'Should call show once');
    });

    test('should clear output channel', () => {
        const logger = Logger.getInstance();
        logger.clear();
        
        assert.strictEqual(mockOutputChannel.clear.callCount, 1, 'Should call clear once');
    });

    test('should dispose output channel', () => {
        const logger = Logger.getInstance();
        logger.dispose();
        
        assert.strictEqual(mockOutputChannel.dispose.callCount, 1, 'Should call dispose once');
    });

    test('should handle error objects', () => {
        const logger = Logger.getInstance();
        const error = new Error('Test error');
        
        logger.error('Error occurred', error);
        
        assert.strictEqual(mockOutputChannel.error.callCount, 1, 'Should call error once');
        assert.strictEqual(mockOutputChannel.error.getCall(0).args[0], 'Error occurred');
        assert.strictEqual(mockOutputChannel.error.getCall(0).args[1], error);
    });

    test('should create logger with proper channel name', () => {
        Logger.getInstance();
        
        const createChannelStub = vscode.window.createOutputChannel as sinon.SinonStub;
        const call = createChannelStub.getCall(0);
        
        assert.strictEqual(call.args[0], 'Ruby & Rails Toolkit', 'Should use correct extension name');
        assert.deepStrictEqual(call.args[1], { log: true }, 'Should enable logging features');
    });
});
