import * as vscode from 'vscode';
import * as zlib from 'zlib';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { detectLanguageFromFileName, getLanguageId } from './utils/language-detection';
import { JsonEditorProvider } from './editors/jsonEditor';

const brotliDecompress = promisify(zlib.brotliDecompress);
const logger = vscode.window.createOutputChannel('Compressed Files Visualizer');

/**
 * Format bytes to KB string
 */
function formatBytesToKB(bytes: number): string {
    return `${(bytes / 1024).toFixed(2)} KB`;
}

/**
 * Content provider for decompressed brotli files
 */
class CompressedContentProvider implements vscode.TextDocumentContentProvider {
    // Emitter and event for when the content changes
    private onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
    public readonly onDidChange = this.onDidChangeEmitter.event;

    // Cache for decompressed content
    private contentCache = new Map<string, string>();

    // Semaphore to prevent concurrent processing of the same file
    private processingFiles = new Set<string>();

    /**
     * Method called by VS Code to get content for a document
     */
    async provideTextDocumentContent(uri: vscode.Uri, token: vscode.CancellationToken): Promise<string> {
        const originalUri = this.getOriginalUri(uri);
        const cachedContent = this.contentCache.get(originalUri.fsPath);

        if (cachedContent) {
            return cachedContent;
        }

        // Check if file is already being processed
        if (this.processingFiles.has(originalUri.fsPath)) {
            // Wait a bit and check cache again (another call is decompressing it)
            await new Promise(resolve => setTimeout(resolve, 100));
            const delayedCache = this.contentCache.get(originalUri.fsPath);
            if (delayedCache) {
                return delayedCache;
            }
            // If still not available, show a temporary message
            return "Decompressing brotli file, please wait...";
        }

        // Mark file as being processed
        this.processingFiles.add(originalUri.fsPath);

        try {
            logger.appendLine(`Reading brotli file: ${originalUri.fsPath}`);

            // Read and decompress the brotli file
            const compressed = await fs.promises.readFile(originalUri.fsPath);
            if (token.isCancellationRequested) {
                return "Operation cancelled";
            }

            logger.appendLine(`Read ${formatBytesToKB(compressed.length)}`);
            const decompressed = await brotliDecompress(compressed);
            if (token.isCancellationRequested) {
                return "Operation cancelled";
            }

            // Calculate and log compression details
            const compressionPercentage = this.calculateCompressionPercentage(
                compressed.length,
                decompressed.length
            );
            logger.appendLine(
                `Decompressed to ${formatBytesToKB(decompressed.length)} ` +
                `(compression: ${compressionPercentage}% - ` +
                `original size reduced by ${100 - compressionPercentage}%)`
            );

            // Convert buffer to string
            const content = decompressed.toString('utf-8');

            // Cache the content
            this.contentCache.set(originalUri.fsPath, content);

            return content;
        } catch (error) {
            logger.appendLine(`Error decompressing brotli file: ${error}`);
            return `Error decompressing brotli file: ${error}`;
        } finally {
            // Remove the file from processing set
            this.processingFiles.delete(originalUri.fsPath);
        }
    }

    /**
     * Gets the original URI from a brotli: URI
     */
    private getOriginalUri(uri: vscode.Uri): vscode.Uri {
        // The path is encoded in the query parameter
        return vscode.Uri.parse(decodeURIComponent(uri.query));
    }

    /**
     * Calculate compression percentage
     */
    private calculateCompressionPercentage(compressedSize: number, decompressedSize: number): number {
        if (decompressedSize === 0) return 0;
        const percentage = (compressedSize / decompressedSize) * 100;
        return Math.round(percentage * 100) / 100; // Round to 2 decimal places
    }

    /**
     * Invalidate cached content
     */
    public invalidate(uri: vscode.Uri): void {
        const originalUri = this.getOriginalUri(uri);
        this.contentCache.delete(originalUri.fsPath);
        this.onDidChangeEmitter.fire(uri);
    }
}

/**
 * Command handler for opening brotli files with VS Code's native editor
 */
