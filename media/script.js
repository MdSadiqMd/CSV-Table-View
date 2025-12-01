/**
 * CSV Table View - Webview Script
 * Handles rendering, virtual scrolling, search, and user interactions
 */

(function () {
    const vscode = acquireVsCodeApi();

    // State
    let csvData = {
        headers: [],
        rows: [],
        totalRows: 0,
        estimatedTotal: 0,
        delimiter: '',
        fileName: '',
        fileSize: 0,
        hasMore: false
    };

    let searchTerm = '';
    let filteredRows = [];
    let virtualState = {
        scrollTop: 0,
        visibleStart: 0,
        visibleEnd: 0,
        rowHeight: 36,
        overscan: 10,
        containerHeight: 0
    };

    // DOM elements
    const tableContainer = document.getElementById('tableContainer');
    const tableBody = document.getElementById('tableBody');
    const tableHeader = document.getElementById('tableHeader');
    const searchInput = document.getElementById('searchInput');
    const statsEl = document.getElementById('stats');
    const loadingContainer = document.getElementById('loadingContainer');
    const errorContainer = document.getElementById('errorContainer');
    const errorText = document.getElementById('errorText');
    const refreshBtn = document.getElementById('refreshBtn');
    const openAsTextBtn = document.getElementById('openAsTextBtn');
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    const loadMoreContainer = document.getElementById('loadMoreContainer');

    // Initialize
    function init() {
        setupEventListeners();
        showLoading();
    }

    function setupEventListeners() {
        // Search
        searchInput?.addEventListener('input', handleSearch);

        // Buttons
        refreshBtn?.addEventListener('click', () => {
            vscode.postMessage({ type: 'refresh' });
            showLoading();
        });

        openAsTextBtn?.addEventListener('click', () => {
            vscode.postMessage({ type: 'openAsText' });
        });

        loadMoreBtn?.addEventListener('click', () => {
            loadMoreBtn.disabled = true;
            loadMoreBtn.textContent = 'Loading...';
            vscode.postMessage({ type: 'loadMore', currentRows: csvData.rows.length });
        });

        // Scroll handling with throttle
        const tableWrapper = tableContainer?.querySelector('.table-wrapper');
        if (tableWrapper) {
            let scrollTimeout;
            tableWrapper.addEventListener('scroll', () => {
                if (scrollTimeout) {
                    clearTimeout(scrollTimeout);
                }
                scrollTimeout = setTimeout(() => {
                    handleScroll(tableWrapper);
                }, 16); // ~60fps
            });

            // Update container height on resize
            const resizeObserver = new ResizeObserver(() => {
                virtualState.containerHeight = tableWrapper.clientHeight;
                renderVirtualRows();
            });
            resizeObserver.observe(tableWrapper);
        }

        // Cell hover for tooltips
        document.addEventListener('mouseover', handleCellHover);
        document.addEventListener('mouseout', handleCellHoverOut);

        // Context menu for copy
        document.addEventListener('contextmenu', handleContextMenu);
    }

    // Message handling
    window.addEventListener('message', (event) => {
        const message = event.data;

        switch (message.type) {
            case 'csvData':
                handleCsvData(message.data);
                break;
            case 'moreRows':
                handleMoreRows(message.data);
                break;
            case 'error':
                showError(message.message);
                break;
        }
    });

    function handleCsvData(data) {
        csvData = data;
        filteredRows = csvData.rows;
        searchInput.value = '';
        searchTerm = '';

        renderTable();
        updateStats();
        hideLoading();
        showTable();

        // Show/hide load more button
        if (csvData.hasMore) {
            loadMoreContainer.classList.remove('hidden');
        } else {
            loadMoreContainer.classList.add('hidden');
        }
    }

    function handleMoreRows(data) {
        csvData.rows = csvData.rows.concat(data.rows);
        csvData.totalRows = csvData.rows.length;
        csvData.hasMore = data.hasMore;

        // Re-apply search if active
        if (searchTerm) {
            applySearch(searchTerm);
        } else {
            filteredRows = csvData.rows;
        }

        renderVirtualRows();
        updateStats();

        loadMoreBtn.disabled = false;
        loadMoreBtn.textContent = 'Load More Rows';

        if (!csvData.hasMore) {
            loadMoreContainer.classList.add('hidden');
        }
    }

    function renderTable() {
        renderHeader();
        renderVirtualRows();
    }

    function renderHeader() {
        if (!tableHeader) return;

        const headerRow = document.createElement('tr');

        // Row number header
        const rowNumHeader = document.createElement('th');
        rowNumHeader.className = 'row-number-header';
        rowNumHeader.textContent = '#';
        rowNumHeader.title = 'Row Number';
        headerRow.appendChild(rowNumHeader);

        // Data headers
        csvData.headers.forEach((header, index) => {
            const th = document.createElement('th');
            th.textContent = header || `Column ${index + 1}`;
            th.title = header || `Column ${index + 1}`;
            th.dataset.columnIndex = index;
            headerRow.appendChild(th);
        });

        tableHeader.innerHTML = '';
        tableHeader.appendChild(headerRow);
    }

    function renderVirtualRows() {
        if (!tableBody || filteredRows.length === 0) return;

        const tableWrapper = tableContainer.querySelector('.table-wrapper');

        // For sticky headers to work properly, render all rows
        // Virtual scrolling with spacers breaks sticky positioning
        // Browser handles scrolling performance natively for reasonable row counts
        const fragment = document.createDocumentFragment();

        // Render all filtered rows
        for (let i = 0; i < filteredRows.length; i++) {
            const row = filteredRows[i];
            const tr = createRowElement(row, i);
            fragment.appendChild(tr);
        }

        tableBody.innerHTML = '';
        tableBody.appendChild(fragment);
    }

    function createRowElement(row, rowIndex) {
        const tr = document.createElement('tr');
        tr.dataset.rowIndex = rowIndex;

        // Row number cell
        const rowNumCell = document.createElement('td');
        rowNumCell.className = 'row-number';
        rowNumCell.textContent = rowIndex + 1;
        tr.appendChild(rowNumCell);

        // Data cells
        row.forEach((cell, colIndex) => {
            const td = document.createElement('td');
            const cellText = cell || '';

            // Highlight search matches
            if (searchTerm && cellText.toLowerCase().includes(searchTerm.toLowerCase())) {
                td.innerHTML = highlightSearchTerm(cellText, searchTerm);
            } else {
                td.textContent = cellText;
            }

            td.title = cellText; // Tooltip for truncated text
            td.dataset.columnIndex = colIndex;
            td.dataset.fullText = cellText;
            tr.appendChild(td);
        });

        return tr;
    }

    function highlightSearchTerm(text, term) {
        if (!term) return escapeHtml(text);

        const regex = new RegExp(`(${escapeRegExp(term)})`, 'gi');
        return escapeHtml(text).replace(regex, '<span class="search-match">$1</span>');
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function handleScroll(tableWrapper) {
        // No need to re-render on scroll since we're rendering all rows
        // Sticky headers work natively with this approach
        virtualState.scrollTop = tableWrapper.scrollTop;
    }

    function handleSearch(e) {
        searchTerm = e.target.value.trim();
        applySearch(searchTerm);
    }

    function applySearch(term) {
        if (!term) {
            filteredRows = csvData.rows;
        } else {
            const lowerTerm = term.toLowerCase();
            filteredRows = csvData.rows.filter(row =>
                row.some(cell => cell && cell.toLowerCase().includes(lowerTerm))
            );
        }

        // Reset scroll position
        const tableWrapper = tableContainer.querySelector('.table-wrapper');
        if (tableWrapper) {
            tableWrapper.scrollTop = 0;
            virtualState.scrollTop = 0;
        }

        renderVirtualRows();
        updateStats();
    }

    function handleCellHover(e) {
        const cell = e.target.closest('td, th');
        if (!cell) return;

        const fullText = cell.dataset.fullText || cell.textContent;

        // Only show tooltip if text is truncated
        if (cell.scrollWidth > cell.clientWidth) {
            showTooltip(fullText, e.pageX, e.pageY);
        }
    }

    function handleCellHoverOut(e) {
        const cell = e.target.closest('td, th');
        if (cell) {
            hideTooltip();
        }
    }

    let tooltipElement = null;

    function showTooltip(text, x, y) {
        hideTooltip();

        tooltipElement = document.createElement('div');
        tooltipElement.className = 'tooltip';
        tooltipElement.textContent = text;
        tooltipElement.style.left = `${x + 10}px`;
        tooltipElement.style.top = `${y + 10}px`;
        document.body.appendChild(tooltipElement);
    }

    function hideTooltip() {
        if (tooltipElement) {
            tooltipElement.remove();
            tooltipElement = null;
        }
    }

    function handleContextMenu(e) {
        const cell = e.target.closest('td');
        if (!cell) return;

        e.preventDefault();

        const text = cell.dataset.fullText || cell.textContent;

        // Show custom context menu (simplified - using native clipboard API)
        navigator.clipboard.writeText(text).then(() => {
            vscode.postMessage({
                type: 'copyToClipboard',
                text: text
            });
        }).catch(err => {
            console.error('Failed to copy:', err);
        });
    }

    function updateStats() {
        if (!statsEl) return;

        const displayedRows = filteredRows.length;
        const totalRows = csvData.totalRows;
        const searchInfo = searchTerm ? ` (filtered from ${totalRows})` : '';
        const moreInfo = csvData.hasMore ? ` • ${csvData.estimatedTotal}+ total` : '';
        const sizeInfo = csvData.fileSize ? ` • ${formatFileSize(csvData.fileSize)}` : '';

        statsEl.textContent = `${displayedRows} rows${searchInfo}${moreInfo} • ${csvData.headers.length} columns${sizeInfo} • Delimiter: ${csvData.delimiter}`;
    }

    function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function showLoading() {
        loadingContainer?.classList.remove('hidden');
        tableContainer?.classList.add('hidden');
        errorContainer?.classList.add('hidden');
    }

    function hideLoading() {
        loadingContainer?.classList.add('hidden');
    }

    function showTable() {
        tableContainer?.classList.remove('hidden');
        errorContainer?.classList.add('hidden');
    }

    function showError(message) {
        hideLoading();
        tableContainer?.classList.add('hidden');
        errorContainer?.classList.remove('hidden');
        if (errorText) {
            errorText.textContent = message;
        }
    }

    // Initialize on load
    init();
})();

