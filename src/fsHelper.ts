import * as fs from 'fs';
import * as path from 'path';

export class FsHelper {
    static existsSync(filePath: string): boolean {
        return fs.existsSync(filePath);
    }

    static readFileSync(filePath: string, encoding: BufferEncoding = 'utf8'): string {
        return fs.readFileSync(filePath, encoding);
    }

    static writeFileSync(filePath: string, data: string, encoding: BufferEncoding = 'utf8'): void {
        fs.writeFileSync(filePath, data, encoding);
    }

    static unlinkSync(filePath: string): void {
        fs.unlinkSync(filePath);
    }

    static mkdirSync(dirPath: string, options?: fs.MakeDirectoryOptions): void {
        fs.mkdirSync(dirPath, options);
    }

    static readdirSync(dirPath: string): string[] {
        return fs.readdirSync(dirPath);
    }

    static openSync(filePath: string, flags: string): number {
        return fs.openSync(filePath, flags);
    }

    static writeSync(fd: number, data: string): void {
        fs.writeSync(fd, data);
    }

    static closeSync(fd: number): void {
        fs.closeSync(fd);
    }

    static appendFileSync(filePath: string, data: string, encoding: BufferEncoding = 'utf8'): void {
        fs.appendFileSync(filePath, data, encoding);
    }

    static rmdirSync(dirPath: string, options?: { recursive?: boolean }): void {
        fs.rmdirSync(dirPath, options);
    }

    static statSync(filePath: string): fs.Stats {
        return fs.statSync(filePath);
    }

    static lstatSync(filePath: string): fs.Stats {
        return fs.lstatSync(filePath);
    }

    static readSync(fd: number, buffer: Buffer, offset: number, length: number, position: number | null): number {
        return fs.readSync(fd, buffer, offset, length, position);
    }

    static copyFileSync(src: string, dest: string): void {
        fs.copyFileSync(src, dest);
    }

    static renameSync(oldPath: string, newPath: string): void {
        fs.renameSync(oldPath, newPath);
    }

    static chmodSync(filePath: string, mode: string | number): void {
        fs.chmodSync(filePath, mode);
    }

    static accessSync(filePath: string, mode?: number): void {
        fs.accessSync(filePath, mode);
    }

    static createReadStream(filePath: string, options?: any): fs.ReadStream {
        return fs.createReadStream(filePath, options);
    }

    static createWriteStream(filePath: string, options?: any): fs.WriteStream {
        return fs.createWriteStream(filePath, options);
    }
}
