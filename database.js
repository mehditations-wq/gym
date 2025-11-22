// IndexedDB Database Manager
class GymDatabase {
    constructor() {
        this.db = null;
        this.dbName = 'GymTrackerDB';
        this.dbVersion = 1;
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
            };
        });
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
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['muscleGroups'], 'readwrite');
            const store = transaction.objectStore('muscleGroups');
            const request = store.add(muscleGroup);

            request.onsuccess = () => resolve(request.result);
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
            const request = store.add(task);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async updateTask(task) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['tasks'], 'readwrite');
            const store = transaction.objectStore('tasks');
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
            const request = store.add(logEntry);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
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
}

// Initialize database instance
const db = new GymDatabase();

