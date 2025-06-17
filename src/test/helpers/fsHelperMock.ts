import * as path from 'path';
import * as sinon from 'sinon';
import { FsHelper } from '../../fsHelper';

export interface StatsMock {
    isFile(): boolean;
    isDirectory(): boolean;
    size: number;
    mtime: Date;
    ctime: Date;
    atime: Date;
}

export class FsHelperMock {
    private static fileSystem: Map<string, string> = new Map();
    private static directories: Set<string> = new Set();
    private static fileDescriptors: Map<number, string> = new Map();
    private static nextFd: number = 1;

    static existsSync(filePath: string): boolean {
        const normalizedPath = path.normalize(filePath);
        return this.fileSystem.has(normalizedPath) || this.directories.has(normalizedPath);
    }

    static readFileSync(filePath: string, encoding: BufferEncoding = 'utf8'): string {
        const normalizedPath = path.normalize(filePath);
        if (!this.fileSystem.has(normalizedPath)) {
            throw new Error(`ENOENT: no such file or directory, open '${filePath}'`);
        }
        return this.fileSystem.get(normalizedPath) as string;
    }

    static writeFileSync(filePath: string, data: string, encoding: BufferEncoding = 'utf8'): void {
        const normalizedPath = path.normalize(filePath);
        this._ensureDirectoryExists(path.dirname(normalizedPath));
        this.fileSystem.set(normalizedPath, data);
    }

    static appendFileSync(filePath: string, data: string, encoding: BufferEncoding = 'utf8'): void {
        const normalizedPath = path.normalize(filePath);
        this._ensureDirectoryExists(path.dirname(normalizedPath));
        const existingContent = this.fileSystem.get(normalizedPath) || '';
        this.fileSystem.set(normalizedPath, existingContent + data);
    }

    static unlinkSync(filePath: string): void {
        const normalizedPath = path.normalize(filePath);
        if (!this.fileSystem.has(normalizedPath)) {
            throw new Error(`ENOENT: no such file or directory, unlink '${filePath}'`);
        }
        this.fileSystem.delete(normalizedPath);
    }

    static mkdirSync(dirPath: string, options?: { recursive?: boolean }): void {
        const normalizedPath = path.normalize(dirPath);
        
        if (options?.recursive) {
            this._createDirectoryRecursive(normalizedPath);
        } else {
            const parentDir = path.dirname(normalizedPath);
            if (parentDir !== normalizedPath && !this.directories.has(parentDir)) {
                throw new Error(`ENOENT: no such file or directory, mkdir '${dirPath}'`);
            }
            this.directories.add(normalizedPath);
        }
    }

    static rmdirSync(dirPath: string, options?: { recursive?: boolean }): void {
        const normalizedPath = path.normalize(dirPath);
        
        if (!this.directories.has(normalizedPath)) {
            throw new Error(`ENOENT: no such file or directory, rmdir '${dirPath}'`);
        }
        
        if (options?.recursive) {
            this._removeDirectoryRecursive(normalizedPath);
        } else {
            // Check if directory is empty
            const hasContents = Array.from(this.fileSystem.keys()).some(file => 
                file.startsWith(normalizedPath + path.sep)) ||
                Array.from(this.directories).some(dir => 
                    dir.startsWith(normalizedPath + path.sep) && dir !== normalizedPath);
            
            if (hasContents) {
                throw new Error(`ENOTEMPTY: directory not empty, rmdir '${dirPath}'`);
            }
            
            this.directories.delete(normalizedPath);
        }
    }

    static readdirSync(dirPath: string): string[] {
        const normalizedPath = path.normalize(dirPath);
        if (!this.directories.has(normalizedPath)) {
            throw new Error(`ENOENT: no such file or directory, scandir '${dirPath}'`);
        }
        
        const items = new Set<string>();
        
        // Add files
        for (const filePath of this.fileSystem.keys()) {
            if (path.dirname(filePath) === normalizedPath) {
                items.add(path.basename(filePath));
            }
        }
        
        // Add directories
        for (const dir of this.directories) {
            if (path.dirname(dir) === normalizedPath) {
                items.add(path.basename(dir));
            }
        }
        
        return Array.from(items);
    }

    static statSync(filePath: string): StatsMock {
        const normalizedPath = path.normalize(filePath);
        const now = new Date();
        
        if (this.fileSystem.has(normalizedPath)) {
            const content = this.fileSystem.get(normalizedPath) as string;
            return {
                isFile: () => true,
                isDirectory: () => false,
                size: content.length,
                mtime: now,
                ctime: now,
                atime: now
            };
        }
        
        if (this.directories.has(normalizedPath)) {
            return {
                isFile: () => false,
                isDirectory: () => true,
                size: 0,
                mtime: now,
                ctime: now,
                atime: now
            };
        }
        
        throw new Error(`ENOENT: no such file or directory, stat '${filePath}'`);
    }

