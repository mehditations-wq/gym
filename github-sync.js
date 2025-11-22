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
    // Videos are now stored in Firebase Storage, so we export URLs from tasks
    async exportVideos() {
        // Videos are now stored with tasks (videoUrl field)
        // This function is kept for backward compatibility but returns empty array
        return [];
    }

    // Import data into IndexedDB
    async importData(data) {
        try {
            let importedCount = {
                muscleGroups: 0,
                tasks: 0,
                logEntries: 0
            };

            // Import muscle groups - merge by name if ID doesn't match
            if (data.muscleGroups && data.muscleGroups.length > 0) {
                const existingGroups = await db.getAllMuscleGroups();
                const existingGroupNames = new Set(existingGroups.map(g => g.name.toLowerCase()));
                
                for (const group of data.muscleGroups) {
                    const existingById = await db.getMuscleGroupById(group.id);
                    const existingByName = existingGroups.find(g => g.name.toLowerCase() === group.name.toLowerCase());
                    
                    if (existingById) {
                        // Update existing group (preserve orderIndex if newer)
                        if (group.lastModified && (!existingById.lastModified || group.lastModified > existingById.lastModified)) {
                            existingById.name = group.name;
                            existingById.orderIndex = group.orderIndex !== undefined ? group.orderIndex : existingById.orderIndex;
                            await db.updateMuscleGroup(existingById);
                            importedCount.muscleGroups++;
                        }
                    } else if (!existingByName) {
                        // New group, insert it
                        await db.insertMuscleGroup({ 
                            name: group.name,
                            orderIndex: group.orderIndex
                        });
                        importedCount.muscleGroups++;
                    }
                }
            }

            // Import tasks - match by muscleGroupId and name, update or insert
            if (data.tasks && data.tasks.length > 0) {
                const allLocalTasks = [];
                const allLocalGroups = await db.getAllMuscleGroups();
                for (const group of allLocalGroups) {
                    const tasks = await db.getTasksByMuscleGroup(group.id);
                    allLocalTasks.push(...tasks);
                }

                for (const task of data.tasks) {
                    // Find matching muscle group by name
                    const localGroups = await db.getAllMuscleGroups();
                    const matchingGroup = localGroups.find(g => {
                        // Try to find by ID first, then by name
                        const dataGroup = data.muscleGroups?.find(dg => dg.id === task.muscleGroupId);
                        if (dataGroup) {
                            return g.id === task.muscleGroupId || g.name.toLowerCase() === dataGroup.name.toLowerCase();
                        }
                        return false;
                    });

                    if (!matchingGroup) {
                        console.warn(`Could not find matching muscle group for task: ${task.name}`);
                        continue;
                    }

                    // Check if task exists by ID or by name in the same muscle group
                    const existingById = await db.getTaskById(task.id);
                    const existingByName = allLocalTasks.find(t => 
                        t.muscleGroupId === matchingGroup.id && 
                        t.name.toLowerCase() === task.name.toLowerCase()
                    );

                    if (existingById) {
                        // Update existing task
                        task.muscleGroupId = matchingGroup.id;
                        await db.updateTask(task);
                        importedCount.tasks++;
                    } else if (existingByName) {
                        // Update by name match
                        existingByName.name = task.name;
                        existingByName.instructions = task.instructions;
                        existingByName.tips = task.tips;
                        existingByName.videoFileName = task.videoFileName;
                        existingByName.videoUrl = task.videoUrl; // Include Firebase URL
                        existingByName.defaultSets = task.defaultSets || 3;
                        existingByName.defaultReps = task.defaultReps || 10;
                        existingByName.orderIndex = task.orderIndex;
                        await db.updateTask(existingByName);
                        importedCount.tasks++;
                    } else {
                        // New task, insert with correct muscleGroupId
                        const newTask = {
                            ...task,
                            muscleGroupId: matchingGroup.id,
                            id: undefined // Let database generate new ID
                        };
                        await db.insertTask(newTask);
                        importedCount.tasks++;
                    }
                }
            }

            // Import log entries - match by task name and date
            if (data.logEntries && data.logEntries.length > 0) {
                const allLocalTasks = [];
                const allLocalGroups = await db.getAllMuscleGroups();
                for (const group of allLocalGroups) {
                    const tasks = await db.getTasksByMuscleGroup(group.id);
                    allLocalTasks.push(...tasks);
                }

                for (const entry of data.logEntries) {
                    // Find the task this entry belongs to
                    const dataTask = data.tasks?.find(t => t.id === entry.taskId);
                    if (!dataTask) continue;

                    // Find matching local task by name
                    const matchingTask = allLocalTasks.find(t => 
                        t.name.toLowerCase() === dataTask.name.toLowerCase()
                    );

                    if (!matchingTask) {
                        console.warn(`Could not find matching task for log entry: ${dataTask.name}`);
                        continue;
                    }

                    // Check if entry already exists
                    const existingEntries = await db.getLogEntriesByTask(matchingTask.id);
                    const duplicate = existingEntries.find(e => 
                        Math.abs(e.date - entry.date) < 60000 && // Within 1 minute
                        e.sets === entry.sets &&
                        e.reps === entry.reps &&
                        Math.abs(e.weightKg - entry.weightKg) < 0.01
                    );
                    
                    if (!duplicate) {
                        const newEntry = {
                            ...entry,
                            taskId: matchingTask.id
                        };
                        await db.insertLogEntry(newEntry);
                        importedCount.logEntries++;
                    }
                }
            }

            console.log('Import summary:', importedCount);
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


