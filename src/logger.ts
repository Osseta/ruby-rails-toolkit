import * as vscode from 'vscode';

/**
 * Logging levels for the extension logger
 */
export enum LogLevel {
    DEBUG = 'DEBUG',
    INFO = 'INFO',
    WARN = 'WARN',
    ERROR = 'ERROR'
}

/**
 * Centralized logging utility for the Ruby & Rails Toolkit extension.
 * Provides a single output channel for extension-wide logging with support for different log levels.
 */
export class Logger {
    private static instance: Logger;
    private outputChannel: vscode.LogOutputChannel;

    private constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Ruby & Rails Toolkit', { log: true });
    }

    /**
     * Gets the singleton instance of the Logger
     * @returns The Logger instance
     */
    public static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    /**
     * Gets the current log level from the output channel
     * @returns The current log level
     */
    public getLogLevel(): LogLevel {
        // Map vscode.LogLevel back to our LogLevel enum
        return this.mapFromVSCodeLogLevel(this.outputChannel.logLevel);
    }

    /**
     * Logs a trace message (equivalent to debug)
     * @param message The message to log
     * @param data Optional additional data to log
     */
    public trace(message: string, data?: any): void {
        if (data !== undefined) {
            this.outputChannel.trace(message, data);
        } else {
            this.outputChannel.trace(message);
        }
    }

    /**
     * Logs a debug message
     * @param message The message to log
     * @param data Optional additional data to log
     */
    public debug(message: string, data?: any): void {
        if (data !== undefined) {
            this.outputChannel.debug(message, data);
        } else {
            this.outputChannel.debug(message);
        }
    }

    /**
     * Logs an info message
     * @param message The message to log
     * @param data Optional additional data to log
     */
    public info(message: string, data?: any): void {
        if (data !== undefined) {
            this.outputChannel.info(message, data);
        } else {
            this.outputChannel.info(message);
        }
    }

    /**
     * Logs a warning message
     * @param message The message to log
     * @param data Optional additional data to log
     */
    public warn(message: string, data?: any): void {
        if (data !== undefined) {
            this.outputChannel.warn(message, data);
        } else {
            this.outputChannel.warn(message);
        }
    }

    /**
     * Logs an error message
     * @param message The message to log
     * @param data Optional additional data to log
     */
    public error(message: string, data?: any): void {
        if (data !== undefined) {
            this.outputChannel.error(message, data);
        } else {
            this.outputChannel.error(message);
        }
    }

    /**
     * Shows the output channel
     * @param preserveFocus Whether to preserve focus on the current editor
     */
    public show(preserveFocus: boolean = true): void {
        this.outputChannel.show(preserveFocus);
    }

    /**
     * Clears the output channel
     */
    public clear(): void {
        this.outputChannel.clear();
    }

    /**
     * Disposes of the output channel
     */
    public dispose(): void {
        this.outputChannel.dispose();
    }

    /**
     * Maps our LogLevel enum to VS Code's LogLevel
     */
    private mapToVSCodeLogLevel(level: LogLevel): vscode.LogLevel {
        switch (level) {
            case LogLevel.DEBUG:
                return vscode.LogLevel.Debug;
            case LogLevel.INFO:
                return vscode.LogLevel.Info;
            case LogLevel.WARN:
                return vscode.LogLevel.Warning;
            case LogLevel.ERROR:
                return vscode.LogLevel.Error;
            default:
                return vscode.LogLevel.Info;
        }
    }

    /**
     * Maps VS Code's LogLevel back to our LogLevel enum
     */
    private mapFromVSCodeLogLevel(level: vscode.LogLevel): LogLevel {
        switch (level) {
            case vscode.LogLevel.Debug:
                return LogLevel.DEBUG;
            case vscode.LogLevel.Info:
                return LogLevel.INFO;
            case vscode.LogLevel.Warning:
                return LogLevel.WARN;
            case vscode.LogLevel.Error:
                return LogLevel.ERROR;
            default:
                return LogLevel.INFO;
        }
    }
}

/**
 * Convenience function to get the logger instance
 * @returns The Logger instance
 */
export function getLogger(): Logger {
    return Logger.getInstance();
}