async function openBrotliFile(uri: vscode.Uri) {
    logger.appendLine(`Opening brotli file: ${uri.fsPath}`);
    try {
        // Get original file name (without .br extension)
        const originalFileName = uri.fsPath.endsWith('.br')
            ? uri.fsPath.slice(0, -3)
            : uri.fsPath;

        // Create a virtual document URI with the brotli scheme
        const virtualDocumentUri = vscode.Uri.parse(
            `brotli:${path.basename(originalFileName)}?${encodeURIComponent(uri.toString())}`
        );

        // Open the virtual document
        const document = await vscode.workspace.openTextDocument(virtualDocumentUri);

        // Get the best language ID based on the original file extension
        const languageId = getLanguageIdFromFileName(originalFileName);

        // Show the document in the editor with proper language mode
        const editor = await vscode.window.showTextDocument(document);

        // Apply language mode if detected
        if (languageId && languageId !== 'plaintext') {
            await vscode.languages.setTextDocumentLanguage(document, languageId);
            logger.appendLine(`Set language mode to: ${languageId}`);
        }

        // Show information about the file
        const stats = await fs.promises.stat(uri.fsPath);
        vscode.window.setStatusBarMessage(
            `Brotli: ${formatBytesToKB(stats.size)} compressed → ${formatBytesToKB(Buffer.byteLength(document.getText()))} decompressed`,
            5000
        );
    } catch (error) {
        logger.appendLine(`Error opening brotli file: ${error}`);
        vscode.window.showErrorMessage(`Failed to open brotli file: ${error}`);
    }
}

/**
 * Returns the language ID based on file name/extension
 */
function getLanguageIdFromFileName(fileName: string): string {
    // Use our utility function from the imported module
    return detectLanguageFromFileName(fileName);
}

export function activate(context: vscode.ExtensionContext) {
    logger.appendLine('Compressed Files Visualizer extension activating...');

    // Register the content provider for our custom URI scheme
    const contentProvider = new CompressedContentProvider();
    const providerRegistration = vscode.workspace.registerTextDocumentContentProvider('compressed', contentProvider);
    context.subscriptions.push(providerRegistration);

    // Register JSON editor provider for compressed JSON files
    const jsonEditorProvider = new JsonEditorProvider(context);
    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider(
            'compressedViewer.json',
            jsonEditorProvider,
            {
                webviewOptions: { retainContextWhenHidden: true },
                supportsMultipleEditorsPerDocument: false
            }
        )
    );

    // Register commands
    const commandHandler = vscode.commands.registerCommand('compressedViewer.openCompressedFile', async (uri: vscode.Uri) => {
        try {
            const originalFileName = uri.fsPath.slice(0, -3); // Remove .br extension
            if (originalFileName.endsWith('.json')) {
                // For JSON files, use the custom editor
                const virtualUri = vscode.Uri.parse(
                    `compressed-json:${path.basename(originalFileName)}?${encodeURIComponent(uri.toString())}`
                );
                await vscode.commands.executeCommand('vscode.openWith', virtualUri, 'compressedViewer.json');
            } else {
                // For other files, use the regular text document viewer
                await openBrotliFile(uri);
            }
        } catch (error) {
            logger.appendLine(`Error opening compressed file: ${error}`);
            vscode.window.showErrorMessage(`Failed to open compressed file: ${error}`);
        }
    });
    context.subscriptions.push(commandHandler);

    // Register a file system watcher to refresh content when the original file changes
    const watcher = vscode.workspace.createFileSystemWatcher('**/*.br');
    watcher.onDidChange(uri => {
        const virtualUri = vscode.Uri.parse(
            `brotli:${path.basename(uri.fsPath.slice(0, -3))}?${encodeURIComponent(uri.toString())}`
        );
        contentProvider.invalidate(virtualUri);
    });
    context.subscriptions.push(watcher);

    // Register the output channel
    context.subscriptions.push(logger);

    logger.appendLine('Compressed Files Visualizer extension activated successfully');
}

export function deactivate() {
    logger.appendLine('Compressed Files Visualizer extension deactivated');
}