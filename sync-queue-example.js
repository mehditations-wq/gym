// Simplified Sync Queue Implementation
// This is a practical example you can integrate into the existing codebase

// Add this to database.js - Add sync queue store in init()
// In the onupgradeneeded handler, add:
/*
if (!db.objectStoreNames.contains('syncQueue')) {
    const queueStore = db.createObjectStore('syncQueue', { 
        keyPath: 'id', 
        autoIncrement: true 
    });
    queueStore.createIndex('timestamp', 'timestamp', { unique: false });
    queueStore.createIndex('status', 'status', { unique: false });
}
*/

// Add these methods to GymDatabase class in database.js:

async addToSyncQueue(operation, entityType, entityData) {
    return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(['syncQueue'], 'readwrite');
        const store = transaction.objectStore('syncQueue');
        const request = store.add({
            operation, // 'create', 'update', 'delete'
            entityType, // 'task', 'logEntry', 'muscleGroup'
            entityData: entityData,
            timestamp: Date.now(),
            retries: 0,
            status: 'pending',
            lastError: null
        });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async getSyncQueue(status = null) {
    return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(['syncQueue'], 'readonly');
        const store = transaction.objectStore('syncQueue');
        const request = status 
            ? store.index('status').getAll(status)
            : store.getAll();
        request.onsuccess = () => {
            const items = request.result || [];
            items.sort((a, b) => a.timestamp - b.timestamp);
            resolve(items);
        };
        request.onerror = () => reject(request.error);
    });
}

async removeFromSyncQueue(id) {
    return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(['syncQueue'], 'readwrite');
        const store = transaction.objectStore('syncQueue');
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async updateSyncQueueItem(id, updates) {
    return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(['syncQueue'], 'readwrite');
        const store = transaction.objectStore('syncQueue');
        const getRequest = store.get(id);
        getRequest.onsuccess = () => {
            const item = getRequest.result;
            if (!item) {
                reject(new Error('Queue item not found'));
                return;
            }
            Object.assign(item, updates);
            const putRequest = store.put(item);
            putRequest.onsuccess = () => resolve();
            putRequest.onerror = () => reject(putRequest.error);
        };
        getRequest.onerror = () => reject(getRequest.error);
    });
}

// Add to app.js - Replace autoSync function:

let syncQueueProcessor = null;
const MAX_SYNC_RETRIES = 3;
const SYNC_RETRY_DELAY = 30000; // 30 seconds

async function autoSync() {
    if (!githubSync.isAuthenticated()) {
        return;
    }
    
    // Add current operation to queue and process
    try {
        await processSyncQueue();
    } catch (error) {
        console.log('Auto-sync failed:', error);
        // Will retry later via queue processor
    }
}

async function processSyncQueue() {
    if (!githubSync.isAuthenticated() || !navigator.onLine) {
        return;
    }
    
    const queue = await db.getSyncQueue('pending');
    if (queue.length === 0) {
        updateSyncQueueStatus();
        return;
    }
    
    console.log(`Processing ${queue.length} items in sync queue...`);
    
    for (const item of queue) {
        if (item.retries >= MAX_SYNC_RETRIES) {
            await db.updateSyncQueueItem(item.id, { 
                status: 'failed',
                lastError: 'Max retries exceeded'
            });
            continue;
        }
        
        try {
            // Perform full sync (simplest approach - syncs all data)
            await githubSync.syncToGitHub();
            
            // Success - remove from queue
            await db.removeFromSyncQueue(item.id);
            console.log(`Synced queue item ${item.id}`);
        } catch (error) {
            // Failed - increment retries
            const newRetries = item.retries + 1;
            await db.updateSyncQueueItem(item.id, {
                retries: newRetries,
                lastError: error.message,
                lastRetry: Date.now()
            });
            
            console.log(`Sync failed for item ${item.id}, retry ${newRetries}/${MAX_SYNC_RETRIES}`);
            
            // If network error, stop processing (will retry when online)
            if (error.message.includes('network') || 
                error.message.includes('fetch') || 
                error.message.includes('Failed to fetch')) {
                break;
            }
        }
    }
    
    updateSyncQueueStatus();
}

function startSyncQueueProcessor() {
    // Process queue every 30 seconds
    if (syncQueueProcessor) {
        clearInterval(syncQueueProcessor);
    }
    
    syncQueueProcessor = setInterval(async () => {
        if (navigator.onLine && githubSync.isAuthenticated()) {
            await processSyncQueue();
        }
    }, SYNC_RETRY_DELAY);
    
    // Also process immediately
    processSyncQueue();
}

