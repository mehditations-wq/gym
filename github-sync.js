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

    // Export all data from IndexedDB, merging with existing GitHub data
    async exportData() {
        const workouts = await db.getAllWorkouts();
        const allTasks = await db.getAllTasks();
        const allVideos = [];

        // Get existing data from GitHub to merge
        let existingData = null;
        try {
            if (this.gistId) {
                existingData = await this.loadGist();
            }
        } catch (error) {
            console.log('Could not load existing GitHub data (first upload?):', error.message);
        }

        // Get all local log entries
        const localLogEntries = [];
        for (const task of allTasks) {
            const entries = await db.getLogEntriesByTask(task.id);
            localLogEntries.push(...entries);
        }

        // Merge log entries: combine existing remote entries with new local entries
        // Professional approach: Use content-based hashing for O(1) duplicate detection
        let mergedLogEntries = [];
        const entryHashMap = new Map(); // Map<hash, entry> for fast lookup
        
        // First, add all existing remote entries to the map
        if (existingData && existingData.logEntries) {
            for (const remoteEntry of existingData.logEntries) {
                const remoteTask = existingData.tasks?.find(t => t.id === remoteEntry.taskId);
                if (remoteTask) {
                    const hash = this.createEntryHash(remoteEntry, remoteTask.name);
                    entryHashMap.set(hash, remoteEntry);
                }
            }
        }
        
        // Then, add local entries that don't exist remotely
        for (const localEntry of localLogEntries) {
            const task = allTasks.find(t => t.id === localEntry.taskId);
            if (!task) continue;

            const hash = this.createEntryHash(localEntry, task.name);
            
            // Check if entry with this hash already exists
            if (!entryHashMap.has(hash)) {
                entryHashMap.set(hash, localEntry);
            } else {
                // Entry exists, but verify it's truly a duplicate (defensive check)
                const existingEntry = entryHashMap.get(hash);
                const existingTask = existingData?.tasks?.find(t => t.id === existingEntry.taskId);
                if (existingTask && !this.areEntriesDuplicate(localEntry, existingEntry, task.name, existingTask.name)) {
                    // Not a duplicate, add it (shouldn't happen with good hash, but safety check)
                    entryHashMap.set(hash + '_' + Date.now(), localEntry);
                }
            }
        }
        
        // Convert map values back to array
        mergedLogEntries = Array.from(entryHashMap.values());

        // Get all videos (limit size for GitHub)
        const videos = await this.exportVideos();
        allVideos.push(...videos);

        return {
            workouts,
            tasks: allTasks,
            logEntries: mergedLogEntries,
            videos: allVideos,
            version: 3,
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

    // Create a content-based hash for a log entry (professional deduplication approach)
    createEntryHash(entry, taskName) {
        // Normalize the entry data
        const normalizedSets = Array.isArray(entry.sets) 
            ? [...entry.sets]
                .sort((a, b) => {
                    // Sort by weight first, then reps for consistency
                    if (a.weightKg !== b.weightKg) return a.weightKg - b.weightKg;
                    return a.reps - b.reps;
                })
                .map(s => ({
                    reps: Number(s.reps) || 0,
                    weightKg: Number(s.weightKg) || 0
                }))
            : [];
        
        // Normalize date to day precision (ignore time for comparison)
        const dateNormalized = new Date(entry.date);
        dateNormalized.setHours(0, 0, 0, 0);
        const dateKey = dateNormalized.getTime();
        
        // Create a deterministic string representation
        const contentString = JSON.stringify({
            taskName: (taskName || '').toLowerCase().trim(),
            date: dateKey,
            sets: normalizedSets
        });
        
        // Simple hash function (for better performance than full JSON comparison)
        let hash = 0;
        for (let i = 0; i < contentString.length; i++) {
            const char = contentString.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        
        return hash.toString(36) + '_' + contentString.length;
    }

    // Check if two entries are duplicates (professional comparison)
    areEntriesDuplicate(entry1, entry2, taskName1, taskName2) {
        // Task names must match (case-insensitive)
        if (taskName1.toLowerCase().trim() !== taskName2.toLowerCase().trim()) {
            return false;
        }
        
        // Normalize dates to day precision
        const date1 = new Date(entry1.date);
        date1.setHours(0, 0, 0, 0);
        const date2 = new Date(entry2.date);
        date2.setHours(0, 0, 0, 0);
        
        if (date1.getTime() !== date2.getTime()) {
            return false;
        }
        
        // Normalize and compare sets
        const normalizeSets = (sets) => {
            if (!Array.isArray(sets)) return [];
            return [...sets]
                .sort((a, b) => {
                    if (a.weightKg !== b.weightKg) return a.weightKg - b.weightKg;
                    return a.reps - b.reps;
                })
                .map(s => ({
                    reps: Number(s.reps) || 0,
                    weightKg: Number(s.weightKg) || 0
                }));
        };
        
        const sets1 = normalizeSets(entry1.sets);
        const sets2 = normalizeSets(entry2.sets);
        
        if (sets1.length !== sets2.length) {
            return false;
        }
        
        // Compare each set
        for (let i = 0; i < sets1.length; i++) {
            if (sets1[i].reps !== sets2[i].reps || 
                Math.abs(sets1[i].weightKg - sets2[i].weightKg) > 0.01) {
                return false;
            }
        }
        
        return true;
    }

    // Import data into IndexedDB
    async importData(data) {
        try {
            let importedCount = {
                workouts: 0,
                tasks: 0,
                logEntries: 0
            };

            const isOldFormat = data.version < 3 || (data.muscleGroups && !data.workouts);

            // Handle old format (version 1 or 2) - convert muscle groups to workouts
            if (isOldFormat && data.muscleGroups) {
                // Convert old format to new format
                const workouts = [];
                for (const group of data.muscleGroups) {
                    const taskIds = data.tasks
                        ?.filter(t => t.muscleGroupId === group.id)
                        .map(t => t.id) || [];
                    workouts.push({
                        ...group,
                        taskIds: taskIds
                    });
                }
                data.workouts = workouts;
            }

            // Import workouts - merge by name if ID doesn't match
            if (data.workouts && data.workouts.length > 0) {
                const existingWorkouts = await db.getAllWorkouts();
                const existingWorkoutNames = new Set(existingWorkouts.map(w => w.name.toLowerCase()));
                
                for (const workout of data.workouts) {
                    const existingById = await db.getWorkoutById(workout.id);
                    const existingByName = existingWorkouts.find(w => w.name.toLowerCase() === workout.name.toLowerCase());
                    
                    if (existingById) {
                        // Update existing workout (preserve orderIndex if newer)
                        if (workout.lastModified && (!existingById.lastModified || workout.lastModified > existingById.lastModified)) {
                            existingById.name = workout.name;
                            existingById.orderIndex = workout.orderIndex !== undefined ? workout.orderIndex : existingById.orderIndex;
                            existingById.taskIds = workout.taskIds || [];
                            await db.updateWorkout(existingById);
                            importedCount.workouts++;
                        }
                    } else if (!existingByName) {
                        // New workout, insert it
                        await db.insertWorkout({ 
                            name: workout.name,
                            orderIndex: workout.orderIndex,
                            taskIds: workout.taskIds || []
                        });
                        importedCount.workouts++;
                    }
                }
            }

            // Import tasks - independent, match by name
            if (data.tasks && data.tasks.length > 0) {
                // Get all local tasks once at the start
                let allLocalTasks = await db.getAllTasks();
                const processedTaskNames = new Set(); // Track processed task names to avoid duplicates in same batch

                for (const task of data.tasks) {
                    // Remove muscleGroupId if present (old format)
                    const taskData = { ...task };
                    delete taskData.muscleGroupId;
                    const taskNameLower = task.name.toLowerCase();

                    // Skip if we've already processed a task with this name in this import batch
                    if (processedTaskNames.has(taskNameLower)) {
                        console.log(`Skipping duplicate task in import batch: ${task.name}`);
                        continue;
                    }

                    // Check if task exists by ID first
                    let existingTask = null;
                    if (task.id) {
                        existingTask = await db.getTaskById(task.id);
                    }

                    // If not found by ID, check by name (refresh list to catch any newly added tasks)
                    if (!existingTask) {
                        allLocalTasks = await db.getAllTasks(); // Refresh to catch any tasks added during import
                        existingTask = allLocalTasks.find(t => 
                            t.name.toLowerCase() === taskNameLower
                        );
                    }

                    if (existingTask) {
                        // Update existing task - only update if imported data is newer
                        if (task.lastModified && (!existingTask.lastModified || task.lastModified > existingTask.lastModified)) {
                            // Preserve the existing ID
                            const existingId = existingTask.id;
                            Object.assign(existingTask, taskData);
                            existingTask.id = existingId; // Ensure ID is preserved
                            await db.updateTask(existingTask);
                            importedCount.tasks++;
                            processedTaskNames.add(taskNameLower);
                        } else {
                            // Data is not newer, skip update but mark as processed
                            processedTaskNames.add(taskNameLower);
                        }
                    } else {
                        // New task, insert it
                        // Double-check it doesn't exist by name (one more time to be safe)
                        allLocalTasks = await db.getAllTasks();
                        const finalCheck = allLocalTasks.find(t => 
                            t.name.toLowerCase() === taskNameLower
                        );
                        
                        if (!finalCheck) {
                            const newTask = {
                                ...taskData,
                                id: undefined // Let database generate new ID
                            };
                            await db.insertTask(newTask);
                            importedCount.tasks++;
                            processedTaskNames.add(taskNameLower);
                        } else {
                            // Found it in final check, update it instead
                            const existingId = finalCheck.id;
                            Object.assign(finalCheck, taskData);
                            finalCheck.id = existingId;
                            await db.updateTask(finalCheck);
                            importedCount.tasks++;
                            processedTaskNames.add(taskNameLower);
                        }
                    }
                }
            }

            // Import log entries - professional deduplication using content-based hashing
            if (data.logEntries && data.logEntries.length > 0) {
                // Get all local tasks and entries
                const allLocalTasks = await db.getAllTasks();
                
                // Build a hash map of existing local entries for O(1) lookup
                const existingEntryHashes = new Set();
                const localEntriesByTask = new Map(); // taskId -> entries[]
                
                for (const task of allLocalTasks) {
                    const entries = await db.getLogEntriesByTask(task.id);
                    localEntriesByTask.set(task.id, entries);
                    
                    // Create hashes for all existing entries
                    for (const entry of entries) {
                        const hash = this.createEntryHash(entry, task.name);
                        existingEntryHashes.add(hash);
                    }
                }

                // Process remote entries
                for (const entry of data.logEntries) {
                    // Find the task this entry belongs to
                    const dataTask = data.tasks?.find(t => t.id === entry.taskId);
                    if (!dataTask) {
                        console.warn(`Could not find task for log entry with taskId: ${entry.taskId}`);
                        continue;
                    }

                    // Find matching local task by name
                    const matchingTask = allLocalTasks.find(t => 
                        t.name.toLowerCase() === dataTask.name.toLowerCase()
                    );

                    if (!matchingTask) {
                        console.warn(`Could not find matching local task for log entry: ${dataTask.name}`);
                        continue;
                    }

                    // Create hash for this entry
                    const entryHash = this.createEntryHash(entry, matchingTask.name);
                    
                    // Check if entry already exists using hash
                    if (existingEntryHashes.has(entryHash)) {
                        // Duplicate entry, skip it
                        continue;
                    }

                    // Additional defensive check: compare with actual entries (in case hash collision)
                    const localEntries = localEntriesByTask.get(matchingTask.id) || [];
                    const isDuplicate = localEntries.some(localEntry => 
                        this.areEntriesDuplicate(entry, localEntry, matchingTask.name, matchingTask.name)
                    );
                    
                    if (isDuplicate) {
                        // Found duplicate via comparison, skip it
                        continue;
                    }

                    // Entry doesn't exist, add it
                    const newEntry = {
                        ...entry,
                        taskId: matchingTask.id
                    };
                    await db.insertLogEntry(newEntry);
                    importedCount.logEntries++;
                    
                    // Add to hash set to prevent duplicates in same import batch
                    existingEntryHashes.add(entryHash);
                    
                    // Update local entries cache
                    localEntries.push(newEntry);
                    localEntriesByTask.set(matchingTask.id, localEntries);
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