    static lstatSync(filePath: string): StatsMock {
        return this.statSync(filePath);
    }

    static openSync(filePath: string, flags: string): number {
        const normalizedPath = path.normalize(filePath);
        const fd = this.nextFd++;
        this.fileDescriptors.set(fd, normalizedPath);
        
        // Initialize file if it doesn't exist and we're writing
        if (!this.fileSystem.has(normalizedPath) && (flags.includes('w') || flags.includes('a'))) {
            this._ensureDirectoryExists(path.dirname(normalizedPath));
            this.fileSystem.set(normalizedPath, '');
        }
        
        return fd;
    }

    static writeSync(fd: number, data: string): void {
        const filePath = this.fileDescriptors.get(fd);
        if (!filePath) {
            throw new Error(`EBADF: bad file descriptor, write`);
        }
        
        const existingContent = this.fileSystem.get(filePath) || '';
        this.fileSystem.set(filePath, existingContent + data);
    }

    static readSync(fd: number, buffer: Buffer, offset: number, length: number, position: number | null): number {
        const filePath = this.fileDescriptors.get(fd);
        if (!filePath) {
            throw new Error(`EBADF: bad file descriptor, read`);
        }
        
        const content = this.fileSystem.get(filePath) || '';
        const startPos = position !== null ? position : 0;
        const endPos = Math.min(startPos + length, content.length);
        const bytesToRead = Math.max(0, endPos - startPos);
        
        const dataToRead = content.slice(startPos, endPos);
        buffer.write(dataToRead, offset);
        
        return bytesToRead;
    }

    static closeSync(fd: number): void {
        this.fileDescriptors.delete(fd);
    }

    static copyFileSync(src: string, dest: string): void {
        const normalizedSrc = path.normalize(src);
        const normalizedDest = path.normalize(dest);
        
        if (!this.fileSystem.has(normalizedSrc)) {
            throw new Error(`ENOENT: no such file or directory, open '${src}'`);
        }
        
        const content = this.fileSystem.get(normalizedSrc) as string;
        this._ensureDirectoryExists(path.dirname(normalizedDest));
        this.fileSystem.set(normalizedDest, content);
    }

    static renameSync(oldPath: string, newPath: string): void {
        const normalizedOld = path.normalize(oldPath);
        const normalizedNew = path.normalize(newPath);
        
        if (this.fileSystem.has(normalizedOld)) {
            const content = this.fileSystem.get(normalizedOld) as string;
            this.fileSystem.delete(normalizedOld);
            this._ensureDirectoryExists(path.dirname(normalizedNew));
            this.fileSystem.set(normalizedNew, content);
        } else if (this.directories.has(normalizedOld)) {
            this.directories.delete(normalizedOld);
            this._ensureDirectoryExists(path.dirname(normalizedNew));
            this.directories.add(normalizedNew);
        } else {
            throw new Error(`ENOENT: no such file or directory, rename '${oldPath}' -> '${newPath}'`);
        }
    }

    static chmodSync(filePath: string, mode: string | number): void {
        const normalizedPath = path.normalize(filePath);
        if (!this.existsSync(normalizedPath)) {
            throw new Error(`ENOENT: no such file or directory, chmod '${filePath}'`);
        }
        // Mock implementation - just verify the file exists
    }

    static accessSync(filePath: string, mode?: number): void {
        const normalizedPath = path.normalize(filePath);
        if (!this.existsSync(normalizedPath)) {
            throw new Error(`ENOENT: no such file or directory, access '${filePath}'`);
        }
    }

    static createReadStream(filePath: string, options?: any): any {
        const normalizedPath = path.normalize(filePath);
        if (!this.fileSystem.has(normalizedPath)) {
            throw new Error(`ENOENT: no such file or directory, open '${filePath}'`);
        }
        
        // Return a mock stream-like object
        const content = this.fileSystem.get(normalizedPath) as string;
        return {
            read: () => content,
            on: (event: string, callback: Function) => {
                if (event === 'data') {
                    setTimeout(() => callback(content), 0);
                } else if (event === 'end') {
                    setTimeout(() => callback(), 0);
                }
            },
            pipe: (destination: any) => destination
        };
    }

    static createWriteStream(filePath: string, options?: any): any {
        const normalizedPath = path.normalize(filePath);
        this._ensureDirectoryExists(path.dirname(normalizedPath));
        
        let content = '';
        return {
            write: (data: string) => {
                content += data;
                this.fileSystem.set(normalizedPath, content);
            },
            end: (data?: string) => {
                if (data) {
                    content += data;
                    this.fileSystem.set(normalizedPath, content);
                }
            },
            on: (event: string, callback: Function) => {
                // Mock event handling
            }
        };
    }

