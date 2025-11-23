// IndexedDB Database Manager
class GymDatabase {
    constructor() {
        this.db = null;
        this.dbName = 'GymTrackerDB';
        this.dbVersion = 3; // Increment version for new stores and migration
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => reject(request.error);
            request.onsuccess = async () => {
                this.db = request.result;
                
                // Check if migration is needed
                const oldVersion = parseInt(localStorage.getItem('db_version') || '0');
                if (oldVersion < 3 && oldVersion > 0) {
                    await this.migrateToVersion3();
                }
                localStorage.setItem('db_version', '3');
                
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                const oldVersion = event.oldVersion || 0;

                // Muscle Groups store (kept for backward compatibility during migration)
                if (!db.objectStoreNames.contains('muscleGroups')) {
                    const muscleGroupStore = db.createObjectStore('muscleGroups', { keyPath: 'id', autoIncrement: true });
                    muscleGroupStore.createIndex('name', 'name', { unique: false });
                }

                // Workouts store (new in version 3)
                if (!db.objectStoreNames.contains('workouts')) {
                    const workoutStore = db.createObjectStore('workouts', { keyPath: 'id', autoIncrement: true });
                    workoutStore.createIndex('name', 'name', { unique: false });
                }

                // Tasks store
                if (!db.objectStoreNames.contains('tasks')) {
                    const taskStore = db.createObjectStore('tasks', { keyPath: 'id', autoIncrement: true });
                    taskStore.createIndex('muscleGroupId', 'muscleGroupId', { unique: false });
                } else if (oldVersion < 3) {
                    // Remove muscleGroupId index in version 3
                    const transaction = event.target.transaction;
                    const taskStore = transaction.objectStore('tasks');
                    if (taskStore.indexNames.contains('muscleGroupId')) {
                        taskStore.deleteIndex('muscleGroupId');
                    }
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

    // Migration from version 2 to 3: Convert muscle groups to workouts, make tasks independent
    async migrateToVersion3() {
        console.log('Starting migration to version 3...');
        
        try {
            // Get all muscle groups
            const muscleGroups = await this.getAllMuscleGroups();
            
            // Get all tasks (still have muscleGroupId)
            const allTasks = await this.getAllTasks();
            
            // Group tasks by muscleGroupId
            const tasksByGroup = {};
            for (const task of allTasks) {
                if (task.muscleGroupId) {
                    if (!tasksByGroup[task.muscleGroupId]) {
                        tasksByGroup[task.muscleGroupId] = [];
                    }
                    tasksByGroup[task.muscleGroupId].push(task);
                }
            }
            
            // Create workouts from muscle groups
            for (const group of muscleGroups) {
                const taskIds = tasksByGroup[group.id] 
                    ? tasksByGroup[group.id]
                        .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0))
                        .map(t => t.id)
                    : [];
                
                const workout = {
                    name: group.name,
                    taskIds: taskIds,
                    orderIndex: group.orderIndex || 0,
                    lastModified: group.lastModified || Date.now(),
                    deviceId: group.deviceId || this.getDeviceId()
                };
                
                await this.insertWorkout(workout);
            }
            
            // Remove muscleGroupId from all tasks
            for (const task of allTasks) {
                if (task.muscleGroupId) {
                    delete task.muscleGroupId;
                    await this.updateTask(task);
                }
            }
            
            console.log('Migration to version 3 completed successfully');
        } catch (error) {
            console.error('Migration error:', error);
            throw error;
        }
    }

    // Muscle Groups (kept for backward compatibility, will be deprecated)
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
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        
        // Add metadata
        muscleGroup.lastModified = Date.now();
        muscleGroup.deviceId = this.getDeviceId();
        
        // Get orderIndex if not provided - use count of items
        if (muscleGroup.orderIndex === undefined || muscleGroup.orderIndex === null) {
            try {
                // Use count() method which is faster and doesn't load all data
                const count = await this.getMuscleGroupCount();
                muscleGroup.orderIndex = count;
            } catch (error) {
                console.warn('Failed to get count, using 0:', error);
                muscleGroup.orderIndex = 0;
            }
        }
        
        // Now insert with the transaction
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction(['muscleGroups'], 'readwrite');
                const store = transaction.objectStore('muscleGroups');
                const request = store.add(muscleGroup);
                
                request.onsuccess = () => {
                    console.log('Insert successful, ID:', request.result);
                    resolve(request.result);
                };
                request.onerror = () => {
                    console.error('Insert error:', request.error);
                    reject(request.error);
                };
                
                transaction.onerror = () => {
                    console.error('Transaction error:', transaction.error);
                    reject(transaction.error);
                };
            } catch (error) {
                console.error('Error creating transaction:', error);
                reject(error);
            }
        });
    }

    // Get count of muscle groups (faster than getAll)
    async getMuscleGroupCount() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['muscleGroups'], 'readonly');
            const store = transaction.objectStore('muscleGroups');
            const request = store.count();
            
            request.onsuccess = () => resolve(request.result || 0);
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

    async getAllTasks() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['tasks'], 'readonly');
            const store = transaction.objectStore('tasks');
            const request = store.getAll();

            request.onsuccess = () => {
                const tasks = request.result || [];
                tasks.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
                resolve(tasks);
            };
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

    // Workouts (new structure in version 3)
    async getAllWorkouts() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['workouts'], 'readonly');
            const store = transaction.objectStore('workouts');
            const request = store.getAll();

            request.onsuccess = () => {
                const workouts = request.result || [];
                workouts.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
                resolve(workouts);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async getWorkoutById(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['workouts'], 'readonly');
            const store = transaction.objectStore('workouts');
            const request = store.get(id);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async insertWorkout(workout) {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        
        // Add metadata
        workout.lastModified = Date.now();
        workout.deviceId = this.getDeviceId();
        
        // Ensure taskIds is an array
        if (!workout.taskIds) {
            workout.taskIds = [];
        }
        
        // Get orderIndex if not provided
        if (workout.orderIndex === undefined || workout.orderIndex === null) {
            try {
                const count = await this.getWorkoutCount();
                workout.orderIndex = count;
            } catch (error) {
                console.warn('Failed to get count, using 0:', error);
                workout.orderIndex = 0;
            }
        }
        
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction(['workouts'], 'readwrite');
                const store = transaction.objectStore('workouts');
                const request = store.add(workout);
                
                request.onsuccess = () => {
                    console.log('Workout inserted, ID:', request.result);
                    resolve(request.result);
                };
                request.onerror = () => {
                    console.error('Insert error:', request.error);
                    reject(request.error);
                };
            } catch (error) {
                console.error('Error creating transaction:', error);
                reject(error);
            }
        });
    }

    async updateWorkout(workout) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['workouts'], 'readwrite');
            const store = transaction.objectStore('workouts');
            
            workout.lastModified = Date.now();
            workout.deviceId = this.getDeviceId();
            
            // Ensure taskIds is an array
            if (!workout.taskIds) {
                workout.taskIds = [];
            }
            
            const request = store.put(workout);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async deleteWorkout(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['workouts'], 'readwrite');
            const store = transaction.objectStore('workouts');
            const request = store.delete(id);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async getWorkoutCount() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['workouts'], 'readonly');
            const store = transaction.objectStore('workouts');
            const request = store.count();
            
            request.onsuccess = () => resolve(request.result || 0);
            request.onerror = () => reject(request.error);
        });
    }

    // Get tasks for a workout (by taskIds array)
    async getTasksByWorkout(workoutId) {
        const workout = await this.getWorkoutById(workoutId);
        if (!workout || !workout.taskIds || workout.taskIds.length === 0) {
            return [];
        }
        
        const allTasks = await this.getAllTasks();
        const taskMap = {};
        allTasks.forEach(task => {
            taskMap[task.id] = task;
        });
        
        // Return tasks in the order specified by taskIds array
        return workout.taskIds
            .map(id => taskMap[id])
            .filter(task => task !== undefined);
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

    // Clear all workout history (log entries) - keeps workouts and exercises
    async clearAllLogEntries() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['logEntries'], 'readwrite');
            const store = transaction.objectStore('logEntries');
            const request = store.clear();

            request.onsuccess = () => {
                console.log('All log entries cleared successfully');
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }

    // Check if workout completed today for a muscle group
    async isWorkoutCompletedToday(workoutId) {
        return new Promise(async (resolve, reject) => {
            try {
                const tasks = await this.getTasksByWorkout(workoutId);
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

    async getLastWorkoutDateForWorkout(workoutId) {
        return new Promise(async (resolve, reject) => {
            try {
                const tasks = await this.getTasksByWorkout(workoutId);
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

    async getAllVideos() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['videos'], 'readonly');
            const store = transaction.objectStore('videos');
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result || []);
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

