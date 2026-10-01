(function() {
    // === Data ===
    let categories = [];
    let transactions = [];
    let currentPeriod = 'month';
    let customDateFrom = null;
    let customDateTo = null;
    let fileHandle = null;
    let editingTransactionId = null;
    let saveTimeout = null;
    let isSaving = false;
    let initialBalance = 0;
    let sortOrder = 'newest';
    let lastKnownModified = 0;
    let pendingExternalData = null; // данные из файла, ждущие подтверждения загрузки

    // Уникальный ID этой вкладки — чтобы отличать свои записи от чужих
    const instanceId = (crypto.randomUUID && crypto.randomUUID()) ||
        ('inst-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8));

    // === DOM refs ===
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const menuOverlay = document.getElementById('menuOverlay');
    const dropdownMenu = document.getElementById('dropdownMenu');
    const menuCloseBtn = document.getElementById('menuCloseBtn');

    const txType = document.getElementById('txType');
    const txCategorySelect = document.getElementById('txCategorySelect');
    const txAmount = document.getElementById('txAmount');
    const txDate = document.getElementById('txDate');
    const addBtn = document.getElementById('addBtn');

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

    const categoriesModal = document.getElementById('categoriesModal');
    const categoriesModalClose = document.getElementById('categoriesModalClose');
    const modalCategoryList = document.getElementById('modalCategoryList');
    const modalNewCategoryName = document.getElementById('modalNewCategoryName');
    const modalNewCategoryType = document.getElementById('modalNewCategoryType');
    const modalAddCategoryBtn = document.getElementById('modalAddCategoryBtn');
    const menuCategoriesBtn = document.getElementById('menuCategoriesBtn');

    const editPopover = document.getElementById('editPopover');
    const editPopoverClose = document.getElementById('editPopoverClose');
    const editTxType = document.getElementById('editTxType');
    const editTxCategory = document.getElementById('editTxCategory');
    const editTxAmount = document.getElementById('editTxAmount');
    const editTxDate = document.getElementById('editTxDate');
    const editTxSaveBtn = document.getElementById('editTxSaveBtn');

    const menuSelectFolderBtn = document.getElementById('menuSelectFolderBtn');
    const menuExportBtn = document.getElementById('menuExportBtn');
    const menuImportBtn = document.getElementById('menuImportBtn');
    const fileInput = document.getElementById('fileInput');
    const folderStatus = document.getElementById('folderStatus');

    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');

    const sortSelect = document.getElementById('sortSelect');
    const initialBalanceInput = document.getElementById('initialBalanceInput');
    const setInitialBalanceBtn = document.getElementById('setInitialBalanceBtn');
    const currentBalanceDisplay = document.getElementById('currentBalanceDisplay');

    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    let dynamicsChart = null;
    let structureChart = null;

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
            version: '1.2',
            exportedAt: new Date().toISOString(),
            lastWriter: instanceId,
            lastWriteTime: new Date().toISOString(),
            categories: categories,
            transactions: transactions,
            initialBalance: initialBalance
        };
    }

    // ============================================================
    // IndexedDB — хранение FileSystemFileHandle
    // ============================================================
    const DB_NAME = 'finanser_fs';
    const DB_VERSION = 1;
    const STORE_NAME = 'handles';
    const HANDLE_KEY = 'dataFile';

    function openDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async function saveHandleToDB(handle) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async function loadHandleFromDB() {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const req = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    }

    async function clearHandleFromDB() {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).delete(HANDLE_KEY);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    // === Date helpers ===
    function getDateRange(period) {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();

        let from, to;

        switch (period) {
            case 'all':
                return null;
            case 'month':
                from = new Date(year, month, 1);
                to = new Date(year, month + 1, 0, 23, 59, 59);
                break;
            case 'lastMonth':
                from = new Date(year, month - 1, 1);
                to = new Date(year, month, 0, 23, 59, 59);
                break;
            case 'quarter': {
                const quarterMonth = Math.floor(month / 3) * 3;
                from = new Date(year, quarterMonth, 1);
                to = new Date(year, quarterMonth + 3, 0, 23, 59, 59);
                break;
            }
            case 'year':
                from = new Date(year, 0, 1);
                to = new Date(year, 11, 31, 23, 59, 59);
                break;
            case 'custom':
                if (customDateFrom && customDateTo) {
                    from = new Date(customDateFrom + 'T00:00:00');
                    to = new Date(customDateTo + 'T23:59:59');
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

    function toLocalDateInputValue(date) {
        const d = new Date(date);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    // === Баланс ===
    function calculateBalances(transactionsList) {
        const sorted = [...transactionsList].sort((a, b) => {
            const diff = new Date(a.date) - new Date(b.date);
            if (diff === 0) return a.id.localeCompare(b.id);
            return diff;
        });

        let balance = initialBalance;
        return sorted.map(tx => {
            const amount = tx.type === 'income' ? tx.amount : -tx.amount;
            balance += amount;
            return { ...tx, runningBalance: balance };
        });
    }

    function getCurrentBalance() {
        let balance = initialBalance;
        transactions.forEach(tx => {
            balance += tx.type === 'income' ? tx.amount : -tx.amount;
        });
        return balance;
    }

    // === Меню ===
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
        if (e.key === 'Escape') {
            if (categoriesModal.classList.contains('active')) closeCategoriesModal();
            if (editPopover.classList.contains('active')) closeEditPopover();
            if (dropdownMenu.classList.contains('active')) toggleMenu(false);
        }
    });

    // === Categories Modal ===
    function openCategoriesModal() {
        categoriesModal.classList.add('active');
        document.body.style.overflow = 'hidden';
        renderModalCategories();
    }

    function closeCategoriesModal() {
        categoriesModal.classList.remove('active');
        document.body.style.overflow = '';
    }

    categoriesModalClose.addEventListener('click', closeCategoriesModal);
    categoriesModal.addEventListener('click', function(e) {
        if (e.target === this) closeCategoriesModal();
    });

    menuCategoriesBtn.addEventListener('click', function() {
        toggleMenu(false);
        openCategoriesModal();
    });

    function renderModalCategories() {
        if (categories.length === 0) {
            modalCategoryList.innerHTML = '<div class="menu-empty">Нет категорий</div>';
            return;
        }

        const sorted = [...categories].sort((a, b) => {
            if (a.type !== b.type) return a.type === 'income' ? -1 : 1;
            return a.name.localeCompare(b.name);
        });

        let html = '';
        sorted.forEach(cat => {
            const typeLabel = cat.type === 'income' ? 'Доход' : 'Расход';
            html += `
                <div class="modal-category-item">
                    <div class="cat-info">
                        <span class="cat-name">${cat.name}</span>
                        <span class="cat-type-badge">${typeLabel}</span>
                    </div>
                    <div class="cat-actions">
                        <button class="modal-edit-btn" data-id="${cat.id}">✎</button>
                        <button class="modal-delete-btn" data-id="${cat.id}">×</button>
                    </div>
                </div>
            `;
        });
        modalCategoryList.innerHTML = html;

        modalCategoryList.querySelectorAll('.modal-edit-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = this.getAttribute('data-id');
                const cat = categories.find(c => c.id === id);
                if (cat) {
                    const newName = prompt('Редактировать категорию:', cat.name);
                    if (newName !== null && newName.trim() !== '') {
                        cat.name = newName.trim();
                        renderModalCategories();
                        updateCategorySelects();
                        saveState();
                    }
                }
            });
        });

        modalCategoryList.querySelectorAll('.modal-delete-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = this.getAttribute('data-id');
                if (confirm('Удалить категорию? Операции с этой категорией останутся без категории.')) {
                    categories = categories.filter(c => c.id !== id);
                    transactions.forEach(t => {
                        if (t.categoryId === id) t.categoryId = '';
                    });
                    renderModalCategories();
                    updateCategorySelects();
                    renderTransactions();
                    saveState();
                }
            });
        });
    }

    function addCategoryFromModal() {
        const name = modalNewCategoryName.value.trim();
        const type = modalNewCategoryType.value;

        if (!name) {
            alert('Введите название категории');
            return;
        }

        if (categories.some(c => c.name.toLowerCase() === name.toLowerCase() && c.type === type)) {
            alert('Такая категория уже существует');
            return;
        }

        categories.push({ id: generateId(), name, type });

        modalNewCategoryName.value = '';
        renderModalCategories();
        updateCategorySelects();
        renderTransactions();
        saveState();
    }

    modalAddCategoryBtn.addEventListener('click', addCategoryFromModal);
    modalNewCategoryName.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') addCategoryFromModal();
    });

    // === Edit Popover ===
    function openEditPopover(txId) {
        const tx = transactions.find(t => t.id === txId);
        if (!tx) return;

        editingTransactionId = txId;

        editTxType.value = tx.type;
        editTxAmount.value = tx.amount;
        editTxDate.value = toLocalDateInputValue(tx.date);

        const available = getCategoriesByType(tx.type);
        editTxCategory.innerHTML = '';
        if (available.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'Нет категорий';
            editTxCategory.appendChild(opt);
        } else {
            available.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat.id;
                opt.textContent = cat.name;
                if (cat.id === tx.categoryId) opt.selected = true;
                editTxCategory.appendChild(opt);
            });
        }

        editPopover.classList.add('active');
        document.body.style.overflow = 'hidden';
        setTimeout(() => editTxAmount.focus(), 100);
    }

    function closeEditPopover() {
        editPopover.classList.remove('active');
        document.body.style.overflow = '';
        editingTransactionId = null;
    }

    function saveEditedTransaction() {
        if (!editingTransactionId) return;

        const type = editTxType.value;
        const categoryId = editTxCategory.value;
        const amount = parseFloat(editTxAmount.value);
        const date = editTxDate.value;

        if (isNaN(amount) || amount <= 0) {
            alert('Введите корректную сумму (больше 0)');
            return;
        }
        if (!categoryId) {
            alert('Выберите категорию');
            return;
        }
        if (!date) {
            alert('Выберите дату');
            return;
        }

        const tx = transactions.find(t => t.id === editingTransactionId);
        if (tx) {
            tx.type = type;
            tx.categoryId = categoryId;
            tx.amount = amount;
            tx.date = new Date(date + 'T12:00:00').toISOString();
            renderAll();
            saveState();
            closeEditPopover();
        }
    }

    editPopoverClose.addEventListener('click', closeEditPopover);
    editPopover.addEventListener('click', function(e) {
        if (e.target === this) closeEditPopover();
    });
    editTxSaveBtn.addEventListener('click', saveEditedTransaction);
    editTxAmount.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') saveEditedTransaction();
    });
    editTxDate.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') saveEditedTransaction();
    });

    editTxType.addEventListener('change', function() {
        const type = this.value;
        const available = getCategoriesByType(type);
        editTxCategory.innerHTML = '';
        if (available.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'Нет категорий';
            editTxCategory.appendChild(opt);
        } else {
            available.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat.id;
                opt.textContent = cat.name;
                editTxCategory.appendChild(opt);
            });
        }
    });

    // === Начальный остаток ===
    function setInitialBalance(value) {
        if (isNaN(value) || value < 0) {
            alert('Введите корректную сумму (больше или равно 0)');
            return;
        }
        initialBalance = value;
        localStorage.setItem('fin_initial_balance', initialBalance.toString());

        if (initialBalanceInput) initialBalanceInput.value = initialBalance;
        if (currentBalanceDisplay) {
            currentBalanceDisplay.textContent = getCurrentBalance().toFixed(2);
        }

        renderAll();
        saveState();
        toggleMenu(false);
        alert(`Начальный остаток установлен: ${initialBalance.toFixed(2)} руб.`);
    }

    // === Save/Load (localStorage) ===
    function saveState() {
        try {
            localStorage.setItem('fin_categories', JSON.stringify(categories));
            localStorage.setItem('fin_transactions', JSON.stringify(transactions));
            localStorage.setItem('fin_period', currentPeriod);
            localStorage.setItem('fin_custom_from', customDateFrom || '');
            localStorage.setItem('fin_custom_to', customDateTo || '');
            localStorage.setItem('fin_initial_balance', initialBalance.toString());
            localStorage.setItem('fin_sort_order', sortOrder);
        } catch (_) {}

        if (fileHandle) scheduleSave();
    }

    function loadState() {
        try {
            const savedCats = localStorage.getItem('fin_categories');
            if (savedCats) {
                const parsed = JSON.parse(savedCats);
                if (Array.isArray(parsed)) categories = parsed;
            }
            const savedTx = localStorage.getItem('fin_transactions');
            if (savedTx) {
                const parsed = JSON.parse(savedTx);
                if (Array.isArray(parsed)) transactions = parsed;
            }
            const savedPeriod = localStorage.getItem('fin_period');
            if (savedPeriod) currentPeriod = savedPeriod;
            const savedFrom = localStorage.getItem('fin_custom_from');
            if (savedFrom) customDateFrom = savedFrom;
            const savedTo = localStorage.getItem('fin_custom_to');
            if (savedTo) customDateTo = savedTo;
            const savedBalance = localStorage.getItem('fin_initial_balance');
            if (savedBalance) initialBalance = parseFloat(savedBalance) || 0;
            const savedSort = localStorage.getItem('fin_sort_order');
            if (savedSort) sortOrder = savedSort;
        } catch (_) {}
    }

    // === File operations ===
    async function saveToFile() {
        if (!fileHandle) return;
        if (isSaving) return;

        isSaving = true;
        setStatus('saving', 'Сохранение...');
        folderStatus.textContent = 'Сохранение...';
        folderStatus.className = 'folder-status saving';

        try {
            // Проверить права перед записью
            const perm = await fileHandle.queryPermission({ mode: 'readwrite' });
            if (perm !== 'granted') {
                isSaving = false;
                setStatus('', `Нужно разрешение на запись в «${fileHandle.name}»`);
                return;
            }

            const data = getDataForExport();
            const json = JSON.stringify(data, null, 2);

            const writable = await fileHandle.createWritable();
            await writable.write(json);
            await writable.close();

            // Обновить lastKnownModified, чтобы не поймать собственные изменения
            const file = await fileHandle.getFile();
            lastKnownModified = file.lastModified;

            const timeStr = new Date().toLocaleTimeString('ru-RU', {
                hour: '2-digit', minute: '2-digit', second: '2-digit'
            });
            setStatus('saved', `Сохранено (${timeStr})`);
            folderStatus.textContent = `Сохранено в: ${fileHandle.name} (${timeStr})`;
            folderStatus.className = 'folder-status active';
        } catch (error) {
            console.error('Ошибка сохранения:', error);
            setStatus('error', 'Ошибка сохранения!');
            folderStatus.textContent = 'Ошибка сохранения!';
            folderStatus.className = 'folder-status error';
        } finally {
            isSaving = false;
        }
    }

    function scheduleSave() {
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            if (fileHandle) saveToFile();
            saveTimeout = null;
        }, 500);
    }

    function setStatus(state, text) {
        statusDot.className = 'status-dot' + (state ? ' ' + state : '');
        statusText.textContent = text;
        statusText.className = 'status-text' + (state ? ' ' + state : '');
    }

    // Загрузить данные из handle в память
    async function loadFromFileHandle(handle) {
        try {
            const file = await handle.getFile();
            lastKnownModified = file.lastModified;
            const text = await file.text();
            if (!text.trim()) return false;

            const data = JSON.parse(text);
            if (!data.categories || !data.transactions) return false;

            categories = data.categories;
            transactions = data.transactions;
            if (data.initialBalance !== undefined) initialBalance = data.initialBalance;
            return true;
        } catch (err) {
            console.error('Не удалось прочитать файл:', err);
            return false;
        }
    }

    // Сравнить содержимое файла с текущим состоянием в памяти
    function dataMatchesLocal(data) {
        try {
            const sameTx = JSON.stringify(data.transactions) === JSON.stringify(transactions);
            const sameCats = JSON.stringify(data.categories) === JSON.stringify(categories);
            const sameBal = (data.initialBalance || 0) === (initialBalance || 0);
            return sameTx && sameCats && sameBal;
        } catch (_) {
            return false;
        }
    }

    // Проверка внешних изменений (например, из другого браузера)
    async function checkForExternalChanges() {
        if (!fileHandle || isSaving) return;
        try {
            const perm = await fileHandle.queryPermission({ mode: 'readwrite' });
            if (perm !== 'granted') return;

            const file = await fileHandle.getFile();
            if (file.lastModified === lastKnownModified) return;

            const text = await file.text();
            if (!text.trim()) return;

            const data = JSON.parse(text);
            if (!data.categories || !data.transactions) return;

            // Если содержимое совпадает с нашим — просто обновить метку
            if (dataMatchesLocal(data)) {
                lastKnownModified = file.lastModified;
                return;
            }

            // Файл изменён кем-то другим
            if (data.lastWriter === instanceId) {
                // Это наша собственная запись, но по какой-то причине не отражена
                lastKnownModified = file.lastModified;
                return;
            }

            const load = confirm(
                'Файл изменился в другом браузере или на другом устройстве.\n' +
                'Загрузить свежую версию? Локальные несохранённые изменения будут потеряны.'
            );
            if (load) {
                categories = data.categories;
                transactions = data.transactions;
                if (data.initialBalance !== undefined) initialBalance = data.initialBalance;
                lastKnownModified = file.lastModified;
                renderAll();
                saveLocalStateOnly();
                setStatus('saved', `Обновлено из файла (${new Date().toLocaleTimeString('ru-RU')})`);
            } else {
                lastKnownModified = file.lastModified;
            }
        } catch (err) {
            console.warn('Проверка внешних изменений не удалась:', err);
        }
    }

    // Сохранить только в localStorage, без записи в файл
    function saveLocalStateOnly() {
        try {
            localStorage.setItem('fin_categories', JSON.stringify(categories));
            localStorage.setItem('fin_transactions', JSON.stringify(transactions));
            localStorage.setItem('fin_initial_balance', initialBalance.toString());
        } catch (_) {}
    }

    // Выбор нового файла
    async function selectFileForAutoSave() {
        if (!window.showSaveFilePicker) {
            alert('Ваш браузер не поддерживает File System Access API. Используйте экспорт/импорт.');
            return;
        }

        try {
            const newHandle = await window.showSaveFilePicker({
                suggestedName: 'finanser_data.json',
                types: [{
                    description: 'JSON файл',
                    accept: { 'application/json': ['.json'] }
                }]
            });

            // Запросить разрешение немедленно, из жеста пользователя
            const perm = await newHandle.requestPermission({ mode: 'readwrite' });
            if (perm !== 'granted') {
                alert('Нужно разрешить доступ к файлу, чтобы включить автосохранение.');
                return;
            }

            fileHandle = newHandle;
            await saveHandleToDB(newHandle);

            // Попробовать прочитать существующие данные
            const loaded = await loadFromFileHandle(newHandle);
            if (loaded) {
                const replace = confirm(
                    `В файле «${newHandle.name}» уже есть данные.\n` +
                    `Загрузить их? (Отмена — использовать текущие данные и перезаписать файл)`
                );
                if (replace) {
                    renderAll();
                    saveLocalStateOnly();
                }
            }

            renderAll();
            updateSelectButtonLabel();

            // Первая запись
            await saveToFile();
            toggleMenu(false);
        } catch (err) {
            if (err.name !== 'AbortError' && err.name !== 'SecurityError') {
                console.error('Ошибка выбора файла:', err);
                setStatus('error', 'Ошибка выбора файла');
            }
        }
    }

    // Восстановление подключения к сохранённому handle (один клик)
    function showReconnectPrompt(handle) {
        setStatus('', `Нажмите, чтобы восстановить «${handle.name}»`);
        statusText.style.cursor = 'pointer';
        folderStatus.textContent = `Файл сохранён, но требуется подтверждение доступа`;
        folderStatus.className = 'folder-status';

        const onClick = async () => {
            statusText.removeEventListener('click', onClick);
            statusText.style.cursor = 'default';

            try {
                const perm = await handle.requestPermission({ mode: 'readwrite' });
                if (perm !== 'granted') {
                    setStatus('error', 'Доступ не разрешён');
                    return;
                }

                fileHandle = handle;
                const loaded = await loadFromFileHandle(handle);
                if (loaded) {
                    renderAll();
                    saveLocalStateOnly();
                }
                setStatus('saved', `Автосохранение: ${handle.name}`);
                folderStatus.textContent = `Автосохранение в: ${handle.name}`;
                folderStatus.className = 'folder-status active';
                updateSelectButtonLabel();
            } catch (err) {
                console.error('Ошибка восстановления:', err);
                setStatus('error', 'Ошибка восстановления доступа');
            }
        };

        statusText.addEventListener('click', onClick);
    }

    // При запуске приложения: попытаться восстановить handle
    async function restoreAutoSave() {
        if (!window.showSaveFilePicker) {
            setStatus('', 'Автосохранение не поддерживается в этом браузере');
            return;
        }

        let handle = null;
        try {
            handle = await loadHandleFromDB();
        } catch (err) {
            console.warn('IndexedDB недоступна:', err);
        }

        if (!handle) {
            setStatus('', 'Выберите файл для автосохранения ➜');
            folderStatus.textContent = 'Файл не выбран';
            folderStatus.className = 'folder-status';
            return;
        }

        fileHandle = handle;

        // Проверить права
        const perm = await handle.queryPermission({ mode: 'readwrite' });
        if (perm === 'granted') {
            const loaded = await loadFromFileHandle(handle);
            if (loaded) {
                renderAll();
                saveLocalStateOnly();
            }
            setStatus('saved', `Автосохранение: ${handle.name}`);
            folderStatus.textContent = `Автосохранение в: ${handle.name}`;
            folderStatus.className = 'folder-status active';
            updateSelectButtonLabel();
            return;
        }

        // Нужно подтверждение пользователя
        showReconnectPrompt(handle);
    }

    // Отключить файл
    async function disconnectFile() {
        if (!confirm('Отключить автосохранение? Данные останутся в localStorage.')) return;
        fileHandle = null;
        lastKnownModified = 0;
        try {
            await clearHandleFromDB();
        } catch (_) {}
        setStatus('', 'Выберите файл для автосохранения ➜');
        folderStatus.textContent = 'Файл не выбран';
        folderStatus.className = 'folder-status';
        updateSelectButtonLabel();
        toggleMenu(false);
    }

    // Обновить подпись кнопки в меню + добавить/убрать кнопку «Отключить»
    function updateSelectButtonLabel() {
        if (!menuSelectFolderBtn) return;
        menuSelectFolderBtn.textContent = fileHandle
            ? 'Выбрать другой файл для автосохранения'
            : 'Выбрать файл для автосохранения';

        // Кнопка «Отключить» — создаём при необходимости
        let disconnectBtn = document.getElementById('menuDisconnectBtn');
        if (fileHandle) {
            if (!disconnectBtn) {
                disconnectBtn = document.createElement('button');
                disconnectBtn.id = 'menuDisconnectBtn';
                disconnectBtn.className = 'menu-file-btn';
                disconnectBtn.textContent = 'Отключить автосохранение';
                disconnectBtn.addEventListener('click', disconnectFile);
                menuSelectFolderBtn.parentNode.insertBefore(disconnectBtn, menuSelectFolderBtn.nextSibling);
            }
        } else if (disconnectBtn) {
            disconnectBtn.remove();
        }
    }

    // Экспорт
    function exportData() {
        const data = getDataForExport();
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `finanser_data_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // Импорт
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
                    if (data.initialBalance !== undefined) initialBalance = data.initialBalance;
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

        if (filterCurrent) filterCategory.value = filterCurrent;
    }

    function getFilteredTransactions() {
        const typeFilter = filterType.value;
        const categoryFilter = filterCategory.value;
        const dateRange = getDateRange(currentPeriod);

        let filtered = transactions;
        if (typeFilter !== 'all') filtered = filtered.filter(t => t.type === typeFilter);
        if (categoryFilter !== 'all') filtered = filtered.filter(t => t.categoryId === categoryFilter);
        if (dateRange) filtered = filtered.filter(t => isDateInRange(t.date, dateRange));

        return filtered;
    }

    function renderTransactions() {
        const filtered = getFilteredTransactions();

        // ВАЖНО: считаем остатки по ПОЛНОЙ истории, потом фильтруем
        const allWithBalances = calculateBalances(transactions);
        const balanceMap = new Map(allWithBalances.map(t => [t.id, t.runningBalance]));

        const sorted = [...filtered].sort((a, b) => {
            const dateA = new Date(a.date);
            const dateB = new Date(b.date);
            if (sortOrder === 'newest') {
                return dateB - dateA || b.id.localeCompare(a.id);
            }
            return dateA - dateB || a.id.localeCompare(b.id);
        });

        if (sorted.length === 0) {
            transactionListEl.innerHTML = '<div class="empty-state">Нет операций</div>';
            updateSummary(filtered);
            updateBalanceDisplay();
            return;
        }

        let html = '';
        sorted.forEach(tx => {
            const catName = tx.categoryId ? getCategoryName(tx.categoryId) : 'Без категории';
            const typeLabel = tx.type === 'income' ? 'Доход' : 'Расход';
            const amountClass = tx.type === 'income' ? 'income' : 'expense';
            const date = new Date(tx.date);
            const dateStr = date.toLocaleDateString('ru-RU', {
                day: '2-digit', month: '2-digit', year: 'numeric'
            });

            const rb = balanceMap.get(tx.id);
            const balanceStr = rb !== undefined ? rb.toFixed(2) : '';

            html += `
                <div class="transaction-item" data-id="${tx.id}">
                    <div class="tx-info">
                        <span class="tx-category">${catName}</span>
                        <span class="tx-type">${typeLabel}</span>
                        <span class="tx-date">${dateStr}</span>
                    </div>
                    <div class="tx-right">
                        <span class="tx-amount ${amountClass}">${tx.amount.toFixed(2)}</span>
                        <span class="tx-balance">${balanceStr}</span>
                        <button class="tx-delete" data-id="${tx.id}">×</button>
                    </div>
                </div>
            `;
        });
        transactionListEl.innerHTML = html;

        transactionListEl.querySelectorAll('.tx-delete').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const id = this.getAttribute('data-id');
                if (confirm('Удалить операцию?')) {
                    transactions = transactions.filter(t => t.id !== id);
                    renderAll();
                    saveState();
                }
            });
        });

        transactionListEl.querySelectorAll('.transaction-item').forEach(item => {
            item.addEventListener('dblclick', function() {
                openEditPopover(this.getAttribute('data-id'));
            });
        });

        updateSummary(filtered);
        updateBalanceDisplay();
    }

    function updateSummary(filteredTransactions) {
        const totals = calcTotals(filteredTransactions);
        totalIncomeEl.textContent = totals.income.toFixed(2);
        totalExpenseEl.textContent = totals.expense.toFixed(2);
    
        // Баланс за выбранный период (без начального остатка)
        const periodBalance = totals.income - totals.expense;
        balanceEl.textContent = periodBalance.toFixed(2);
        balanceEl.style.color = periodBalance >= 0 ? '#059669' : '#dc2626';
    
        // Итого сейчас = начальный остаток + баланс за период
        const totalBalance = initialBalance + periodBalance;
        const totalBalanceEl = document.getElementById('totalBalance');
        if (totalBalanceEl) {
            totalBalanceEl.textContent = totalBalance.toFixed(2);
            totalBalanceEl.style.color = totalBalance >= 0 ? '#059669' : '#dc2626';
        }
    
        const hint = document.getElementById('initialBalanceHint');
        if (hint) {
            hint.textContent = initialBalance === 0
                ? ''
                : `вкл. начальный остаток ${initialBalance.toFixed(2)}`;
        }
    
        const count = filteredTransactions.length;
        transactionCountEl.textContent = count;
       

        const incomeTxs = filteredTransactions.filter(t => t.type === 'income');
        const expenseTxs = filteredTransactions.filter(t => t.type === 'expense');

        const avgIncome = incomeTxs.length > 0
            ? incomeTxs.reduce((s, t) => s + t.amount, 0) / incomeTxs.length : 0;
        const avgExpense = expenseTxs.length > 0
            ? expenseTxs.reduce((s, t) => s + t.amount, 0) / expenseTxs.length : 0;

        avgIncomeEl.textContent = avgIncome.toFixed(2);
        avgExpenseEl.textContent = avgExpense.toFixed(2);

        const maxIncome = incomeTxs.length > 0 ? Math.max(...incomeTxs.map(t => t.amount)) : 0;
        const maxExpense = expenseTxs.length > 0 ? Math.max(...expenseTxs.map(t => t.amount)) : 0;

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

    // === Графики ===
    function getMonthlyData() {
        const months = {};
        const all = getFilteredTransactions();

        all.forEach(t => {
            const date = new Date(t.date);
            const key = date.toLocaleDateString('ru-RU', { month: 'short', year: 'numeric' });
            if (!months[key]) {
                months[key] = { income: 0, expense: 0, order: date.getTime() };
            }
            months[key][t.type] += t.amount;
        });

        const sortedKeys = Object.keys(months).sort((a, b) => months[a].order - months[b].order);
        return sortedKeys.map(key => ({
            label: key,
            income: months[key].income,
            expense: months[key].expense
        }));
    }

    function getCategoryStructure(type = 'expense') {
        const result = {};
        const all = getFilteredTransactions();

        all.filter(t => t.type === type).forEach(t => {
            const name = t.categoryId ? getCategoryName(t.categoryId) : 'Без категории';
            result[name] = (result[name] || 0) + t.amount;
        });

        return Object.entries(result).sort((a, b) => b[1] - a[1]).slice(0, 8);
    }

    function renderDynamicsChart() {
        const canvas = document.getElementById('dynamicsChart');
        if (!canvas) return;

        if (dynamicsChart) {
            dynamicsChart.destroy();
            dynamicsChart = null;
        }

        const data = getMonthlyData();
        if (data.length === 0) {
            canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
            return;
        }

        dynamicsChart = new Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: data.map(d => d.label),
                datasets: [
                    {
                        label: 'Доходы',
                        data: data.map(d => d.income),
                        backgroundColor: 'rgba(5, 150, 105, 0.7)',
                        borderColor: '#059669',
                        borderWidth: 2,
                        borderRadius: 4
                    },
                    {
                        label: 'Расходы',
                        data: data.map(d => d.expense),
                        backgroundColor: 'rgba(220, 38, 38, 0.7)',
                        borderColor: '#dc2626',
                        borderWidth: 2,
                        borderRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { boxWidth: 12, padding: 12, font: { size: 11 } }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { callback: v => v.toLocaleString('ru-RU') }
                    },
                    x: { grid: { display: false } }
                }
            }
        });
    }

    function renderStructureChart() {
        const canvas = document.getElementById('structureChart');
        if (!canvas) return;

        if (structureChart) {
            structureChart.destroy();
            structureChart = null;
        }

        const data = getCategoryStructure('expense');
        if (data.length === 0) {
            canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
            return;
        }

        const colors = [
            '#059669', '#3b82f6', '#f59e0b', '#ef4444',
            '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'
        ];

        structureChart = new Chart(canvas.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: data.map(d => d[0]),
                datasets: [{
                    data: data.map(d => d[1]),
                    backgroundColor: colors.slice(0, data.length),
                    borderColor: '#ffffff',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: { boxWidth: 12, padding: 10, font: { size: 11 } }
                    }
                },
                cutout: '60%'
            }
        });
    }

    function renderCharts() {
        renderDynamicsChart();
        renderStructureChart();
    }

    function updateBalanceDisplay() {
        if (currentBalanceDisplay) {
            const current = getCurrentBalance();
            currentBalanceDisplay.textContent = current.toFixed(2);
            currentBalanceDisplay.style.color = current >= 0 ? '#059669' : '#dc2626';
        }
    }

    function renderAll() {
        updateCategorySelects();
        renderTransactions();
        if (categoriesModal.classList.contains('active')) renderModalCategories();
        renderCharts();
    }

    // === Actions ===
    function addTransaction() {
        const type = txType.value;
        const categoryId = txCategorySelect.value;
        const amount = parseFloat(txAmount.value);
        const date = txDate.value;

        if (isNaN(amount) || amount <= 0) {
            alert('Введите корректную сумму (больше 0)');
            return;
        }
        if (!categoryId) {
            alert('Выберите категорию');
            return;
        }
        if (!date) {
            alert('Выберите дату');
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
            date: new Date(date + 'T12:00:00').toISOString()
        });

        txAmount.value = '';
        txDate.value = toLocalDateInputValue(new Date());
        renderAll();
        saveState();
    }

    function clearAllData() {
        if (transactions.length === 0) {
            alert('Нет операций для удаления');
            return;
        }
        if (confirm('Удалить все операции? Категории и начальный остаток останутся.')) {
            transactions = [];
            renderAll();
            saveState();
            toggleMenu(false);
        }
    }

    // === Period ===
    function handlePeriodChange() {
        currentPeriod = periodSelect.value;

        if (currentPeriod === 'custom') {
            customPeriod.style.display = 'block';
            if (!dateFrom.value) {
                const now = new Date();
                dateFrom.value = toLocalDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1));
            }
            if (!dateTo.value) {
                dateTo.value = toLocalDateInputValue(new Date());
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

    // === Сортировка ===
    function handleSortChange() {
        sortOrder = sortSelect.value;
        localStorage.setItem('fin_sort_order', sortOrder);
        renderTransactions();
    }

    // === Вкладки ===
    if (tabBtns.length > 0) {
        tabBtns.forEach(btn => {
            btn.addEventListener('click', function() {
                tabBtns.forEach(b => b.classList.remove('active'));
                this.classList.add('active');

                const tabId = this.getAttribute('data-tab');
                tabContents.forEach(content => {
                    content.classList.remove('active');
                    if (content.id === 'tab-' + tabId) content.classList.add('active');
                });

                setTimeout(() => {
                    if (tabId === 'dynamics') renderDynamicsChart();
                    if (tabId === 'structure') renderStructureChart();
                }, 50);
            });
        });
    }

    // === Init ===
    async function init() {
        loadState();

        const today = toLocalDateInputValue(new Date());
        if (txDate) txDate.value = today;

        if (periodSelect) periodSelect.value = currentPeriod;
        if (currentPeriod === 'custom') {
            if (customDateFrom && dateFrom) dateFrom.value = customDateFrom;
            if (customDateTo && dateTo) dateTo.value = customDateTo;
            if (customPeriod) customPeriod.style.display = 'block';
        }

        if (initialBalanceInput) initialBalanceInput.value = initialBalance || '';
        if (sortSelect) sortSelect.value = sortOrder;

        renderAll();

        // Восстанавливаем файл
        await restoreAutoSave();
        updateSelectButtonLabel();

        // === Слушатели ===
        if (addBtn) addBtn.addEventListener('click', addTransaction);

        if (txAmount) {
            txAmount.addEventListener('keydown', e => {
                if (e.key === 'Enter') addTransaction();
            });
        }
        if (txDate) {
            txDate.addEventListener('keydown', e => {
                if (e.key === 'Enter') addTransaction();
            });
        }
        if (txType) txType.addEventListener('change', updateCategorySelects);

        if (filterType) filterType.addEventListener('change', renderTransactions);
        if (filterCategory) filterCategory.addEventListener('change', renderTransactions);
        if (clearFiltersBtn) {
            clearFiltersBtn.addEventListener('click', function() {
                if (filterType) filterType.value = 'all';
                if (filterCategory) filterCategory.value = 'all';
                renderTransactions();
            });
        }

        if (menuClearAllBtn) menuClearAllBtn.addEventListener('click', clearAllData);

        if (periodSelect) periodSelect.addEventListener('change', handlePeriodChange);
        if (applyCustomPeriod) applyCustomPeriod.addEventListener('click', applyCustomDates);

        if (setInitialBalanceBtn) {
            setInitialBalanceBtn.addEventListener('click', function() {
                const value = parseFloat(initialBalanceInput.value);
                setInitialBalance(value);
            });
        }
        if (initialBalanceInput) {
            initialBalanceInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    const value = parseFloat(this.value);
                    setInitialBalance(value);
                }
            });
        }

        if (sortSelect) sortSelect.addEventListener('change', handleSortChange);

        if (menuSelectFolderBtn) {
            menuSelectFolderBtn.addEventListener('click', selectFileForAutoSave);
        }
        if (menuExportBtn) menuExportBtn.addEventListener('click', exportData);
        if (menuImportBtn) menuImportBtn.addEventListener('click', () => fileInput.click());
        if (fileInput) {
            fileInput.addEventListener('change', function() {
                if (this.files && this.files[0]) {
                    importData(this.files[0]);
                    this.value = '';
                }
            });
        }

        // Проверка внешних изменений при возврате к вкладке
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') checkForExternalChanges();
        });
        window.addEventListener('focus', checkForExternalChanges);

        // Попытка сохранить при уходе
        window.addEventListener('beforeunload', function() {
            if (fileHandle && !isSaving) {
                // Синхронный запрос невозможен, но try позволит отправить запись
                saveToFile();
            }
        });
    }

    init();
})();
