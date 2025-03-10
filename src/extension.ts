import * as vscode from 'vscode';
import * as brotli from 'brotli';
import * as path from 'path';
import * as fs from 'fs';

// Create output channel for logging
let outputChannel: vscode.OutputChannel;
let statusBarItem: vscode.StatusBarItem;

// Custom editor provider for .br files
export class BrotliEditorProvider implements vscode.CustomReadonlyEditorProvider {
  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    outputChannel.appendLine('Registering BrotliEditorProvider');
    
    const provider = new BrotliEditorProvider(context);
    const providerRegistration = vscode.window.registerCustomEditorProvider(
      'compressedFilesVisualizer.brViewer',
      provider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
        supportsMultipleEditorsPerDocument: false,
      }
    );
    
    return providerRegistration;
  }

  constructor(private readonly context: vscode.ExtensionContext) {}

  async openCustomDocument(
    uri: vscode.Uri,
    openContext: vscode.CustomDocumentOpenContext,
    token: vscode.CancellationToken
  ): Promise<vscode.CustomDocument> {
    outputChannel.appendLine(`Opening document: ${uri.fsPath}`);
    return { uri, dispose: () => {} };
  }

  async resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel,
    token: vscode.CancellationToken
  ): Promise<void> {
    const uri = document.uri;
    outputChannel.appendLine(`Resolving editor for: ${uri.fsPath}`);
    
    try {
      // Update status bar
      this.updateStatusBar(uri.fsPath);
      
      // Read the .br file
      const compressedData = await fs.promises.readFile(uri.fsPath);
      outputChannel.appendLine(`Read ${compressedData.length} bytes of compressed data`);
      
      // Decompress the brotli data
      const decompressedBuffer = Buffer.from(brotli.decompress(compressedData));
      const compressionRatio = ((1 - (compressedData.length / decompressedBuffer.length)) * 100).toFixed(1);
      outputChannel.appendLine(`Decompressed to ${decompressedBuffer.length} bytes (${compressionRatio}% compression)`);
      
      // Get the original file extension by removing the .br extension
      const originalFileName = path.basename(uri.fsPath, '.br');
      const originalExt = path.extname(originalFileName);
      
      outputChannel.appendLine(`Original filename: ${originalFileName}, extension: ${originalExt}`);
      
      // Determine content type and language based on extension
      let language = this.getLanguageForExtension(originalExt);
      let decompressedText = '';
      
      // Only convert to text if it's not likely binary content
      if (!this.isBinaryContent(decompressedBuffer)) {
        decompressedText = decompressedBuffer.toString('utf-8');
      }
      
      // If no extension or it's not recognized, try to detect based on content
      if (!originalExt || language === 'plaintext') {
        const detectedLanguage = this.detectLanguageFromContent(decompressedText);
        if (detectedLanguage) {
          language = detectedLanguage;
          outputChannel.appendLine(`No extension or unrecognized extension, detected language: ${language}`);
        }
      }
      
      // Update the webview content
      webviewPanel.webview.options = {
        enableScripts: true
      };
      
      // Set the editor title to include original file type
      webviewPanel.title = path.basename(originalFileName);
      
      if (this.isBinaryContent(decompressedBuffer)) {
        outputChannel.appendLine('Detected binary content, showing hex view');
        // For binary content, show a hex dump
        webviewPanel.webview.html = this.getHexViewHtml(decompressedBuffer, originalFileName);
      } else {
        outputChannel.appendLine(`Showing text content with language: ${language}`);
        // For text content, show syntax highlighted text
        webviewPanel.webview.html = this.getTextViewHtml(decompressedText, language, originalFileName);
      }
    } catch (error) {
      outputChannel.appendLine(`Error: ${error}`);
      webviewPanel.webview.html = this.getErrorHtml(`Failed to decompress file: ${error}`);
    }
  }
  
  private updateStatusBar(filePath: string) {
    if (statusBarItem) {
      const fileName = path.basename(filePath);
      statusBarItem.text = `$(file-binary) ${fileName}`;
      statusBarItem.tooltip = `Brotli compressed file: ${filePath}`;
      statusBarItem.show();
    }
  }
  
  private getLanguageForExtension(ext: string): string {
    const mapping: Record<string, string> = {
      '.js': 'javascript',
      '.ts': 'typescript',
      '.tsx': 'typescriptreact',
      '.jsx': 'javascriptreact',
      '.json': 'json',
      '.html': 'html',
      '.htm': 'html',
      '.css': 'css',
      '.scss': 'scss',
      '.less': 'less',
      '.md': 'markdown',
      '.xml': 'xml',
      '.svg': 'xml',
      '.py': 'python',
      '.java': 'java',
      '.c': 'c',
      '.h': 'c',
      '.cpp': 'cpp',
      '.hpp': 'cpp',
      '.cs': 'csharp',
      '.go': 'go',
      '.rs': 'rust',
      '.rb': 'ruby',
      '.php': 'php',
      '.sh': 'shell',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.txt': 'plaintext',
      '.sql': 'sql',
      '.swift': 'swift',
      '.dart': 'dart',
      '.kotlin': 'kotlin',
      '.lua': 'lua',
      '.r': 'r',
      '.graphql': 'graphql',
      '.vue': 'vue',
      '.dockerfile': 'dockerfile',
      '.tf': 'terraform'
    };
    
    return mapping[ext.toLowerCase()] || 'plaintext';
  }
  
  private detectLanguageFromContent(content: string): string | undefined {
    if (!content || content.length < 50) {
      return undefined;
    }
    
    // Simple heuristics to detect common file types based on content
    if (content.trimStart().startsWith('<?xml')) {
      return 'xml';
    } else if (content.trimStart().startsWith('{') && content.trimEnd().endsWith('}')) {
      try {
        JSON.parse(content);
        return 'json';
      } catch {
        // Not valid JSON
      }
    } else if (content.includes('<!DOCTYPE html>') || content.includes('<html')) {
      return 'html';
    } else if (content.includes('function ') && content.includes('var ')) {
      return 'javascript';
    } else if (content.includes('import React') || content.includes('from "react"')) {
      return 'javascriptreact';
    } else if (content.includes('#include <')) {
      return 'cpp';
    }
    
    return undefined;
  }
  
  private isBinaryContent(buffer: Buffer): boolean {
    // Check if the buffer might be binary content
    // This is a simple heuristic that checks for null bytes or a high percentage of non-ASCII chars
    const nonPrintable = buffer.slice(0, Math.min(buffer.length, 1000)).filter(byte => 
      byte === 0 || (byte < 32 && ![9, 10, 13].includes(byte)) || byte >= 127
    ).length;
    
    // If more than 10% of the first 1000 bytes are non-printable, consider it binary
    return nonPrintable > Math.min(buffer.length, 1000) * 0.1;
  }
  
  private getTextViewHtml(content: string, language: string, fileName: string): string {
    // Escape the content to prevent HTML injection
    const escapedContent = this.escapeHtml(content);
    
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${fileName}</title>
        <style>
          body {
            padding: 0;
            margin: 0;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size);
          }
          pre {
            white-space: pre-wrap;
            word-wrap: break-word;
            padding: 10px;
            margin: 0;
          }
          .file-info {
            background: var(--vscode-editor-lineHighlightBackground);
            padding: 8px;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            border-bottom: 1px solid var(--vscode-editorGroup-border);
          }
        </style>
      </head>
      <body>
        <div class="file-info">Brotli decompressed file: ${fileName} • Language: ${language}</div>
        <pre data-language="${language}">${escapedContent}</pre>
      </body>
      </html>
    `;
  }
  
  private getHexViewHtml(buffer: Buffer, fileName: string): string {
    const hexRows = [];
    for (let i = 0; i < buffer.length; i += 16) {
      const chunk = buffer.slice(i, i + 16);
      const hexValues = Array.from(chunk).map(byte => byte.toString(16).padStart(2, '0')).join(' ');
      const asciiValues = Array.from(chunk).map(byte => 
        (byte >= 32 && byte <= 126) ? String.fromCharCode(byte) : '.'
      ).join('');
      
      hexRows.push(`
        <div class="hex-row">
          <span class="offset">${i.toString(16).padStart(8, '0')}</span>
          <span class="hex-values">${hexValues.padEnd(48, ' ')}</span>
          <span class="ascii-values">${asciiValues}</span>
        </div>
      `);
    }
    
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Binary Hex View: ${fileName}</title>
        <style>
          body {
            padding: 0;
            margin: 0;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            font-family: 'Courier New', monospace;
            font-size: var(--vscode-editor-font-size);
          }
          .file-info {
            font-family: var(--vscode-font-family);
            background: var(--vscode-editor-lineHighlightBackground);
            padding: 8px;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            border-bottom: 1px solid var(--vscode-editorGroup-border);
          }
          .hex-container {
            padding: 10px;
            white-space: pre;
          }
          .hex-row {
            margin-bottom: 4px;
          }
          .offset {
            color: var(--vscode-debugTokenExpression-name);
            margin-right: 16px;
          }
          .hex-values {
            color: var(--vscode-debugTokenExpression-value);
            margin-right: 16px;
          }
          .ascii-values {
            color: var(--vscode-debugTokenExpression-string);
          }
        </style>
      </head>
      <body>
        <div class="file-info">Brotli decompressed file: ${fileName} • Binary content (Hex view)</div>
        <div class="hex-container">
          ${hexRows.join('')}
        </div>
      </body>
      </html>
    `;
  }
  
  private getErrorHtml(message: string): string {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Error</title>
        <style>
          body {
            padding: 20px;
            margin: 0;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editorError-foreground);
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size);
          }
          .error {
            border: 1px solid var(--vscode-editorError-border);
            padding: 10px;
            border-radius: 4px;
          }
        </style>
      </head>
      <body>
        <div class="error">${this.escapeHtml(message)}</div>
      </body>
      </html>
    `;
  }
  
  private escapeHtml(content: string): string {
    return content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('Compressed Files Visualizer');
  outputChannel.appendLine('Extension activated');
  
  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  context.subscriptions.push(statusBarItem);
  
  // Register our custom editor provider
  context.subscriptions.push(BrotliEditorProvider.register(context));
  
  // Register command to show output channel
  const showLogsCommand = vscode.commands.registerCommand('compressedFilesVisualizer.showLogs', () => {
    outputChannel.show();
  });
  context.subscriptions.push(showLogsCommand);
  
  outputChannel.appendLine('Extension initialization complete');
}

export function deactivate() {
  if (statusBarItem) {
    statusBarItem.hide();
  }
  outputChannel.appendLine('Extension deactivated');
}