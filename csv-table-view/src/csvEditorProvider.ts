/**
 * Custom Editor Provider for CSV files
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { detectDelimiter, getDelimiterName } from './utils/delimiter';
import { parseCSV, getSample, validateCSV, estimateRowCount } from './utils/csvParser';

export class CsvEditorProvider implements vscode.CustomReadonlyEditorProvider {
    public static readonly viewType = 'csvTableView.csvEditor';

    private static readonly maxFileSize = 100 * 1024 * 1024; // 100MB

    constructor(private readonly context: vscode.ExtensionContext) { }

    public async openCustomDocument(
        uri: vscode.Uri,
        openContext: vscode.CustomDocumentOpenContext,
        token: vscode.CancellationToken
    ): Promise<vscode.CustomDocument> {
        return { uri, dispose: () => { } };
    }

    public async resolveCustomEditor(
        document: vscode.CustomDocument,
        webviewPanel: vscode.WebviewPanel,
        token: vscode.CancellationToken
    ): Promise<void> {
        // Configure webview
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.context.extensionUri, 'dist'),
                vscode.Uri.joinPath(this.context.extensionUri, 'media')
            ]
        };

        // Set webview HTML content
        webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

        // Load and parse CSV file
        try {
            await this.loadCsvFile(document.uri, webviewPanel.webview);
        } catch (error: any) {
            this.showError(webviewPanel.webview, error?.message || 'Unknown error');
        }

        // Handle messages from webview
        webviewPanel.webview.onDidReceiveMessage(
            async message => {
                switch (message.type) {
                    case 'refresh':
                        await this.loadCsvFile(document.uri, webviewPanel.webview);
                        break;
                    case 'loadMore':
                        await this.loadMoreRows(document.uri, webviewPanel.webview, message.currentRows);
                        break;
                    case 'copyToClipboard':
                        await vscode.env.clipboard.writeText(message.text);
                        vscode.window.showInformationMessage('Copied to clipboard');
                        break;
                    case 'openAsText':
                        await vscode.commands.executeCommand(
                            'vscode.openWith',
                            document.uri,
                            'default'
                        );
                        break;
                    case 'error':
                        vscode.window.showErrorMessage(`CSV Viewer Error: ${message.message}`);
                        break;
                }
            },
            undefined,
            []
        );

        // Watch for file changes
        const fileWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(document.uri, '*')
        );

        fileWatcher.onDidChange(async () => {
            const choice = await vscode.window.showInformationMessage(
                'CSV file has changed. Reload?',
                'Yes',
                'No'
            );
            if (choice === 'Yes') {
                await this.loadCsvFile(document.uri, webviewPanel.webview);
            }
        });

        webviewPanel.onDidDispose(() => {
            fileWatcher.dispose();
        });
    }

    private async loadCsvFile(uri: vscode.Uri, webview: vscode.Webview): Promise<void> {
        try {
            // Check file size
            const stat = await vscode.workspace.fs.stat(uri);
            if (stat.size > CsvEditorProvider.maxFileSize) {
                this.showError(
                    webview,
                    `File is too large (${(stat.size / 1024 / 1024).toFixed(2)}MB). Maximum size is 100MB.`
                );
                return;
            }

            // Read file content
            const content = await vscode.workspace.fs.readFile(uri);
            const textContent = Buffer.from(content).toString('utf8');

            if (!textContent || textContent.trim().length === 0) {
                this.showError(webview, 'File is empty');
                return;
            }

            // Get configuration
            const config = vscode.workspace.getConfiguration('csv');
            const configDelimiter = config.get<string>('delimiter', 'auto');
            const maxRows = config.get<number>('previewRowCount', 10000);

            // Detect delimiter
            const sample = getSample(textContent, 10);
            const delimiter = detectDelimiter(sample, configDelimiter);

            // Parse CSV
            const parseResult = parseCSV(textContent, {
                delimiter,
                maxRows
            });

            // Validate
            const validation = validateCSV(parseResult);
            if (!validation.valid) {
                this.showError(webview, validation.message || 'Invalid CSV format');
                return;
            }

            // Estimate total rows
            const estimatedTotal = estimateRowCount(textContent);

            // Send data to webview
            webview.postMessage({
                type: 'csvData',
                data: {
                    headers: parseResult.headers,
                    rows: parseResult.data,
                    totalRows: parseResult.totalRows,
                    estimatedTotal,
                    delimiter: getDelimiterName(delimiter),
                    fileName: path.basename(uri.fsPath),
                    fileSize: stat.size,
                    hasMore: parseResult.totalRows >= maxRows
                }
            });
        } catch (error: any) {
            this.showError(webview, `Failed to load CSV: ${error.message}`);
        }
    }

    private async loadMoreRows(
        uri: vscode.Uri,
        webview: vscode.Webview,
        currentRows: number
    ): Promise<void> {
        try {
            const content = await vscode.workspace.fs.readFile(uri);
            const textContent = Buffer.from(content).toString('utf8');

            const config = vscode.workspace.getConfiguration('csv');
            const configDelimiter = config.get<string>('delimiter', 'auto');
            const batchSize = 5000;

            const sample = getSample(textContent, 10);
            const delimiter = detectDelimiter(sample, configDelimiter);

            // Parse more rows
            const parseResult = parseCSV(textContent, {
                delimiter,
                maxRows: currentRows + batchSize
            });

            const newRows = parseResult.data.slice(currentRows);

            webview.postMessage({
                type: 'moreRows',
                data: {
                    rows: newRows,
                    hasMore: parseResult.totalRows >= currentRows + batchSize
                }
            });
        } catch (error: any) {
            webview.postMessage({
                type: 'error',
                message: `Failed to load more rows: ${error.message}`
            });
        }
    }

    private showError(webview: vscode.Webview, message: string | Error): void {
        const errorMessage = typeof message === 'string' ? message : message.message;
        webview.postMessage({
            type: 'error',
            message: errorMessage
        });
    }

    private getHtmlForWebview(webview: vscode.Webview): string {
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'styles.css')
        );
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'script.js')
        );

        const nonce = getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <link href="${styleUri}" rel="stylesheet">
  <title>CSV Table View</title>
</head>
<body>
  <div id="app">
    <div class="toolbar">
      <div class="toolbar-left">
        <button id="refreshBtn" class="btn" title="Refresh">
          <svg width="16" height="16" viewBox="0 0 16 16">
            <path fill="currentColor" d="M13.5 2.5a1 1 0 0 1 1 1v3.5a1 1 0 0 1-1 1h-3.5a.5.5 0 1 1 0-1H13V3.5a.5.5 0 0 1 .5-.5z"/>
            <path fill="currentColor" d="M13.354 3.354a.5.5 0 0 1 0 .707A7 7 0 1 1 3 8a.5.5 0 0 1 1 0 6 6 0 1 0 9.061-5.146.5.5 0 0 1 .293-.9z"/>
          </svg>
        </button>
        <button id="openAsTextBtn" class="btn" title="Open as Text">
          <svg width="16" height="16" viewBox="0 0 16 16">
            <path fill="currentColor" d="M5 2a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1H5zm0 1h6v10H5V3z"/>
            <path fill="currentColor" d="M6 5h4v1H6V5zm0 2h4v1H6V7zm0 2h3v1H6V9z"/>
          </svg>
        </button>
        <input type="text" id="searchInput" class="search-input" placeholder="Search..." />
      </div>
      <div class="toolbar-right">
        <span id="stats" class="stats"></span>
      </div>
    </div>

    <div id="errorContainer" class="error-container hidden">
      <div class="error-message">
        <span id="errorText"></span>
      </div>
    </div>

    <div id="loadingContainer" class="loading-container">
      <div class="spinner"></div>
      <div>Loading CSV...</div>
    </div>

    <div id="tableContainer" class="table-container hidden">
      <div class="table-wrapper">
        <table id="csvTable">
          <thead id="tableHeader"></thead>
          <tbody id="tableBody"></tbody>
        </table>
      </div>
      <div id="loadMoreContainer" class="load-more-container hidden">
        <button id="loadMoreBtn" class="btn btn-primary">Load More Rows</button>
      </div>
    </div>
  </div>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }
}

function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
