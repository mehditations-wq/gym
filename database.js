// IndexedDB Database Manager
class GymDatabase {
    constructor() {
        this.db = null;
        this.dbName = 'GymTrackerDB';
        this.dbVersion = 2; // Increment version for new stores
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                const oldVersion = event.oldVersion || 0;

                // Muscle Groups store
                if (!db.objectStoreNames.contains('muscleGroups')) {
                    const muscleGroupStore = db.createObjectStore('muscleGroups', { keyPath: 'id', autoIncrement: true });
                    muscleGroupStore.createIndex('name', 'name', { unique: false });
                }

                // Tasks store
                if (!db.objectStoreNames.contains('tasks')) {
                    const taskStore = db.createObjectStore('tasks', { keyPath: 'id', autoIncrement: true });
                    taskStore.createIndex('muscleGroupId', 'muscleGroupId', { unique: false });
                }

                // Log Entries store
                if (!db.objectStoreNames.contains('logEntries')) {
                    const logStore = db.createObjectStore('logEntries', { keyPath: 'id', autoIncrement: true });
                    logStore.createIndex('taskId', 'taskId', { unique: false });
                    logStore.createIndex('date', 'date', { unique: false });
                }

                // Videos store (for storing video data as base64)
                if (!db.objectStoreNames.contains('videos')) {
                    db.createObjectStore('videos', { keyPath: 'id', autoIncrement: true });
                }

                // Sync Queue store (added in version 2)
                if (oldVersion < 2 && !db.objectStoreNames.contains('syncQueue')) {
                    const queueStore = db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
                    queueStore.createIndex('timestamp', 'timestamp', { unique: false });
                    queueStore.createIndex('status', 'status', { unique: false });
                }
            };
        });
    }

    // Device ID generation
    getDeviceId() {
        let deviceId = localStorage.getItem('device_id');
        if (!deviceId) {
            deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('device_id', deviceId);
        }
        return deviceId;
    }

    // Muscle Groups
    async getAllMuscleGroups() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['muscleGroups'], 'readonly');
            const store = transaction.objectStore('muscleGroups');
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    async getMuscleGroupById(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['muscleGroups'], 'readonly');
            const store = transaction.objectStore('muscleGroups');
            const request = store.get(id);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async insertMuscleGroup(muscleGroup) {
        // Add metadata
        muscleGroup.lastModified = Date.now();
        muscleGroup.deviceId = this.getDeviceId();
        
        // Get orderIndex if not provided
        if (!muscleGroup.orderIndex && muscleGroup.orderIndex !== 0) {
            const groups = await this.getAllMuscleGroups();
            const maxOrder = groups.length > 0 
                ? Math.max(...groups.map(g => g.orderIndex || 0))
                : -1;
            muscleGroup.orderIndex = maxOrder + 1;
        }
        
        // Now insert with the transaction
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['muscleGroups'], 'readwrite');
            const store = transaction.objectStore('muscleGroups');
            const request = store.add(muscleGroup);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async updateMuscleGroup(muscleGroup) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['muscleGroups'], 'readwrite');
            const store = transaction.objectStore('muscleGroups');
            
            muscleGroup.lastModified = Date.now();
            muscleGroup.deviceId = this.getDeviceId();
            
            const request = store.put(muscleGroup);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async deleteMuscleGroup(id) {
        return new Promise(async (resolve, reject) => {
            try {
                // Delete all tasks and log entries for this muscle group
                const tasks = await this.getTasksByMuscleGroup(id);
                for (const task of tasks) {
                    await this.deleteTask(task.id);
                }
                
                // Delete the muscle group
                const transaction = this.db.transaction(['muscleGroups'], 'readwrite');
                const store = transaction.objectStore('muscleGroups');
                const request = store.delete(id);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            } catch (error) {
                reject(error);
            }
        });
    }

    async getAllMuscleGroups() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['muscleGroups'], 'readonly');
            const store = transaction.objectStore('muscleGroups');
            const request = store.getAll();

            request.onsuccess = () => {
                const groups = request.result || [];
                groups.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
                resolve(groups);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async insertMuscleGroups(muscleGroups) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['muscleGroups'], 'readwrite');
            const store = transaction.objectStore('muscleGroups');
            
            muscleGroups.forEach(group => {
                store.add(group);
            });

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    // Tasks
    async getTasksByMuscleGroup(muscleGroupId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['tasks'], 'readonly');
            const store = transaction.objectStore('tasks');
            const index = store.index('muscleGroupId');
            const request = index.getAll(muscleGroupId);

            request.onsuccess = () => {
                const tasks = request.result || [];
                tasks.sort((a, b) => a.orderIndex - b.orderIndex);
                resolve(tasks);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async getTaskById(taskId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['tasks'], 'readonly');
            const store = transaction.objectStore('tasks');
            const request = store.get(taskId);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async insertTask(task) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['tasks'], 'readwrite');
            const store = transaction.objectStore('tasks');
            
            task.lastModified = Date.now();
            task.deviceId = this.getDeviceId();
            
            const request = store.add(task);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async updateTask(task) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['tasks'], 'readwrite');
            const store = transaction.objectStore('tasks');
            
            task.lastModified = Date.now();
            task.deviceId = this.getDeviceId();
            
            const request = store.put(task);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async deleteTask(taskId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['tasks', 'logEntries'], 'readwrite');
            const taskStore = transaction.objectStore('tasks');
            const logStore = transaction.objectStore('logEntries');
            const logIndex = logStore.index('taskId');

            // Delete all log entries for this task
            logIndex.openCursor(IDBKeyRange.only(taskId)).onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                }
            };

            // Delete the task
            const request = taskStore.delete(taskId);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // Log Entries
    async getLogEntriesByTask(taskId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['logEntries'], 'readonly');
            const store = transaction.objectStore('logEntries');
            const index = store.index('taskId');
            const request = index.getAll(taskId);

            request.onsuccess = () => {
                const entries = request.result || [];
                entries.sort((a, b) => b.date - a.date);
                resolve(entries);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async getLastThreeEntries(taskId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['logEntries'], 'readonly');
            const store = transaction.objectStore('logEntries');
            const index = store.index('taskId');
            const request = index.getAll(taskId);

            request.onsuccess = () => {
                const entries = request.result || [];
                entries.sort((a, b) => b.date - a.date);
                resolve(entries.slice(0, 3));
            };
            request.onerror = () => reject(request.error);
        });
    }

    async getMostRecentEntry(taskId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['logEntries'], 'readonly');
            const store = transaction.objectStore('logEntries');
            const index = store.index('taskId');
            const request = index.getAll(taskId);

            request.onsuccess = () => {
                const entries = request.result || [];
                entries.sort((a, b) => b.date - a.date);
                resolve(entries[0] || null);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async insertLogEntry(logEntry) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['logEntries'], 'readwrite');
            const store = transaction.objectStore('logEntries');
            
            logEntry.lastModified = Date.now();
            logEntry.deviceId = this.getDeviceId();
            
            const request = store.add(logEntry);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async updateLogEntry(logEntry) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['logEntries'], 'readwrite');
            const store = transaction.objectStore('logEntries');
            
            logEntry.lastModified = Date.now();
            logEntry.deviceId = this.getDeviceId();
            
            const request = store.put(logEntry);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async getLogEntryById(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['logEntries'], 'readonly');
            const store = transaction.objectStore('logEntries');
            const request = store.get(id);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async deleteLogEntry(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['logEntries'], 'readwrite');
            const store = transaction.objectStore('logEntries');
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // Check if workout completed today for a muscle group
    async isWorkoutCompletedToday(muscleGroupId) {
        return new Promise(async (resolve, reject) => {
            try {
                const tasks = await this.getTasksByMuscleGroup(muscleGroupId);
                if (tasks.length === 0) {
                    resolve(false);
                    return;
                }

                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const todayStart = today.getTime();
                const todayEnd = todayStart + 24 * 60 * 60 * 1000;

                // Check if all tasks have entries today
                for (const task of tasks) {
                    const entries = await this.getLogEntriesByTask(task.id);
                    const todayEntries = entries.filter(e => 
                        e.date >= todayStart && e.date < todayEnd
                    );
                    if (todayEntries.length === 0) {
                        resolve(false);
                        return;
                    }
                }
                resolve(true);
            } catch (error) {
                reject(error);
            }
        });
    }

    async getLastWorkoutDateForMuscleGroup(muscleGroupId) {
        return new Promise(async (resolve, reject) => {
            try {
                const tasks = await this.getTasksByMuscleGroup(muscleGroupId);
                let latestDate = null;

                for (const task of tasks) {
                    const entries = await this.getLogEntriesByTask(task.id);
                    if (entries.length > 0) {
                        const taskLatest = entries[0].date;
                        if (!latestDate || taskLatest > latestDate) {
                            latestDate = taskLatest;
                        }
                    }
                }

                resolve(latestDate);
            } catch (error) {
                reject(error);
            }
        });
    }

    // Videos
    async saveVideo(fileName, videoData) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['videos'], 'readwrite');
            const store = transaction.objectStore('videos');
            const request = store.add({ fileName, data: videoData });

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getVideo(fileName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['videos'], 'readonly');
            const store = transaction.objectStore('videos');
            const request = store.openCursor();

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    if (cursor.value.fileName === fileName) {
                        resolve(cursor.value.data);
                        return;
                    }
                    cursor.continue();
                } else {
                    resolve(null);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    // Sync Queue operations
    async addToSyncQueue(operation, entityType, entityData) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['syncQueue'], 'readwrite');
            const store = transaction.objectStore('syncQueue');
            const request = store.add({
                operation,
                entityType,
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
}

// Initialize database instance
const db = new GymDatabase();

