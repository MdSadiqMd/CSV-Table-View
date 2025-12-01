/**
 * CSV Table View Extension
 * Beautiful, interactive CSV viewer for VS Code and Cursor
 */

import * as vscode from 'vscode';
import { CsvPreviewPanel } from './csvPreviewPanel';

export function activate(context: vscode.ExtensionContext) {
    console.log('CSV Table View extension is now active');

    // Register command to preview CSV in current column
    const previewCommand = vscode.commands.registerCommand(
        'csv-table-view.preview',
        async (uri?: vscode.Uri) => {
            // Get the URI of the file to preview
            if (!uri) {
                const activeEditor = vscode.window.activeTextEditor;
                if (activeEditor) {
                    uri = activeEditor.document.uri;
                }
            }

            if (!uri) {
                vscode.window.showErrorMessage('No CSV file to preview');
                return;
            }

            // Check if it's a CSV/TSV file
            const fileName = uri.fsPath.toLowerCase();
            if (!fileName.endsWith('.csv') && !fileName.endsWith('.tsv')) {
                vscode.window.showErrorMessage('File is not a CSV or TSV file');
                return;
            }

            // Create or show the preview panel
            CsvPreviewPanel.createOrShow(context.extensionUri, uri, vscode.ViewColumn.Active);
        }
    );

    context.subscriptions.push(previewCommand);

    // Register command to preview CSV to the side
    const previewToSideCommand = vscode.commands.registerCommand(
        'csv-table-view.previewToSide',
        async (uri?: vscode.Uri) => {
            // Get the URI of the file to preview
            if (!uri) {
                const activeEditor = vscode.window.activeTextEditor;
                if (activeEditor) {
                    uri = activeEditor.document.uri;
                }
            }

            if (!uri) {
                vscode.window.showErrorMessage('No CSV file to preview');
                return;
            }

            // Check if it's a CSV/TSV file
            const fileName = uri.fsPath.toLowerCase();
            if (!fileName.endsWith('.csv') && !fileName.endsWith('.tsv')) {
                vscode.window.showErrorMessage('File is not a CSV or TSV file');
                return;
            }

            // Create or show the preview panel to the side
            CsvPreviewPanel.createOrShow(context.extensionUri, uri, vscode.ViewColumn.Beside);
        }
    );

    context.subscriptions.push(previewToSideCommand);
}

export function deactivate() {
    console.log('CSV Table View extension deactivated');
}
