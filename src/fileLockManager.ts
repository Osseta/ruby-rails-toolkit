import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ProcessTracker } from './processTracker';

export interface FileLockOptions {
    timeout?: number;
    retryInterval?: number;
}

/**
 * Manages file locking for command actions using the pid file as coordination mechanism.
 * Provides exclusive access to command operations through file locking with timeout support.
 */
export class FileLockManager {
    private static readonly DEFAULT_TIMEOUT = 30000; // 30 seconds
    private static readonly DEFAULT_RETRY_INTERVAL = 100; // 100ms
    private static readonly LOCK_EXTENSION = '.lock';
    private static activeLocks: Map<string, boolean> = new Map();

    /**
     * Acquires a file lock for the given command
     * @param command The command to lock
     * @param options Lock options
     * @returns Promise that resolves when lock is acquired
     */
    static async acquireLock(commandCode: string, options: FileLockOptions = {}): Promise<void> {
        const timeout = options.timeout || this.DEFAULT_TIMEOUT;
        const retryInterval = options.retryInterval || this.DEFAULT_RETRY_INTERVAL;
        const lockFilePath = this.getLockFilePath(commandCode);
        const pidFilePath = ProcessTracker.getPidFilePath(commandCode);
        
        // Ensure the PID directory exists before trying to create any files
        ProcessTracker.ensurePidDir();
        
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeout) {
            try {
                // Try to create the lock file exclusively
                const lockFileDescriptor = fs.openSync(lockFilePath, 'wx');
                
                // Write our process PID to the lock file
                fs.writeSync(lockFileDescriptor, String(process.pid));
                fs.closeSync(lockFileDescriptor);
                
                // Mark as locked in our local state
                this.activeLocks.set(commandCode, true);
                
                // If no pid file exists, create it (this will be the case for new commands)
                if (!fs.existsSync(pidFilePath)) {
                    ProcessTracker.ensurePidDir();
                    // Create an empty pid file to be populated later
                    fs.writeFileSync(pidFilePath, '', 'utf8');
                }
                
                return;
            } catch (error: any) {
                if (error.code === 'EEXIST') {
                    // Lock file exists, check if the process that created it is still alive
                    try {
                        const lockContent = fs.readFileSync(lockFilePath, 'utf8');
                        const lockPid = parseInt(lockContent.trim());
                        
                        if (lockPid && lockPid !== process.pid) {
                            try {
                                // Check if the process that holds the lock is still alive
                                process.kill(lockPid, 0);
                                // Process is alive, wait and retry
                            } catch {
                                // Process is dead, remove stale lock file
                                try {
                                    fs.unlinkSync(lockFilePath);
                                } catch {
                                    // Lock file might have been removed by another process
                                }
                                continue; // Try again immediately
                            }
                        } else {
                            // Invalid or our own PID in lock file, remove it
                            try {
                                fs.unlinkSync(lockFilePath);
                            } catch {
                                // Lock file might have been removed by another process
                            }
                            continue; // Try again immediately
                        }
                    } catch {
                        // Can't read lock file, assume it's stale and try to remove it
                        try {
                            fs.unlinkSync(lockFilePath);
                        } catch {
                            // Lock file might have been removed by another process
                        }
                        continue; // Try again immediately
                    }
                    
                    // Wait before retrying
                    await new Promise(resolve => setTimeout(resolve, retryInterval));
                } else {
                    throw error;
                }
            }
        }
        
        throw new Error(`Failed to acquire lock for command ${commandCode} within ${timeout}ms`);
    }

    /**
     * Releases the file lock for the given command
     * @param commandCode The command code to unlock
     */
    static releaseLock(commandCode: string): void {
        const lockFilePath = this.getLockFilePath(commandCode);
        
        try {
            // Only remove the lock if we own it
            if (this.activeLocks.get(commandCode)) {
                try {
                    const lockContent = fs.readFileSync(lockFilePath, 'utf8');
                    const lockPid = parseInt(lockContent.trim());
                    
                    if (lockPid === process.pid) {
                        fs.unlinkSync(lockFilePath);
                    }
                } catch {
                    // Lock file might not exist or be unreadable, try to remove anyway
                    try {
                        fs.unlinkSync(lockFilePath);
                    } catch {
                        // Ignore errors when removing lock file
                    }
                }
                
                this.activeLocks.delete(commandCode);
            }
        } catch {
            // Ignore errors when releasing lock
        }
    }

    /**
     * Checks if a command is currently locked
     * @param commandCode The command code to check
     * @returns true if the command is locked, false otherwise
     */
    static isLocked(commandCode: string): boolean {
        const lockFilePath = this.getLockFilePath(commandCode);
        
        try {
            if (!fs.existsSync(lockFilePath)) {
                return false;
            }
            
            const lockContent = fs.readFileSync(lockFilePath, 'utf8');
            const lockPid = parseInt(lockContent.trim());
            
            if (!lockPid) {
                return false;
            }
            
            try {
                // Check if the process is still alive
                process.kill(lockPid, 0);
                return true;
            } catch {
                // Process is dead, remove stale lock
                try {
                    fs.unlinkSync(lockFilePath);
                } catch {
                    // Ignore errors
                }
                return false;
            }
        } catch {
            return false;
        }
    }

    /**
     * Executes a function while holding a lock on the command
     * @param commandCode The command code to lock
     * @param fn The function to execute while holding the lock
     * @param options Lock options
     * @param onLockAcquired Optional callback called immediately after lock is acquired
     * @returns Promise that resolves with the function result
     */
    static async withLock<T>(
        commandCode: string, 
        fn: () => Promise<T> | T, 
        options: FileLockOptions = {},
        onLockAcquired?: () => void | Promise<void>
    ): Promise<T> {
        await this.acquireLock(commandCode, options);
        try {
            // Call the callback immediately after lock acquisition
            if (onLockAcquired) {
                await onLockAcquired();
            }
            return await fn();
        } finally {
            this.releaseLock(commandCode);
        }
    }

    /**
     * Gets the path to the lock file for a given command code
     * @param commandCode The command code
     * @returns The path to the lock file
     */
    private static getLockFilePath(commandCode: string): string {
        const pidDir = ProcessTracker.getPidDir();
        return path.join(pidDir, `${commandCode}.pid${this.LOCK_EXTENSION}`);
    }

    /**
     * Cleans up all lock files owned by this process
     */
    static cleanup(): void {
        for (const commandCode of this.activeLocks.keys()) {
            this.releaseLock(commandCode);
        }
        this.activeLocks.clear();
    }
}
