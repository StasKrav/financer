(function() {
    // === Data ===
    let categories = [];
    let transactions = [];
    let currentPeriod = 'month';
    let customDateFrom = null;
    let customDateTo = null;
    let fileHandle = null; // Храним handle выбранного файла
    let editingTransactionId = null;
    let saveTimeout = null;
    let isSaving = false;

    // === DOM refs ===
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const menuOverlay = document.getElementById('menuOverlay');
    const dropdownMenu = document.getElementById('dropdownMenu');
    const menuCloseBtn = document.getElementById('menuCloseBtn');

    const txType = document.getElementById('txType');
    const txCategorySelect = document.getElementById('txCategorySelect');
    const txAmount = document.getElementById('txAmount');
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

    // Categories modal
    const categoriesModal = document.getElementById('categoriesModal');
    const categoriesModalClose = document.getElementById('categoriesModalClose');
    const modalCategoryList = document.getElementById('modalCategoryList');
    const modalNewCategoryName = document.getElementById('modalNewCategoryName');
    const modalNewCategoryType = document.getElementById('modalNewCategoryType');
    const modalAddCategoryBtn = document.getElementById('modalAddCategoryBtn');
    const menuCategoriesBtn = document.getElementById('menuCategoriesBtn');

    // Edit popover
    const editPopover = document.getElementById('editPopover');
    const editPopoverClose = document.getElementById('editPopoverClose');
    const editTxType = document.getElementById('editTxType');
    const editTxCategory = document.getElementById('editTxCategory');
    const editTxAmount = document.getElementById('editTxAmount');
    const editTxDate = document.getElementById('editTxDate');
    const editTxSaveBtn = document.getElementById('editTxSaveBtn');

    // File operations
    const menuSelectFolderBtn = document.getElementById('menuSelectFolderBtn');
    const menuExportBtn = document.getElementById('menuExportBtn');
    const menuImportBtn = document.getElementById('menuImportBtn');
    const fileInput = document.getElementById('fileInput');
    const folderStatus = document.getElementById('folderStatus');
    
    // Save status
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');

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
        if (e.key === 'Escape') {
            if (categoriesModal.classList.contains('active')) {
                closeCategoriesModal();
            }
            if (editPopover.classList.contains('active')) {
                closeEditPopover();
            }
            if (dropdownMenu.classList.contains('active')) {
                toggleMenu(false);
            }
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

        // Сортируем категории: сначала по типу, потом по алфавиту
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
                        if (t.categoryId === id) {
                            t.categoryId = '';
                        }
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

        categories.push({
            id: generateId(),
            name: name,
            type: type
        });

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
        editTxDate.value = new Date(tx.date).toISOString().split('T')[0];
        
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
            tx.date = new Date(date).toISOString();
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

    // === Save/Load ===
    function saveState() {
        // 1. Сохраняем в localStorage
        try {
            localStorage.setItem('fin_categories', JSON.stringify(categories));
            localStorage.setItem('fin_transactions', JSON.stringify(transactions));
            localStorage.setItem('fin_period', currentPeriod);
            localStorage.setItem('fin_custom_from', customDateFrom || '');
            localStorage.setItem('fin_custom_to', customDateTo || '');
            
            // Сохраняем имя файла для восстановления
            if (fileHandle) {
                localStorage.setItem('fin_auto_save_filename', fileHandle.name);
                localStorage.setItem('fin_auto_save_file', 'true');
            }
        } catch (_) {}
        
        // 2. Отложенное сохранение в файл (если файл выбран)
        if (fileHandle) {
            scheduleSave();
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
        if (!fileHandle) {
            console.warn('Файл не выбран для сохранения');
            return;
        }
        if (isSaving) return;
        
        isSaving = true;
        
        // Обновляем статус
        statusDot.className = 'status-dot saving';
        statusText.textContent = 'Сохранение...';
        statusText.className = 'status-text saving';
        folderStatus.textContent = 'Сохранение...';
        folderStatus.className = 'folder-status saving';
        
        try {
            const data = getDataForExport();
            const json = JSON.stringify(data, null, 2);
            
            const writable = await fileHandle.createWritable();
            await writable.write(json);
            await writable.close();
            
            const now = new Date();
            const timeStr = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            
            // Обновляем статус на "Сохранено"
            statusDot.className = 'status-dot saved';
            statusText.textContent = `Сохранено (${timeStr})`;
            statusText.className = 'status-text saved';
            folderStatus.textContent = `Сохранено в файл: ${fileHandle.name} (${timeStr})`;
            folderStatus.className = 'folder-status active';
        } catch (error) {
            console.error('Ошибка сохранения:', error);
            statusDot.className = 'status-dot error';
            statusText.textContent = 'Ошибка сохранения!';
            statusText.className = 'status-text error';
            folderStatus.textContent = 'Ошибка сохранения!';
            folderStatus.className = 'folder-status error';
        } finally {
            isSaving = false;
        }
    }

    // Функция для отложенного сохранения (debounce)
    function scheduleSave() {
        if (saveTimeout) {
            clearTimeout(saveTimeout);
        }
        saveTimeout = setTimeout(() => {
            if (fileHandle) {
                saveToFile();
            }
            saveTimeout = null;
        }, 500);
    }

    
    // === Упрощённый выбор файла ===
    async function selectFileForAutoSave() {
            try {
                if (!window.showSaveFilePicker) {
                    alert('Ваш браузер не поддерживает выбор файла. Используйте экспорт/импорт.');
                    return;
                }
                
                // Предлагаем выбрать файл для сохранения
                const newFileHandle = await window.showSaveFilePicker({
                    suggestedName: 'finanser_data.json',
                    types: [{
                        description: 'JSON файл',
                        accept: { 'application/json': ['.json'] }
                    }]
                });
                
                // Проверяем, есть ли уже данные в файле
                try {
                    const file = await newFileHandle.getFile();
                    const text = await file.text();
                    if (text.trim()) {
                        const data = JSON.parse(text);
                        if (data.categories && data.transactions) {
                            if (confirm('В выбранном файле уже есть данные. Загрузить их?')) {
                                categories = data.categories;
                                transactions = data.transactions;
                                renderAll();
                                localStorage.setItem('fin_categories', JSON.stringify(categories));
                                localStorage.setItem('fin_transactions', JSON.stringify(transactions));
                            }
                        }
                    }
                } catch (e) {
                    // Файл пустой или невалидный - просто продолжим
                    console.log('Файл пустой или новый, продолжим сохранение');
                }
                
                fileHandle = newFileHandle;
                
                // Сохраняем информацию о файле
                try {
                    localStorage.setItem('fin_auto_save_file', 'true');
                    localStorage.setItem('fin_auto_save_filename', newFileHandle.name);
                } catch (_) {}
                
                // Обновляем статус
                const now = new Date();
                const timeStr = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
                statusDot.className = 'status-dot saved';
                statusText.textContent = `Автосохранение в ${newFileHandle.name}`;
                statusText.className = 'status-text saved';
                statusText.style.cursor = 'default';
                folderStatus.textContent = `Автосохранение в файл: ${newFileHandle.name}`;
                folderStatus.className = 'folder-status active';
                
                // Сразу сохраняем текущие данные
                await saveToFile();
                
                // Закрываем меню
                toggleMenu(false);
                
            } catch (error) {
                if (error.name !== 'AbortError' && error.name !== 'SecurityError') {
                    console.error('Ошибка выбора файла:', error);
                    statusDot.className = 'status-dot error';
                    statusText.textContent = 'Ошибка выбора файла';
                    statusText.className = 'status-text error';
                    statusText.style.cursor = 'default';
                    folderStatus.textContent = 'Ошибка выбора файла';
                    folderStatus.className = 'folder-status error';
                }
            }
        }

    async function restoreFileFromStorage() {
            try {
                const hasAutoSave = localStorage.getItem('fin_auto_save_file');
                const fileName = localStorage.getItem('fin_auto_save_filename');
                
                if (!hasAutoSave || !fileName) return false;
                
                // Проверяем поддержку API
                if (!window.showOpenFilePicker) {
                    console.warn('File System Access API не поддерживается');
                    return false;
                }
                
                // Пытаемся получить доступ к файлу через showOpenFilePicker
                const [handle] = await window.showOpenFilePicker({
                    multiple: false,
                    types: [{
                        description: 'JSON файлы',
                        accept: { 'application/json': ['.json'] }
                    }]
                });
                
                // Проверяем, что это тот же файл (по имени)
                if (handle.name !== fileName) {
                    if (!confirm(`Вы выбрали файл "${handle.name}", но ожидался "${fileName}". Использовать выбранный файл?`)) {
                        return false;
                    }
                }
                
                // Проверяем содержимое файла
                const file = await handle.getFile();
                const text = await file.text();
                
                if (!text.trim()) {
                    // Файл пустой - используем его для сохранения
                    fileHandle = handle;
                    return true;
                }
                
                try {
                    const data = JSON.parse(text);
                    if (data.categories && data.transactions) {
                        // Данные есть - загружаем
                        categories = data.categories;
                        transactions = data.transactions;
                        fileHandle = handle;
                        renderAll();
                        saveState();
                        return true;
                    }
                } catch (e) {
                    // Файл повреждён - используем его для сохранения
                    fileHandle = handle;
                    await saveToFile();
                    return true;
                }
                
                return false;
            } catch (error) {
                if (error.name === 'AbortError') {
                    console.log('Пользователь отменил выбор файла');
                    return false;
                }
                console.error('Ошибка восстановления файла:', error);
                return false;
            }
        }
    
        // === НОВАЯ ФУНКЦИЯ: Предложение восстановить файл (с UI) ===
        function promptRestoreFile() {
            const hasAutoSave = localStorage.getItem('fin_auto_save_file');
            const fileName = localStorage.getItem('fin_auto_save_filename');
            
            if (!hasAutoSave || !fileName) {
                // Нет сохранённого файла - показываем подсказку
                statusText.textContent = 'Выберите файл для автосохранения ➜';
                statusText.className = 'status-text';
                statusDot.className = 'status-dot';
                folderStatus.textContent = 'Папка не выбрана';
                folderStatus.className = 'folder-status';
                return;
            }
            
            // Показываем уведомление о возможности восстановления
            statusDot.className = 'status-dot';
            statusText.textContent = `Найден файл "${fileName}". Нажмите для восстановления`;
            statusText.className = 'status-text';
            statusText.style.cursor = 'pointer';
            folderStatus.textContent = `Нажмите на статус, чтобы восстановить файл "${fileName}"`;
            folderStatus.className = 'folder-status';
            
            // Делаем кликабельным статус
            const restoreHandler = async function() {
                statusDot.className = 'status-dot saving';
                statusText.textContent = `Восстановление файла "${fileName}"...`;
                statusText.className = 'status-text saving';
                statusText.style.cursor = 'default';
                folderStatus.textContent = `Восстановление файла "${fileName}"...`;
                folderStatus.className = 'folder-status saving';
                
                const restored = await restoreFileFromStorage();
                
                if (restored) {
                    const now = new Date();
                    const timeStr = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
                    statusDot.className = 'status-dot saved';
                    statusText.textContent = `Автосохранение в ${fileHandle.name}`;
                    statusText.className = 'status-text saved';
                    statusText.style.cursor = 'default';
                    folderStatus.textContent = `Автосохранение в файл: ${fileHandle.name}`;
                    folderStatus.className = 'folder-status active';
                } else {
                    // Не удалось восстановить
                    statusDot.className = 'status-dot';
                    statusText.textContent = 'Выберите файл для автосохранения ➜';
                    statusText.className = 'status-text';
                    statusText.style.cursor = 'default';
                    folderStatus.textContent = 'Восстановление не удалось, выберите файл';
                    folderStatus.className = 'folder-status';
                    
                    localStorage.removeItem('fin_auto_save_file');
                    localStorage.removeItem('fin_auto_save_filename');
                }
                
                // Удаляем обработчик
                statusText.removeEventListener('click', restoreHandler);
            };
            
            statusText.addEventListener('click', restoreHandler);
        }
    
        // === Обновлённая функция восстановления при запуске ===
        function restoreAutoSave() {
            try {
                const hasAutoSave = localStorage.getItem('fin_auto_save_file');
                const fileName = localStorage.getItem('fin_auto_save_filename');
                
                if (!hasAutoSave || !fileName) {
                    statusText.textContent = 'Выберите файл для автосохранения ➜';
                    statusText.className = 'status-text';
                    statusDot.className = 'status-dot';
                    folderStatus.textContent = 'Папка не выбрана';
                    folderStatus.className = 'folder-status';
                    return false;
                }
                
                // Показываем предложение восстановить
                promptRestoreFile();
                return true;
            } catch (error) {
                console.error('Ошибка восстановления автосохранения:', error);
                return false;
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
                    <div class="transaction-item" data-id="${tx.id}">
                        <div class="tx-info">
                            <span class="tx-category">${catName}</span>
                            <span class="tx-type">${typeLabel}</span>
                            <span class="tx-date">${dateStr}</span>
                        </div>
                        <div class="tx-right">
                            <span class="tx-amount ${amountClass}">${tx.amount.toFixed(2)}</span>
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
                    const id = this.getAttribute('data-id');
                    openEditPopover(id);
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
        updateCategorySelects();
        renderTransactions();
        if (categoriesModal.classList.contains('active')) {
            renderModalCategories();
        }
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

    // === Инициализация с восстановлением ===
    async function init() {
            loadState();
    
            // Устанавливаем период
            periodSelect.value = currentPeriod;
            if (currentPeriod === 'custom') {
                if (customDateFrom) dateFrom.value = customDateFrom;
                if (customDateTo) dateTo.value = customDateTo;
                customPeriod.style.display = 'block';
            }
    
            // Рендерим данные
            renderAll();
    
            // Пытаемся восстановить файл для автосохранения (без автоматического диалога)
            restoreAutoSave();
    
            // === Event listeners ===
            addBtn.addEventListener('click', addTransaction);
            txAmount.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') addTransaction();
            });
            txType.addEventListener('change', updateCategorySelects);
    
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
    
            // === Файловые операции ===
            menuSelectFolderBtn.textContent = 'Выбрать файл для автосохранения';
            menuSelectFolderBtn.addEventListener('click', selectFileForAutoSave);
            
            menuExportBtn.addEventListener('click', exportData);
            menuImportBtn.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', function(e) {
                if (this.files && this.files[0]) {
                    importData(this.files[0]);
                    this.value = '';
                }
            });
    
            // Автосохранение при закрытии страницы
            window.addEventListener('beforeunload', function() {
                if (fileHandle) {
                    saveToFile();
                }
            });
        }

    init();
})();
