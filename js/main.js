(function() {
    // === Data ===
    let categories = [];
    let transactions = [];
    let currentPeriod = 'month';
    let customDateFrom = null;
    let customDateTo = null;
    let folderHandle = null;
    let fileHandle = null;

    // === DOM refs ===
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const menuOverlay = document.getElementById('menuOverlay');
    const dropdownMenu = document.getElementById('dropdownMenu');
    const menuCloseBtn = document.getElementById('menuCloseBtn');

    const txType = document.getElementById('txType');
    const txCategorySelect = document.getElementById('txCategorySelect');
    const txAmount = document.getElementById('txAmount');
    const addBtn = document.getElementById('addBtn');

    const menuCategoryList = document.getElementById('menuCategoryList');
    const menuNewCategoryName = document.getElementById('menuNewCategoryName');
    const menuNewCategoryType = document.getElementById('menuNewCategoryType');
    const menuAddCategoryBtn = document.getElementById('menuAddCategoryBtn');

    const totalIncomeEl = document.getElementById('totalIncome');
    const totalExpenseEl = document.getElementById('totalExpense');
    const balanceEl = document.getElementById('balance');
    const transactionCountEl = document.getElementById('transactionCount');
    const avgIncomeEl = document.getElementById('avgIncome');
    const avgExpenseEl = document.getElementById('avgExpense');
    const maxIncomeEl = document.getElementById('maxIncome');
    const maxExpenseEl = document.getElementById('maxExpense');
    const topCategoryEl = document.getElementById('topCategory');

    const filterType = document.getElementById('filterType');
    const filterCategory = document.getElementById('filterCategory');
    const clearFiltersBtn = document.getElementById('clearFiltersBtn');

    const transactionListEl = document.getElementById('transactionList');
    const menuClearAllBtn = document.getElementById('menuClearAllBtn');

    const periodSelect = document.getElementById('periodSelect');
    const customPeriod = document.getElementById('customPeriod');
    const dateFrom = document.getElementById('dateFrom');
    const dateTo = document.getElementById('dateTo');
    const applyCustomPeriod = document.getElementById('applyCustomPeriod');

    // File operations
    const menuSelectFolderBtn = document.getElementById('menuSelectFolderBtn');
    const menuExportBtn = document.getElementById('menuExportBtn');
    const menuImportBtn = document.getElementById('menuImportBtn');
    const fileInput = document.getElementById('fileInput');
    const folderStatus = document.getElementById('folderStatus');

    // === Helpers ===
    function generateId() {
        return Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    }

    function getCategoryName(id) {
        const cat = categories.find(c => c.id === id);
        return cat ? cat.name : 'Без категории';
    }

    function getCategoryType(id) {
        const cat = categories.find(c => c.id === id);
        return cat ? cat.type : 'expense';
    }

    function getCategoriesByType(type) {
        return categories.filter(c => c.type === type);
    }

    function getDataForExport() {
        return {
            version: '1.0',
            exportedAt: new Date().toISOString(),
            categories: categories,
            transactions: transactions
        };
    }

    // === Date helpers ===
    function getDateRange(period) {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        
        let from, to;
        
        switch(period) {
            case 'all':
                return null;
            case 'month':
                from = new Date(year, month, 1);
                to = new Date(year, month + 1, 0);
                break;
            case 'lastMonth':
                from = new Date(year, month - 1, 1);
                to = new Date(year, month, 0);
                break;
            case 'quarter':
                const quarterMonth = Math.floor(month / 3) * 3;
                from = new Date(year, quarterMonth, 1);
                to = new Date(year, quarterMonth + 3, 0);
                break;
            case 'year':
                from = new Date(year, 0, 1);
                to = new Date(year, 11, 31);
                break;
            case 'custom':
                if (customDateFrom && customDateTo) {
                    from = new Date(customDateFrom);
                    to = new Date(customDateTo);
                } else {
                    return null;
                }
                break;
            default:
                return null;
        }
        
        return { from, to };
    }

    function isDateInRange(date, range) {
        if (!range) return true;
        const d = new Date(date);
        return d >= range.from && d <= range.to;
    }

    // === Menu toggle ===
    function toggleMenu(open) {
        const isOpen = typeof open === 'boolean' ? open : !dropdownMenu.classList.contains('active');
        dropdownMenu.classList.toggle('active', isOpen);
        menuOverlay.classList.toggle('active', isOpen);
        hamburgerBtn.classList.toggle('active', isOpen);
        document.body.style.overflow = isOpen ? 'hidden' : '';
    }

    hamburgerBtn.addEventListener('click', () => toggleMenu());
    menuOverlay.addEventListener('click', () => toggleMenu(false));
    menuCloseBtn.addEventListener('click', () => toggleMenu(false));

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && dropdownMenu.classList.contains('active')) {
            toggleMenu(false);
        }
    });

    // === Save/Load ===
    function saveState() {
        try {
            localStorage.setItem('fin_categories', JSON.stringify(categories));
            localStorage.setItem('fin_transactions', JSON.stringify(transactions));
            localStorage.setItem('fin_period', currentPeriod);
            localStorage.setItem('fin_custom_from', customDateFrom || '');
            localStorage.setItem('fin_custom_to', customDateTo || '');
        } catch (_) {}
        
        // Auto-save to file if folder selected
        if (folderHandle) {
            saveToFile();
        }
    }

    function loadState() {
        try {
            const savedCats = localStorage.getItem('fin_categories');
            if (savedCats) {
                const parsed = JSON.parse(savedCats);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    categories = parsed;
                }
            }
            const savedTx = localStorage.getItem('fin_transactions');
            if (savedTx) {
                const parsed = JSON.parse(savedTx);
                if (Array.isArray(parsed)) {
                    transactions = parsed;
                }
            }
            const savedPeriod = localStorage.getItem('fin_period');
            if (savedPeriod) {
                currentPeriod = savedPeriod;
            }
            const savedFrom = localStorage.getItem('fin_custom_from');
            if (savedFrom) {
                customDateFrom = savedFrom;
            }
            const savedTo = localStorage.getItem('fin_custom_to');
            if (savedTo) {
                customDateTo = savedTo;
            }
        } catch (_) {}
    }

    // === File operations ===
    async function saveToFile() {
        if (!folderHandle) return;
        
        try {
            const data = getDataForExport();
            const json = JSON.stringify(data, null, 2);
            
            // Create or get file
            if (!fileHandle) {
                fileHandle = await folderHandle.getFileHandle('finanser_data.json', { create: true });
            }
            
            const writable = await fileHandle.createWritable();
            await writable.write(json);
            await writable.close();
            
            folderStatus.textContent = 'Данные сохранены в папке';
            folderStatus.className = 'folder-status active';
        } catch (error) {
            console.error('Ошибка сохранения:', error);
            folderStatus.textContent = 'Ошибка сохранения';
            folderStatus.className = 'folder-status';
        }
    }

    async function selectFolder() {
        try {
            if (!window.showDirectoryPicker) {
                alert('Ваш браузер не поддерживает выбор папки. Используйте экспорт/импорт через файлы.');
                return;
            }
            
            folderHandle = await window.showDirectoryPicker();
            fileHandle = null; // Reset file handle
            
            // Try to load existing file
            try {
                fileHandle = await folderHandle.getFileHandle('finanser_data.json');
                const file = await fileHandle.getFile();
                const text = await file.text();
                const data = JSON.parse(text);
                
                if (data.categories && data.transactions) {
                    categories = data.categories;
                    transactions = data.transactions;
                    renderAll();
                    saveState();
                }
            } catch (e) {
                // File doesn't exist, will be created on save
                folderStatus.textContent = 'Папка выбрана, файл будет создан при первом сохранении';
                folderStatus.className = 'folder-status active';
            }
            
            folderStatus.textContent = `Папка выбрана: ${folderHandle.name}`;
            folderStatus.className = 'folder-status active';
            
            // Save current data to file
            await saveToFile();
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('Ошибка выбора папки:', error);
                folderStatus.textContent = 'Ошибка выбора папки';
                folderStatus.className = 'folder-status';
            }
        }
    }

    function exportData() {
        const data = getDataForExport();
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `finanser_data_${new Date().toISOString().slice(0,10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function importData(file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = JSON.parse(e.target.result);
                
                if (!data.categories || !data.transactions) {
                    alert('Неверный формат файла');
                    return;
                }
                
                if (confirm('Импортировать данные? Текущие данные будут заменены.')) {
                    categories = data.categories;
                    transactions = data.transactions;
                    renderAll();
                    saveState();
                    alert('Данные успешно импортированы');
                }
            } catch (error) {
                alert('Ошибка чтения файла');
                console.error(error);
            }
        };
        reader.readAsText(file);
    }

    // === Render functions ===
    function renderMenuCategories() {
        if (categories.length === 0) {
            menuCategoryList.innerHTML = '<div class="menu-empty">Нет категорий</div>';
            return;
        }

        let html = '';
        categories.forEach(cat => {
            const typeLabel = cat.type === 'income' ? 'Доход' : 'Расход';
            html += `
                <div class="menu-category-item">
                    <div class="cat-info">
                        <span class="cat-name">${cat.name}</span>
                        <span class="cat-type-badge">${typeLabel}</span>
                    </div>
                    <div class="cat-actions">
                        <button class="edit-btn" data-id="${cat.id}">✎</button>
                        <button class="delete-btn" data-id="${cat.id}">×</button>
                    </div>
                </div>
            `;
        });
        menuCategoryList.innerHTML = html;

        menuCategoryList.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = this.getAttribute('data-id');
                const cat = categories.find(c => c.id === id);
                if (cat) {
                    const newName = prompt('Редактировать категорию:', cat.name);
                    if (newName !== null && newName.trim() !== '') {
                        cat.name = newName.trim();
                        renderAll();
                        saveState();
                    }
                }
            });
        });

        menuCategoryList.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = this.getAttribute('data-id');
                if (confirm('Удалить категорию? Операции с этой категорией останутся без категории.')) {
                    categories = categories.filter(c => c.id !== id);
                    transactions.forEach(t => {
                        if (t.categoryId === id) {
                            t.categoryId = '';
                        }
                    });
                    renderAll();
                    saveState();
                }
            });
        });
    }

    function updateCategorySelects() {
        const currentType = txType.value;
        const available = getCategoriesByType(currentType);
        txCategorySelect.innerHTML = '';
        if (available.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'Нет категорий';
            txCategorySelect.appendChild(opt);
        } else {
            available.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat.id;
                opt.textContent = cat.name;
                txCategorySelect.appendChild(opt);
            });
        }

        const filterCurrent = filterCategory.value;
        filterCategory.innerHTML = '';
        const allOpt = document.createElement('option');
        allOpt.value = 'all';
        allOpt.textContent = 'Все категории';
        filterCategory.appendChild(allOpt);
        categories.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat.id;
            opt.textContent = cat.name;
            filterCategory.appendChild(opt);
        });
        if (filterCurrent) {
            filterCategory.value = filterCurrent;
        }
    }

    function getFilteredTransactions() {
        const typeFilter = filterType.value;
        const categoryFilter = filterCategory.value;
        const dateRange = getDateRange(currentPeriod);

        let filtered = transactions;
        if (typeFilter !== 'all') {
            filtered = filtered.filter(t => t.type === typeFilter);
        }
        if (categoryFilter !== 'all') {
            filtered = filtered.filter(t => t.categoryId === categoryFilter);
        }
        if (dateRange) {
            filtered = filtered.filter(t => isDateInRange(t.date, dateRange));
        }
        
        return filtered;
    }

    function renderTransactions() {
        const filtered = getFilteredTransactions();
        filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

        if (filtered.length === 0) {
            transactionListEl.innerHTML = '<div class="empty-state">Нет операций</div>';
        } else {
            let html = '';
            filtered.forEach(tx => {
                const catName = tx.categoryId ? getCategoryName(tx.categoryId) : 'Без категории';
                const typeLabel = tx.type === 'income' ? 'Доход' : 'Расход';
                const amountClass = tx.type === 'income' ? 'income' : 'expense';
                const date = new Date(tx.date);
                const dateStr = date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
                html += `
                    <div class="transaction-item">
                        <div class="tx-info">
                            <span class="tx-category">${catName}</span>
                            <span class="tx-type">${typeLabel}</span>
                            <span class="tx-date">${dateStr}</span>
                        </div>
                        <div class="flex">
                            <span class="tx-amount ${amountClass}">${tx.amount.toFixed(2)}</span>
                            <button class="tx-delete" data-id="${tx.id}">×</button>
                        </div>
                    </div>
                `;
            });
            transactionListEl.innerHTML = html;

            transactionListEl.querySelectorAll('.tx-delete').forEach(btn => {
                btn.addEventListener('click', function() {
                    const id = this.getAttribute('data-id');
                    if (confirm('Удалить операцию?')) {
                        transactions = transactions.filter(t => t.id !== id);
                        renderAll();
                        saveState();
                    }
                });
            });
        }

        updateSummary(filtered);
    }

    function updateSummary(filteredTransactions) {
        const totals = calcTotals(filteredTransactions);
        totalIncomeEl.textContent = totals.income.toFixed(2);
        totalExpenseEl.textContent = totals.expense.toFixed(2);
        const balance = totals.income - totals.expense;
        balanceEl.textContent = balance.toFixed(2);
        balanceEl.style.color = balance >= 0 ? '#059669' : '#dc2626';

        const count = filteredTransactions.length;
        transactionCountEl.textContent = count;

        const incomeTxs = filteredTransactions.filter(t => t.type === 'income');
        const expenseTxs = filteredTransactions.filter(t => t.type === 'expense');

        const avgIncome = incomeTxs.length > 0 
            ? incomeTxs.reduce((sum, t) => sum + t.amount, 0) / incomeTxs.length 
            : 0;
        const avgExpense = expenseTxs.length > 0 
            ? expenseTxs.reduce((sum, t) => sum + t.amount, 0) / expenseTxs.length 
            : 0;
        
        avgIncomeEl.textContent = avgIncome.toFixed(2);
        avgExpenseEl.textContent = avgExpense.toFixed(2);

        const maxIncome = incomeTxs.length > 0 
            ? Math.max(...incomeTxs.map(t => t.amount)) 
            : 0;
        const maxExpense = expenseTxs.length > 0 
            ? Math.max(...expenseTxs.map(t => t.amount)) 
            : 0;
        
        maxIncomeEl.textContent = maxIncome.toFixed(2);
        maxExpenseEl.textContent = maxExpense.toFixed(2);

        if (filteredTransactions.length === 0) {
            topCategoryEl.textContent = '—';
            return;
        }

        const categoryCount = {};
        filteredTransactions.forEach(t => {
            const catName = t.categoryId ? getCategoryName(t.categoryId) : 'Без категории';
            categoryCount[catName] = (categoryCount[catName] || 0) + 1;
        });

        let topCat = '';
        let maxCount = 0;
        Object.entries(categoryCount).forEach(([cat, count]) => {
            if (count > maxCount) {
                maxCount = count;
                topCat = cat;
            }
        });
        topCategoryEl.textContent = topCat || '—';
    }

    function calcTotals(list) {
        let income = 0, expense = 0;
        list.forEach(t => {
            if (t.type === 'income') income += t.amount;
            else expense += t.amount;
        });
        return { income, expense };
    }

    function renderAll() {
        renderMenuCategories();
        updateCategorySelects();
        renderTransactions();
    }

    // === Actions ===
    function addTransaction() {
        const type = txType.value;
        const categoryId = txCategorySelect.value;
        const amount = parseFloat(txAmount.value);

        if (isNaN(amount) || amount <= 0) {
            alert('Введите корректную сумму (больше 0)');
            return;
        }

        if (!categoryId) {
            alert('Выберите категорию');
            return;
        }

        const cat = categories.find(c => c.id === categoryId);
        if (!cat) {
            alert('Выберите существующую категорию');
            return;
        }

        transactions.push({
            id: generateId(),
            type: type,
            categoryId: categoryId,
            amount: amount,
            date: new Date().toISOString()
        });

        txAmount.value = '';
        renderAll();
        saveState();
    }

    function addCategory() {
        const name = menuNewCategoryName.value.trim();
        const type = menuNewCategoryType.value;

        if (!name) {
            alert('Введите название категории');
            return;
        }

        if (categories.some(c => c.name.toLowerCase() === name.toLowerCase() && c.type === type)) {
            alert('Такая категория уже существует');
            return;
        }

        categories.push({
            id: generateId(),
            name: name,
            type: type
        });

        menuNewCategoryName.value = '';
        renderAll();
        saveState();
    }

    function loadExample() {
        categories = [
            { id: 'cat1', name: 'Зарплата', type: 'income' },
            { id: 'cat2', name: 'Фриланс', type: 'income' },
            { id: 'cat3', name: 'Продукты', type: 'expense' },
            { id: 'cat4', name: 'Транспорт', type: 'expense' },
            { id: 'cat5', name: 'Кафе', type: 'expense' },
            { id: 'cat6', name: 'Подписки', type: 'expense' },
        ];

        const now = new Date();
        const month = now.getMonth();
        const year = now.getFullYear();

        transactions = [
            { id: generateId(), type: 'income', categoryId: 'cat1', amount: 45000, date: new Date(year, month, 5).toISOString() },
            { id: generateId(), type: 'income', categoryId: 'cat2', amount: 8000, date: new Date(year, month, 12).toISOString() },
            { id: generateId(), type: 'expense', categoryId: 'cat3', amount: 3200, date: new Date(year, month, 3).toISOString() },
            { id: generateId(), type: 'expense', categoryId: 'cat4', amount: 1200, date: new Date(year, month, 8).toISOString() },
            { id: generateId(), type: 'expense', categoryId: 'cat5', amount: 950, date: new Date(year, month, 15).toISOString() },
            { id: generateId(), type: 'expense', categoryId: 'cat6', amount: 650, date: new Date(year, month, 20).toISOString() },
            { id: generateId(), type: 'income', categoryId: 'cat1', amount: 42000, date: new Date(year, month - 1, 5).toISOString() },
            { id: generateId(), type: 'expense', categoryId: 'cat3', amount: 2800, date: new Date(year, month - 1, 10).toISOString() },
        ];

        renderAll();
        saveState();
    }

    function clearAllData() {
        if (transactions.length === 0) {
            alert('Нет операций для удаления');
            return;
        }
        if (confirm('Удалить все операции? Категории останутся.')) {
            transactions = [];
            renderAll();
            saveState();
            toggleMenu(false);
        }
    }

    // === Period handling ===
    function handlePeriodChange() {
        const period = periodSelect.value;
        currentPeriod = period;
        
        if (period === 'custom') {
            customPeriod.style.display = 'block';
            if (!dateFrom.value) {
                const now = new Date();
                const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
                dateFrom.value = firstDay.toISOString().split('T')[0];
            }
            if (!dateTo.value) {
                const now = new Date();
                dateTo.value = now.toISOString().split('T')[0];
            }
        } else {
            customPeriod.style.display = 'none';
        }
        
        renderAll();
        saveState();
    }

    function applyCustomDates() {
        if (!dateFrom.value || !dateTo.value) {
            alert('Выберите обе даты');
            return;
        }
        
        const from = new Date(dateFrom.value);
        const to = new Date(dateTo.value);
        
        if (from > to) {
            alert('Дата "С" должна быть раньше даты "По"');
            return;
        }
        
        customDateFrom = dateFrom.value;
        customDateTo = dateTo.value;
        renderAll();
        saveState();
    }

    // === Event listeners ===
    function init() {
        loadState();

        if (categories.length === 0 || transactions.length === 0) {
            loadExample();
        } else {
            periodSelect.value = currentPeriod;
            if (currentPeriod === 'custom') {
                if (customDateFrom) dateFrom.value = customDateFrom;
                if (customDateTo) dateTo.value = customDateTo;
            }
            renderAll();
        }

        addBtn.addEventListener('click', addTransaction);
        txAmount.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') addTransaction();
        });
        txType.addEventListener('change', updateCategorySelects);

        menuAddCategoryBtn.addEventListener('click', addCategory);
        menuNewCategoryName.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') addCategory();
        });

        filterType.addEventListener('change', renderTransactions);
        filterCategory.addEventListener('change', renderTransactions);
        clearFiltersBtn.addEventListener('click', function() {
            filterType.value = 'all';
            filterCategory.value = 'all';
            renderTransactions();
        });

        menuClearAllBtn.addEventListener('click', clearAllData);

        periodSelect.addEventListener('change', handlePeriodChange);
        applyCustomPeriod.addEventListener('click', applyCustomDates);

        // File operations
        menuSelectFolderBtn.addEventListener('click', selectFolder);
        menuExportBtn.addEventListener('click', exportData);
        menuImportBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', function(e) {
            if (this.files && this.files[0]) {
                importData(this.files[0]);
                this.value = '';
            }
        });
    }

    init();
})();
