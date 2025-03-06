import * as vscode from 'vscode';

export class JsonEditorProvider implements vscode.CustomTextEditorProvider {
    constructor(
        private readonly context: vscode.ExtensionContext
    ) { }

    public async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.context.extensionUri]
        };

        webviewPanel.webview.html = this.getHtmlContent(webviewPanel.webview);

        webviewPanel.webview.onDidReceiveMessage(message => {
            this.onMessage(message);
        });

        this.updateContent(document, webviewPanel);

        const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() === document.uri.toString()) {
                this.updateContent(e.document, webviewPanel);
            }
        });

        webviewPanel.onDidDispose(() => {
            changeDocumentSubscription.dispose();
        });
    }

    private updateContent(document: vscode.TextDocument, webviewPanel: vscode.WebviewPanel): void {
        webviewPanel.webview.postMessage({
            type: 'update',
            content: document.getText()
        });
    }

    private getHtmlContent(webview: vscode.Webview): string {
        const monacoUri = webview.asWebviewUri(vscode.Uri.joinPath(
            this.context.extensionUri,
            'node_modules',
            'monaco-editor',
            'min',
            'vs'
        ));

        return `
            <!DOCTYPE html>
            <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <link rel="stylesheet" data-name="vs/editor/editor.main" href="${monacoUri}/editor/editor.main.css">
                    <style>
                        body {
                            padding: 0;
                            margin: 0;
                        }
                        .editor-container {
                            height: 100vh;
                            display: flex;
                            flex-direction: column;
                        }
                        .toolbar {
                            padding: 8px;
                            display: flex;
                            gap: 8px;
                            background: var(--vscode-editor-background);
                        }
                        .toolbar button {
                            padding: 4px 8px;
                            background: var(--vscode-button-background);
                            color: var(--vscode-button-foreground);
                            border: none;
                            border-radius: 2px;
                            cursor: pointer;
                        }
                        .toolbar button:hover {
                            background: var(--vscode-button-hoverBackground);
                        }
                    </style>
                </head>
                <body>
                    <div class="editor-container">
                        <div class="toolbar">
                            <button id="expandAll">Expand All</button>
                            <button id="collapseAll">Collapse All</button>
                        </div>
                        <div id="editor" style="width:100%;height:100%;"></div>
                    </div>
                    <script src="${monacoUri}/loader.js"></script>
                    <script src="${monacoUri}/editor/editor.main.nls.js"></script>
                    <script src="${monacoUri}/editor/editor.main.js"></script>
                    <script>
                        const vscode = acquireVsCodeApi();
                        require.config({ paths: { vs: '${monacoUri.toString()}' }});
                        require(['vs/editor/editor.main'], function() {
                            const editor = monaco.editor.create(document.getElementById('editor'), {
                                value: '',
                                language: 'json',
                                automaticLayout: true,
                                minimap: { enabled: false },
                                useVim: true // Enable vim mode support
                            });

                            // Enable VS Code vim extension integration
                            window.addEventListener('message', event => {
                                const message = event.data;
                                if (message.type === 'update') {
                                    editor.setValue(message.content);
                                }
                            });

                            editor.onDidChangeModelContent(() => {
                                vscode.postMessage({
                                    type: 'edit',
                                    content: editor.getValue()
                                });
                            });

                            document.getElementById('expandAll').addEventListener('click', () => {
                                vscode.postMessage({ type: 'expandAll' });
                            });
                            document.getElementById('collapseAll').addEventListener('click', () => {
                                vscode.postMessage({ type: 'collapseAll' });
                            });
                        });
                    </script>
                </body>
            </html>
        `;
    }

    private onMessage(message: any): void {
        switch (message.type) {
            case 'expandAll':
                vscode.commands.executeCommand('editor.unfoldAll');
                break;
            case 'collapseAll':
                vscode.commands.executeCommand('editor.foldAll');
                break;
            case 'edit':
                // Handle edit messages if needed
                break;
        }
    }
}