    private static _ensureDirectoryExists(dirPath: string): void {
        const normalizedPath = path.normalize(dirPath);
        if (normalizedPath === '.' || normalizedPath === path.sep) {
            return;
        }
        
        if (!this.directories.has(normalizedPath)) {
            this._ensureDirectoryExists(path.dirname(normalizedPath));
            this.directories.add(normalizedPath);
        }
    }

    private static _createDirectoryRecursive(dirPath: string): void {
        const normalizedPath = path.normalize(dirPath);
        const parts = normalizedPath.split(path.sep);
        let currentPath = '';
        
        for (const part of parts) {
            if (part === '') { continue; }
            currentPath = currentPath ? path.join(currentPath, part) : part;
            this.directories.add(currentPath);
        }
    }

    private static _removeDirectoryRecursive(dirPath: string): void {
        const normalizedPath = path.normalize(dirPath);
        
        // Remove all files in directory and subdirectories
        for (const filePath of Array.from(this.fileSystem.keys())) {
            if (filePath.startsWith(normalizedPath + path.sep) || filePath === normalizedPath) {
                this.fileSystem.delete(filePath);
            }
        }
        
        // Remove all subdirectories
        for (const dir of Array.from(this.directories)) {
            if (dir.startsWith(normalizedPath + path.sep) || dir === normalizedPath) {
                this.directories.delete(dir);
            }
        }
    }

    static reset(): void {
        this.fileSystem.clear();
        this.directories.clear();
        this.fileDescriptors.clear();
        this.nextFd = 1;
        
        // Add common system directories
        this.directories.add('/');
        this.directories.add('/tmp');
        this.directories.add('/Users');
    }

    // Utility methods for testing
    static getFileContent(filePath: string): string | undefined {
        return this.fileSystem.get(path.normalize(filePath));
    }

    static getAllFiles(): string[] {
        return Array.from(this.fileSystem.keys());
    }

    static getAllDirectories(): string[] {
        return Array.from(this.directories);
    }

    static isDirectory(dirPath: string): boolean {
        return this.directories.has(path.normalize(dirPath));
    }

    static isFile(filePath: string): boolean {
        return this.fileSystem.has(path.normalize(filePath));
    }

    /**
     * Creates mocks for all FsHelper methods, deferring to FsHelperMock implementations
     * @param sandbox Optional sinon sandbox, defaults to sinon if not provided
     */
    static mock(sandbox?: sinon.SinonSandbox): void {
        this.reset();
        const stubber = sandbox || sinon;
        
        stubber.stub(FsHelper, 'existsSync').callsFake((filePath: string) => {
            return this.existsSync(filePath);
        });
        
        stubber.stub(FsHelper, 'readFileSync').callsFake((filePath: string, encoding: BufferEncoding = 'utf8') => {
            return this.readFileSync(filePath, encoding);
        });
        
        stubber.stub(FsHelper, 'writeFileSync').callsFake((filePath: string, data: string, encoding: BufferEncoding = 'utf8') => {
            return this.writeFileSync(filePath, data, encoding);
        });
        
        stubber.stub(FsHelper, 'unlinkSync').callsFake((filePath: string) => {
            return this.unlinkSync(filePath);
        });
        
        stubber.stub(FsHelper, 'mkdirSync').callsFake((dirPath: string, options?: any) => {
            return this.mkdirSync(dirPath, options);
        });
        
        stubber.stub(FsHelper, 'readdirSync').callsFake((dirPath: string) => {
            return this.readdirSync(dirPath);
        });
        
        stubber.stub(FsHelper, 'openSync').callsFake((filePath: string, flags: string) => {
            return this.openSync(filePath, flags);
        });
        
        stubber.stub(FsHelper, 'writeSync').callsFake((fd: number, data: string) => {
            return this.writeSync(fd, data);
        });
        
        stubber.stub(FsHelper, 'closeSync').callsFake((fd: number) => {
            return this.closeSync(fd);
        });
    }

    /**
     * Tears down all FsHelper mocks by restoring original implementations
     * @param sandbox Optional sinon sandbox, defaults to sinon if not provided
     */
    static teardown(sandbox?: sinon.SinonSandbox): void {
        const stubber = sandbox || sinon;
        
        if (stubber.restore) {
            // If using a sandbox, restore all stubs
            stubber.restore();
        } else {
            // If using global sinon, restore individual stubs
            const methods = [
                'existsSync', 'readFileSync', 'writeFileSync', 'unlinkSync', 'mkdirSync',
                'readdirSync', 'openSync', 'writeSync', 'closeSync', 'appendFileSync',
                'rmdirSync', 'statSync', 'lstatSync', 'readSync', 'copyFileSync',
                'renameSync', 'chmodSync', 'accessSync', 'createReadStream', 'createWriteStream'
            ];
            
            methods.forEach(method => {
                if ((FsHelper as any)[method] && (FsHelper as any)[method].restore) {
                    (FsHelper as any)[method].restore();
                }
            });
        }
    }
}
