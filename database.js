class GymDatabase {
    constructor() {
        this.dbName = 'GymTrackerDB';
        this.dbVersion = 3;
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = (event) => {
                console.error('Database error:', event.target.error);
                reject(event.target.error);
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                console.log('Database initialized successfully');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                const oldVersion = event.oldVersion;

                console.log(`Upgrading database from version ${oldVersion} to ${event.newVersion}`);

                // Version 1: Initial schema
                if (oldVersion < 1) {
                    // Log entries store
                    const logStore = db.createObjectStore('logEntries', { keyPath: 'id', autoIncrement: true });
                    logStore.createIndex('taskId', 'taskId', { unique: false });
                    logStore.createIndex('date', 'date', { unique: false });

                    // Tasks store
                    const taskStore = db.createObjectStore('tasks', { keyPath: 'id', autoIncrement: true });

                    // Videos store
                    db.createObjectStore('videos', { keyPath: 'id', autoIncrement: true });
                }

                // Version 2: Add sync queue
                if (oldVersion < 2) {
                    const syncStore = db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
                    syncStore.createIndex('timestamp', 'timestamp', { unique: false });
                    syncStore.createIndex('status', 'status', { unique: false });
                }

                // Version 3: Add workouts, migrate muscle groups
                if (oldVersion < 3) {
                    // Workouts store
                    const workoutStore = db.createObjectStore('workouts', { keyPath: 'id', autoIncrement: true });
                    workoutStore.createIndex('name', 'name', { unique: false });

                    // If we had a muscleGroups store (legacy), we would migrate here.
                    // Since this is a fresh install for this user, we just create the store.
                    // Note: In a real migration scenario, we'd read from muscleGroups and write to workouts.
                }
            };
        });
    }

    // Helper to wrap IDBRequest in Promise
    _promisify(request) {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // --- Workouts CRUD ---

    async getAllWorkouts() {
        return this._promisify(this.db.transaction('workouts').objectStore('workouts').getAll());
    }

    async getWorkoutById(id) {
        return this._promisify(this.db.transaction('workouts').objectStore('workouts').get(id));
    }

    async insertWorkout(workout) {
        const workoutWithMeta = {
            ...workout,
            lastModified: Date.now(),
            deviceId: localStorage.getItem('gym_device_id') || 'unknown'
        };
        const id = await this._promisify(this.db.transaction('workouts', 'readwrite').objectStore('workouts').add(workoutWithMeta));
        await this.addToSyncQueue('create', 'workout', { ...workoutWithMeta, id });
        return id;
    }

    async updateWorkout(workout) {
        const workoutWithMeta = {
            ...workout,
            lastModified: Date.now()
        };
        await this._promisify(this.db.transaction('workouts', 'readwrite').objectStore('workouts').put(workoutWithMeta));
        await this.addToSyncQueue('update', 'workout', workoutWithMeta);
    }

    async deleteWorkout(id) {
        // First get the workout to have data for sync (optional, but good for logs)
        const workout = await this.getWorkoutById(id);
        await this._promisify(this.db.transaction('workouts', 'readwrite').objectStore('workouts').delete(id));
        if (workout) {
            await this.addToSyncQueue('delete', 'workout', { id });
        }
    }

    // --- Tasks CRUD ---

    async getAllTasks() {
        return this._promisify(this.db.transaction('tasks').objectStore('tasks').getAll());
    }

    async getTaskById(id) {
        return this._promisify(this.db.transaction('tasks').objectStore('tasks').get(id));
    }

    async insertTask(task) {
        const taskWithMeta = {
            ...task,
            lastModified: Date.now(),
            deviceId: localStorage.getItem('gym_device_id') || 'unknown'
        };
        const id = await this._promisify(this.db.transaction('tasks', 'readwrite').objectStore('tasks').add(taskWithMeta));
        await this.addToSyncQueue('create', 'task', { ...taskWithMeta, id });
        return id;
    }

    async updateTask(task) {
        const taskWithMeta = {
            ...task,
            lastModified: Date.now()
        };
        await this._promisify(this.db.transaction('tasks', 'readwrite').objectStore('tasks').put(taskWithMeta));
        await this.addToSyncQueue('update', 'task', taskWithMeta);
    }

    async deleteTask(id) {
        const task = await this.getTaskById(id);
        await this._promisify(this.db.transaction('tasks', 'readwrite').objectStore('tasks').delete(id));
        if (task) {
            await this.addToSyncQueue('delete', 'task', { id });
        }
    }

    async getTasksByWorkout(workoutId) {
        const workout = await this.getWorkoutById(workoutId);
        if (!workout || !workout.taskIds || workout.taskIds.length === 0) return [];

        const tasks = [];
        for (const taskId of workout.taskIds) {
            const task = await this.getTaskById(taskId);
            if (task) tasks.push(task);
        }
        return tasks;
    }

    // --- Log Entries CRUD ---

    async getLogEntriesByTask(taskId) {
        const transaction = this.db.transaction('logEntries');
        const index = transaction.objectStore('logEntries').index('taskId');
        return this._promisify(index.getAll(taskId));
    }

    async insertLogEntry(entry) {
        const entryWithMeta = {
            ...entry,
            lastModified: Date.now(),
            deviceId: localStorage.getItem('gym_device_id') || 'unknown'
        };
        const id = await this._promisify(this.db.transaction('logEntries', 'readwrite').objectStore('logEntries').add(entryWithMeta));
        await this.addToSyncQueue('create', 'logEntry', { ...entryWithMeta, id });
        return id;
    }

    async updateLogEntry(entry) {
        const entryWithMeta = {
            ...entry,
            lastModified: Date.now()
        };
        await this._promisify(this.db.transaction('logEntries', 'readwrite').objectStore('logEntries').put(entryWithMeta));
        await this.addToSyncQueue('update', 'logEntry', entryWithMeta);
    }

    async deleteLogEntry(id) {
        const entry = await this._promisify(this.db.transaction('logEntries').objectStore('logEntries').get(id));
        await this._promisify(this.db.transaction('logEntries', 'readwrite').objectStore('logEntries').delete(id));
        if (entry) {
            await this.addToSyncQueue('delete', 'logEntry', { id });
        }
    }

    // --- Videos CRUD ---

    async saveVideo(fileName, data) {
        // Videos are not synced via Gists (too large)
        return this._promisify(this.db.transaction('videos', 'readwrite').objectStore('videos').add({ fileName, data }));
    }

    async getVideo(fileName) {
        const allVideos = await this._promisify(this.db.transaction('videos').objectStore('videos').getAll());
        return allVideos.find(v => v.fileName === fileName);
    }

    // --- Sync Queue ---

    async addToSyncQueue(operation, entityType, entityData) {
        // Don't sync if it's an internal update or if sync is disabled (logic handled in app/sync manager)
        // For now, we just queue everything. The sync manager will handle filtering/processing.
        const item = {
            operation,
            entityType,
            entityData,
            timestamp: Date.now(),
            retries: 0,
            status: 'pending',
            lastError: null,
            lastRetry: null
        };
        return this._promisify(this.db.transaction('syncQueue', 'readwrite').objectStore('syncQueue').add(item));
    }

    async getSyncQueue(status = 'pending') {
        const transaction = this.db.transaction('syncQueue');
        const index = transaction.objectStore('syncQueue').index('status');
        return this._promisify(index.getAll(status));
    }

    async removeFromSyncQueue(id) {
        return this._promisify(this.db.transaction('syncQueue', 'readwrite').objectStore('syncQueue').delete(id));
    }

    async updateSyncQueueItem(item) {
        return this._promisify(this.db.transaction('syncQueue', 'readwrite').objectStore('syncQueue').put(item));
    }
}

// Export instance
const db = new GymDatabase();