function stopSyncQueueProcessor() {
    if (syncQueueProcessor) {
        clearInterval(syncQueueProcessor);
        syncQueueProcessor = null;
    }
}

// Update sync status to show queue
async function updateSyncQueueStatus() {
    const queue = await db.getSyncQueue();
    const pendingCount = queue.filter(q => q.status === 'pending').length;
    const failedCount = queue.filter(q => q.status === 'failed').length;
    
    const syncButton = document.getElementById('sync-status-button');
    if (!syncButton) return;
    
    if (pendingCount > 0) {
        syncButton.textContent = `⏳ Sync (${pendingCount})`;
        syncButton.style.color = 'orange';
    } else if (failedCount > 0) {
        syncButton.textContent = `⚠️ Sync (${failedCount} failed)`;
        syncButton.style.color = 'red';
    } else {
        // Use existing updateSyncStatus function
        updateSyncStatus();
    }
}

// Listen for online/offline events
window.addEventListener('online', () => {
    console.log('Network online, processing sync queue...');
    processSyncQueue();
});

window.addEventListener('offline', () => {
    console.log('Network offline, queueing operations...');
});

// Modify existing functions to use queue:

// In saveTask() - Replace: await autoSync();
// With:
async function saveTask() {
    // ... existing code ...
    
    await db.insertTask(task);
    
    // Queue sync operation
    await db.addToSyncQueue('create', 'task', task);
    
    // Try to sync immediately
    await autoSync();
    
    navigate('edit');
}

// In updateTask() - Add queue:
async function saveEditedTask() {
    // ... existing code ...
    
    await db.updateTask(task);
    
    // Queue sync operation
    await db.addToSyncQueue('update', 'task', task);
    
    // Try to sync immediately
    await autoSync();
    
    taskToEdit = null;
    navigate('edit');
}

// In confirmDelete() - Add queue:
async function confirmDelete() {
    if (taskToDelete) {
        const task = await db.getTaskById(taskToDelete);
        
        await db.deleteTask(taskToDelete);
        
        // Queue sync operation
        await db.addToSyncQueue('delete', 'task', task);
        
        // Try to sync immediately
        await autoSync();
        
        closeDeleteDialog();
        await loadTasksList();
    }
}

// In completeTask() - Add queue:
async function completeTask(taskId) {
    // ... existing code ...
    
    await db.insertLogEntry(logEntry);
    
    // Queue sync operation
    await db.addToSyncQueue('create', 'logEntry', logEntry);
    
    // Try to sync immediately
    await autoSync();
    
    // ... rest of existing code ...
}

// Initialize queue processor on app start
// In init() function, add:
async function init() {
    await db.init();
    githubSync.init();
    
    // Start sync queue processor
    startSyncQueueProcessor();
    
    // ... rest of existing code ...
}

// Add UI to show and retry failed syncs in sync screen
// Add to showSyncScreen():
async function showSyncScreen() {
    // ... existing code ...
    
    // Show sync queue status
    const queue = await db.getSyncQueue();
    const pendingCount = queue.filter(q => q.status === 'pending').length;
    const failedCount = queue.filter(q => q.status === 'failed').length;
    
    // Add to sync screen HTML or create dynamically:
    const queueStatus = document.createElement('div');
    queueStatus.id = 'queue-status';
    queueStatus.className = 'queue-status';
    
    if (pendingCount > 0 || failedCount > 0) {
        queueStatus.innerHTML = `
            <h4>Sync Queue</h4>
            <p>Pending: ${pendingCount} | Failed: ${failedCount}</p>
            ${failedCount > 0 ? `
                <button class="outlined-button" onclick="retryFailedSyncs()">
                    Retry Failed Syncs
                </button>
            ` : ''}
        `;
        // Insert into sync screen
        const syncContent = document.querySelector('.sync-content');
        syncContent.insertBefore(queueStatus, syncContent.firstChild);
    }
}

async function retryFailedSyncs() {
    const failed = await db.getSyncQueue('failed');
    for (const item of failed) {
        await db.updateSyncQueueItem(item.id, {
            status: 'pending',
            retries: 0,
            lastError: null
        });
    }
    await processSyncQueue();
    showSyncScreen();
}

