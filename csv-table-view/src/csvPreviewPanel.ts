/**
 * CSV Preview Panel - Webview-based preview for CSV files
 * Similar to Markdown preview in VS Code
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { detectDelimiter, getDelimiterName } from './utils/delimiter';
import { parseCSV, getSample, validateCSV, estimateRowCount } from './utils/csvParser';

export class CsvPreviewPanel {
  public static currentPanel: CsvPreviewPanel | undefined;
  private static readonly viewType = 'csvPreview';

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private disposables: vscode.Disposable[] = [];
  private currentUri: vscode.Uri | undefined;

  public static createOrShow(extensionUri: vscode.Uri, uri?: vscode.Uri, viewColumn?: vscode.ViewColumn) {
    const column = viewColumn || vscode.ViewColumn.Beside;

    // If we already have a panel, show it
    if (CsvPreviewPanel.currentPanel) {
      CsvPreviewPanel.currentPanel.panel.reveal(column);
      if (uri) {
        CsvPreviewPanel.currentPanel.updateContent(uri);
      }
      return;
    }

    // Otherwise, create a new panel
    const panel = vscode.window.createWebviewPanel(
      CsvPreviewPanel.viewType,
      'CSV Preview',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'media')
        ]
      }
    );

    CsvPreviewPanel.currentPanel = new CsvPreviewPanel(panel, extensionUri, uri);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, uri?: vscode.Uri) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.currentUri = uri;

    // Set the webview's initial html content
    this.panel.webview.html = this.getHtmlForWebview(this.panel.webview);

    // Listen for when the panel is disposed
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    // Handle messages from the webview
    this.panel.webview.onDidReceiveMessage(
      async message => {
        switch (message.type) {
          case 'refresh':
            if (this.currentUri) {
              await this.updateContent(this.currentUri);
            }
            break;
          case 'loadMore':
            if (this.currentUri) {
              await this.loadMoreRows(this.currentUri, message.currentRows);
            }
            break;
          case 'copyToClipboard':
            await vscode.env.clipboard.writeText(message.text);
            vscode.window.showInformationMessage('Copied to clipboard');
            break;
          case 'openAsText':
            if (this.currentUri) {
              await vscode.window.showTextDocument(this.currentUri);
            }
            break;
        }
      },
      null,
      this.disposables
    );

    // Update content if URI provided
    if (uri) {
      this.updateContent(uri);
    }
  }

  private async updateContent(uri: vscode.Uri) {
    this.currentUri = uri;
    const fileName = path.basename(uri.fsPath);
    this.panel.title = `Preview: ${fileName}`;

    try {
      await this.loadCsvFile(uri);
    } catch (error: any) {
      this.showError(error.message || 'Failed to load CSV file');
    }
  }

  private async loadCsvFile(uri: vscode.Uri): Promise<void> {
    try {
      // Check file size
      const stat = await vscode.workspace.fs.stat(uri);
      const maxFileSize = 100 * 1024 * 1024; // 100MB
      
      if (stat.size > maxFileSize) {
        this.showError(
          `File is too large (${(stat.size / 1024 / 1024).toFixed(2)}MB). Maximum size is 100MB.`
        );
        return;
      }

      // Read file content
      const content = await vscode.workspace.fs.readFile(uri);
      const textContent = Buffer.from(content).toString('utf8');

      if (!textContent || textContent.trim().length === 0) {
        this.showError('File is empty');
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
        this.showError(validation.message || 'Invalid CSV format');
        return;
      }

      // Estimate total rows
      const estimatedTotal = estimateRowCount(textContent);

      // Send data to webview
      this.panel.webview.postMessage({
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
      this.showError(`Failed to load CSV: ${error.message}`);
    }
  }

  private async loadMoreRows(uri: vscode.Uri, currentRows: number): Promise<void> {
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

      this.panel.webview.postMessage({
        type: 'moreRows',
        data: {
          rows: newRows,
          hasMore: parseResult.totalRows >= currentRows + batchSize
        }
      });
    } catch (error: any) {
      this.panel.webview.postMessage({
        type: 'error',
        message: `Failed to load more rows: ${error.message}`
      });
    }
  }

  private showError(message: string): void {
    this.panel.webview.postMessage({
      type: 'error',
      message: message
    });
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'styles.css')
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'script.js')
    );

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <link href="${styleUri}" rel="stylesheet">
  <title>CSV Preview</title>
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

  public dispose() {
    CsvPreviewPanel.currentPanel = undefined;

    this.panel.dispose();

    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
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
