// GitHub Gists Sync Manager
class GitHubSync {
    constructor() {
        this.gistId = null;
        this.token = null;
        this.syncInProgress = false;
    }

    // Initialize with token from localStorage
    init() {
        const savedToken = localStorage.getItem('github_token');
        const savedGistId = localStorage.getItem('github_gist_id');
        
        if (savedToken) {
            this.token = savedToken;
        }
        if (savedGistId) {
            this.gistId = savedGistId;
        }
    }

    // Set GitHub token
    setToken(token) {
        this.token = token;
        localStorage.setItem('github_token', token);
    }

    // Get GitHub token
    getToken() {
        return this.token;
    }

    // Check if authenticated
    isAuthenticated() {
        return !!this.token;
    }

    // Save Gist ID
    setGistId(gistId) {
        this.gistId = gistId;
        localStorage.setItem('github_gist_id', gistId);
    }

    // Get Gist ID
    getGistId() {
        return this.gistId;
    }

    // Make GitHub API request
    async apiRequest(url, options = {}) {
        if (!this.token) {
            throw new Error('GitHub token not set');
        }

        const response = await fetch(url, {
            ...options,
            headers: {
                'Authorization': `token ${this.token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
                ...options.headers
            }
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: response.statusText }));
            throw new Error(error.message || `GitHub API error: ${response.status}`);
        }

        return response.json();
    }

    // Create or update Gist
    async saveGist(data) {
        if (this.syncInProgress) {
            console.log('Sync already in progress, skipping...');
            return;
        }

        this.syncInProgress = true;

        try {
            const content = JSON.stringify(data, null, 2);
            const gistData = {
                description: 'Gym Tracker Data',
                public: false,
                files: {
                    'gym-tracker-data.json': {
                        content: content
                    }
                }
            };

            let result;
            if (this.gistId) {
                // Update existing gist
                result = await this.apiRequest(
                    `https://api.github.com/gists/${this.gistId}`,
                    {
                        method: 'PATCH',
                        body: JSON.stringify(gistData)
                    }
                );
            } else {
                // Create new gist
                result = await this.apiRequest(
                    'https://api.github.com/gists',
                    {
                        method: 'POST',
                        body: JSON.stringify(gistData)
                    }
                );
                this.setGistId(result.id);
            }

            return result;
        } catch (error) {
            console.error('Error saving to GitHub:', error);
            throw error;
        } finally {
            this.syncInProgress = false;
        }
    }

    // Load data from Gist
    async loadGist() {
        if (!this.gistId) {
            return null;
        }

        try {
            const gist = await this.apiRequest(
                `https://api.github.com/gists/${this.gistId}`
            );

            const file = gist.files['gym-tracker-data.json'];
            if (!file) {
                return null;
            }

            return JSON.parse(file.content);
        } catch (error) {
            console.error('Error loading from GitHub:', error);
            throw error;
        }
    }

    // Export all data from IndexedDB
    async exportData() {
        const muscleGroups = await db.getAllMuscleGroups();
        const allTasks = [];
        const allLogEntries = [];
        const allVideos = [];

        // Get all tasks
        for (const group of muscleGroups) {
            const tasks = await db.getTasksByMuscleGroup(group.id);
            allTasks.push(...tasks);
        }

        // Get all log entries
        for (const task of allTasks) {
            const entries = await db.getLogEntriesByTask(task.id);
            allLogEntries.push(...entries);
        }

        // Get all videos (limit size for GitHub)
        const videos = await this.exportVideos();
        allVideos.push(...videos);

        return {
            muscleGroups,
            tasks: allTasks,
            logEntries: allLogEntries,
            videos: allVideos,
            version: 1,
            lastSync: Date.now()
        };
    }

    // Export videos (only metadata, not full data due to size limits)
    async exportVideos() {
        if (!db.db) {
            return [];
        }
        
        return new Promise((resolve, reject) => {
            const transaction = db.db.transaction(['videos'], 'readonly');
            const store = transaction.objectStore('videos');
            const request = store.getAll();

            request.onsuccess = () => {
                const videos = request.result || [];
                // Only export video metadata, not the full base64 data
                // Full videos will remain in IndexedDB for now
                resolve(videos.map(v => ({
                    id: v.id,
                    fileName: v.fileName,
                    // Note: Full video data is too large for Gist, keeping in IndexedDB
                    hasVideo: true
                })));
            };
            request.onerror = () => reject(request.error);
        });
    }

    // Import data into IndexedDB
    async importData(data) {
        try {
            // Clear existing data (optional - you might want to merge instead)
            // For now, we'll import and let IndexedDB handle duplicates

            // Import muscle groups
            if (data.muscleGroups) {
                for (const group of data.muscleGroups) {
                    const existing = await db.getMuscleGroupById(group.id);
                    if (!existing) {
                        await db.insertMuscleGroup(group);
                    }
                }
            }

            // Import tasks
            if (data.tasks) {
                for (const task of data.tasks) {
                    const existing = await db.getTaskById(task.id);
                    if (!existing) {
                        await db.insertTask(task);
                    } else {
                        await db.updateTask(task);
                    }
                }
            }

            // Import log entries
            if (data.logEntries) {
                for (const entry of data.logEntries) {
                    // Check if entry already exists (by date and taskId)
                    const existing = await db.getLogEntriesByTask(entry.taskId);
                    const duplicate = existing.find(e => 
                        e.taskId === entry.taskId && 
                        e.date === entry.date &&
                        e.sets === entry.sets &&
                        e.reps === entry.reps
                    );
                    
                    if (!duplicate) {
                        await db.insertLogEntry(entry);
                    }
                }
            }

            // Videos are kept in IndexedDB (too large for Gist)
            // Video metadata is synced but actual video data stays local

            return true;
        } catch (error) {
            console.error('Error importing data:', error);
            throw error;
        }
    }

    // Sync to GitHub
    async syncToGitHub() {
        if (!this.isAuthenticated()) {
            throw new Error('Not authenticated with GitHub');
        }

        try {
            const data = await this.exportData();
            await this.saveGist(data);
            return true;
        } catch (error) {
            console.error('Sync to GitHub failed:', error);
            throw error;
        }
    }

    // Sync from GitHub
    async syncFromGitHub() {
        if (!this.isAuthenticated()) {
            throw new Error('Not authenticated with GitHub');
        }

        try {
            const data = await this.loadGist();
            if (data) {
                await this.importData(data);
                return true;
            }
            return false;
        } catch (error) {
            console.error('Sync from GitHub failed:', error);
            throw error;
        }
    }

    // Logout
    logout() {
        this.token = null;
        this.gistId = null;
        localStorage.removeItem('github_token');
        localStorage.removeItem('github_gist_id');
    }
}

// Initialize GitHub sync instance
const githubSync = new GitHubSync();

