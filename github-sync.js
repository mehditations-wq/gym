class GitHubSync {
    constructor() {
        this.token = localStorage.getItem('gym_github_token');
        this.gistId = localStorage.getItem('gym_gist_id');
        this.lastSync = parseInt(localStorage.getItem('gym_last_sync') || '0');
    }

    isAuthenticated() {
        return !!this.token;
    }

    setToken(token) {
        this.token = token;
        localStorage.setItem('gym_github_token', token);
    }

    logout() {
        this.token = null;
        this.gistId = null;
        localStorage.removeItem('gym_github_token');
        localStorage.removeItem('gym_gist_id');
        localStorage.removeItem('gym_last_sync');
    }

    async getGist() {
        if (!this.token) throw new Error('Not authenticated');

        // If we have a stored Gist ID, try to fetch it
        if (this.gistId) {
            const response = await fetch(`https://api.github.com/gists/${this.gistId}`, {
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (response.ok) {
                return await response.json();
            } else if (response.status === 404) {
                // Gist deleted, clear ID
                this.gistId = null;
                localStorage.removeItem('gym_gist_id');
            } else {
                throw new Error(`Failed to fetch Gist: ${response.statusText}`);
            }
        }

        // If no ID or not found, search for existing "GymTracker Data" gist
        const response = await fetch('https://api.github.com/gists', {
            headers: {
                'Authorization': `token ${this.token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (!response.ok) throw new Error('Failed to list Gists');

        const gists = await response.json();
        const existingGist = gists.find(g => g.description === 'GymTracker Data' && g.files['gym-data.json']);

        if (existingGist) {
            this.gistId = existingGist.id;
            localStorage.setItem('gym_gist_id', this.gistId);
            return existingGist;
        }

        return null;
    }

    async createGist(data) {
        const response = await fetch('https://api.github.com/gists', {
            method: 'POST',
            headers: {
                'Authorization': `token ${this.token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                description: 'GymTracker Data',
                public: false,
                files: {
                    'gym-data.json': {
                        content: JSON.stringify(data, null, 2)
                    }
                }
            })
        });

        if (!response.ok) throw new Error('Failed to create Gist');

        const gist = await response.json();
        this.gistId = gist.id;
        localStorage.setItem('gym_gist_id', this.gistId);
        return gist;
    }

    async updateGist(data) {
        if (!this.gistId) return await this.createGist(data);

        const response = await fetch(`https://api.github.com/gists/${this.gistId}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `token ${this.token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                files: {
                    'gym-data.json': {
                        content: JSON.stringify(data, null, 2)
                    }
                }
            })
        });

        if (!response.ok) throw new Error('Failed to update Gist');
        return await response.json();
    }

    async exportData() {
        const workouts = await db.getAllWorkouts();
        const tasks = await db.getAllTasks();

        // Get all log entries
        // Note: This could be large, but for a personal app it's likely fine.
        // In a real app we might want to chunk this or only sync recent/changed.
        // For this implementation, we follow the "sync all" approach from the readme.
        const allLogEntries = [];
        // We need to iterate all tasks to get their logs or use a cursor on the logEntries store.
        // Using a cursor on logEntries is more efficient.
        const logEntries = await new Promise((resolve, reject) => {
            const transaction = db.db.transaction('logEntries');
            const store = transaction.objectStore('logEntries');
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });

        return {
            version: 3,
            workouts,
            tasks,
            logEntries,
            lastSync: Date.now()
        };
    }

    async importData(remoteData) {
        if (!remoteData) return;

        // 1. Merge Workouts
        const localWorkouts = await db.getAllWorkouts();
        for (const remoteWorkout of remoteData.workouts || []) {
            const localMatch = localWorkouts.find(w => w.id === remoteWorkout.id || w.name === remoteWorkout.name);
            if (!localMatch) {
                await db.insertWorkout(remoteWorkout);
            } else if (remoteWorkout.lastModified > (localMatch.lastModified || 0)) {
                await db.updateWorkout({ ...remoteWorkout, id: localMatch.id });
            }
        }

        // 2. Merge Tasks
        const localTasks = await db.getAllTasks();
        for (const remoteTask of remoteData.tasks || []) {
            const localMatch = localTasks.find(t => t.id === remoteTask.id || t.name === remoteTask.name);
            if (!localMatch) {
                await db.insertTask(remoteTask);
            } else if (remoteTask.lastModified > (localMatch.lastModified || 0)) {
                await db.updateTask({ ...remoteTask, id: localMatch.id });
            }
        }

        // 3. Merge Log Entries (Deduplication)
        // We need to be careful here. We don't want to duplicate logs.
        // Strategy: Hash based on taskId (mapped), date (day), and content.

        // First, map remote task IDs to local task IDs if they differ (by name)
        const taskMap = new Map(); // remoteId -> localId
        const currentLocalTasks = await db.getAllTasks();
        for (const remoteTask of remoteData.tasks || []) {
            const match = currentLocalTasks.find(t => t.name === remoteTask.name);
            if (match) {
                taskMap.set(remoteTask.id, match.id);
            }
        }

        const localLogs = await new Promise((resolve) => {
            const req = db.db.transaction('logEntries').objectStore('logEntries').getAll();
            req.onsuccess = () => resolve(req.result);
        });

        for (const remoteLog of remoteData.logEntries || []) {
            // Map task ID
            const localTaskId = taskMap.get(remoteLog.taskId) || remoteLog.taskId;

            // Check for duplicate
            const isDuplicate = localLogs.some(localLog => {
                // Same task
                if (localLog.taskId !== localTaskId) return false;

                // Same date (within 1 minute tolerance or same day?)
                // Readme suggests day precision, but let's be safer with timestamp tolerance.
                if (Math.abs(localLog.date - remoteLog.date) > 60000) return false; // > 1 min diff

                // Same content (sets)
                if (JSON.stringify(localLog.sets) !== JSON.stringify(remoteLog.sets)) return false;

                return true;
            });

            if (!isDuplicate) {
                await db.insertLogEntry({ ...remoteLog, taskId: localTaskId, id: undefined }); // Let ID auto-increment
            }
        }
    }

    async syncToGitHub() {
        if (!this.isAuthenticated()) throw new Error('Not authenticated');

        // 1. Get remote data first (to merge)
        const gist = await this.getGist();
        let remoteData = null;
        if (gist && gist.files['gym-data.json']) {
            const content = gist.files['gym-data.json'].content;
            remoteData = JSON.parse(content);
        }

        // 2. Import remote changes to local (merge)
        if (remoteData) {
            await this.importData(remoteData);
        }

        // 3. Export combined data
        const currentData = await this.exportData();

        // 4. Upload
        await this.updateGist(currentData);

        this.lastSync = Date.now();
        localStorage.setItem('gym_last_sync', this.lastSync);

        return this.lastSync;
    }

    async syncFromGitHub() {
        if (!this.isAuthenticated()) throw new Error('Not authenticated');

        const gist = await this.getGist();
        if (!gist || !gist.files['gym-data.json']) {
            throw new Error('No data found on GitHub');
        }

        const content = gist.files['gym-data.json'].content;
        const remoteData = JSON.parse(content);

        await this.importData(remoteData);

        this.lastSync = Date.now();
        localStorage.setItem('gym_last_sync', this.lastSync);

        return this.lastSync;
    }
}

const gitHubSync = new GitHubSync();
