/**
 * CSV Table View Extension
 * Beautiful, interactive CSV viewer for VS Code and Cursor
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { CsvPreviewPanel } from './csvPreviewPanel';

export function activate(context: vscode.ExtensionContext) {
    console.log('CSV Table View: Starting activation...');

    // Register command to preview CSV in current column
    const previewCommand = vscode.commands.registerCommand(
        'csv-table-view.preview',
        async (uri?: vscode.Uri) => {
            console.log('📋 CSV Preview command triggered!');

            // Get the URI of the file to preview
            if (!uri) {
                const activeEditor = vscode.window.activeTextEditor;
                if (activeEditor) {
                    uri = activeEditor.document.uri;
                    console.log('📄 Using active editor:', uri.fsPath);
                }
            }

            if (!uri) {
                vscode.window.showErrorMessage('No CSV file to preview. Please open a CSV file first.');
                return;
            }

            // Check if it's a CSV/TSV file
            const fileName = uri.fsPath.toLowerCase();
            console.log('🔍 Checking file:', fileName);

            if (!fileName.endsWith('.csv') && !fileName.endsWith('.tsv')) {
                vscode.window.showWarningMessage(`File "${path.basename(fileName)}" is not a CSV or TSV file`);
                return;
            }

            console.log('✅ Opening CSV preview for:', fileName);
            // Create or show the preview panel
            CsvPreviewPanel.createOrShow(context.extensionUri, uri, vscode.ViewColumn.Active);
        }
    );

    context.subscriptions.push(previewCommand);
    console.log('CSV Table View: Command "csv-table-view.preview" registered');

    // Register command to preview CSV to the side
    const previewToSideCommand = vscode.commands.registerCommand(
        'csv-table-view.previewToSide',
        async (uri?: vscode.Uri) => {
            console.log('📋 CSV Preview to Side command triggered!');

            // Get the URI of the file to preview
            if (!uri) {
                const activeEditor = vscode.window.activeTextEditor;
                if (activeEditor) {
                    uri = activeEditor.document.uri;
                }
            }

            if (!uri) {
                vscode.window.showErrorMessage('No CSV file to preview. Please open a CSV file first.');
                return;
            }

            // Check if it's a CSV/TSV file
            const fileName = uri.fsPath.toLowerCase();
            if (!fileName.endsWith('.csv') && !fileName.endsWith('.tsv')) {
                vscode.window.showWarningMessage(`File "${path.basename(fileName)}" is not a CSV or TSV file`);
                return;
            }

            // Create or show the preview panel to the side
            CsvPreviewPanel.createOrShow(context.extensionUri, uri, vscode.ViewColumn.Beside);
        }
    );

    context.subscriptions.push(previewToSideCommand);
    console.log('CSV Table View: Command "csv-table-view.previewToSide" registered');

    console.log('✅ CSV Table View extension activated successfully!');
}

export function deactivate() {
    console.log('CSV Table View extension deactivated');
}
