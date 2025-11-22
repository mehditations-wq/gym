// App State
let currentMuscleGroupId = null;
let currentTaskIndex = 0;
let taskStates = {};
let isOrderMode = false;
let taskToDelete = null;
let currentStep = 1;
let taskToEdit = null;

// Initialize app
async function init() {
    await db.init();
    githubSync.init();
    
    // DO NOT auto-sync on startup - causes infinite loop
    // User must manually sync if they want to download from GitHub
    
    await initializeDefaultMuscleGroups();
    updateSyncStatus();
    showHomeScreen();
}

// Initialize default muscle groups
async function initializeDefaultMuscleGroups() {
    const existingGroups = await db.getAllMuscleGroups();
    if (existingGroups.length === 0) {
        const defaultGroups = [
            { name: 'Chest' },
            { name: 'Back' },
            { name: 'Shoulders' },
            { name: 'Arms' },
            { name: 'Legs' },
            { name: 'Core' },
            { name: 'Cardio' },
            { name: 'Full Body' }
        ];
        await db.insertMuscleGroups(defaultGroups);
    }
}

// Navigation
function navigate(screen) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    
    switch(screen) {
        case 'home':
            showHomeScreen();
            break;
        case 'detail':
            showDetailScreen();
            break;
        case 'edit':
            showEditScreen();
            break;
        case 'add-task':
            showAddTaskScreen();
            break;
        case 'workout':
            showWorkoutScreen();
            break;
        case 'history':
            showHistoryScreen();
            break;
        case 'sync':
            showSyncScreen();
            break;
        case 'edit-task':
            showEditTaskScreen();
            break;
    }
}

// Home Screen
async function showHomeScreen() {
    const screen = document.getElementById('home-screen');
    screen.classList.add('active');
    
    const muscleGroups = await db.getAllMuscleGroups();
    const grid = document.getElementById('muscle-groups-grid');
    grid.innerHTML = '';
    
    for (const group of muscleGroups) {
        const lastWorkoutDate = await db.getLastWorkoutDateForMuscleGroup(group.id);
        const lastWorkoutText = lastWorkoutDate 
            ? `Last: ${formatDate(lastWorkoutDate)}`
            : 'No workouts yet';
        
        const card = document.createElement('div');
        card.className = 'muscle-group-card';
        card.onclick = () => {
            currentMuscleGroupId = group.id;
            navigate('detail');
        };
        card.innerHTML = `
            <h2>${group.name}</h2>
            <p>${lastWorkoutText}</p>
        `;
        grid.appendChild(card);
    }
}

// Detail Screen
async function showDetailScreen() {
    const screen = document.getElementById('detail-screen');
    screen.classList.add('active');
    
    const muscleGroup = await db.getMuscleGroupById(currentMuscleGroupId);
    document.getElementById('detail-title').textContent = muscleGroup.name;
    
    const tasks = await db.getTasksByMuscleGroup(currentMuscleGroupId);
    const startButton = document.getElementById('start-button');
    const emptyMessage = document.getElementById('empty-routine-message');
    
    if (tasks.length === 0) {
        startButton.disabled = true;
        emptyMessage.style.display = 'block';
    } else {
        startButton.disabled = false;
        emptyMessage.style.display = 'none';
    }
}

function startWorkout() {
    navigate('workout');
}

// Edit Screen
async function showEditScreen() {
    const screen = document.getElementById('edit-screen');
    screen.classList.add('active');
    
    isOrderMode = false;
    document.getElementById('order-toggle').textContent = 'ORDER';
    
    await loadTasksList();
}

async function loadTasksList() {
    const tasks = await db.getTasksByMuscleGroup(currentMuscleGroupId);
    const list = document.getElementById('tasks-list');
    list.innerHTML = '';
    
    tasks.forEach((task, index) => {
        const item = document.createElement('div');
        item.className = `task-item ${isOrderMode ? 'order-mode' : ''}`;
        item.innerHTML = `
            ${isOrderMode ? `
                <div class="task-order-controls">
                    <button onclick="moveTaskUp(${index})" ${index === 0 ? 'disabled' : ''}>↑</button>
                    <button onclick="moveTaskDown(${index})" ${index === tasks.length - 1 ? 'disabled' : ''}>↓</button>
                </div>
            ` : ''}
            <div class="task-name" onclick="editTask(${task.id})" style="cursor: pointer; flex: 1;">${task.name}</div>
            <button class="delete-button-icon" onclick="showDeleteDialog(${task.id})">🗑️</button>
        `;
        list.appendChild(item);
    });
}

function toggleOrderMode() {
    isOrderMode = !isOrderMode;
    document.getElementById('order-toggle').textContent = isOrderMode ? 'DONE' : 'ORDER';
    loadTasksList();
}

async function moveTaskUp(index) {
    const tasks = await db.getTasksByMuscleGroup(currentMuscleGroupId);
    if (index > 0) {
        const temp = tasks[index].orderIndex;
        tasks[index].orderIndex = tasks[index - 1].orderIndex;
        tasks[index - 1].orderIndex = temp;
        
        await db.updateTask(tasks[index]);
        await db.updateTask(tasks[index - 1]);
        await loadTasksList();
        await autoSync();
    }
}

async function moveTaskDown(index) {
    const tasks = await db.getTasksByMuscleGroup(currentMuscleGroupId);
    if (index < tasks.length - 1) {
        const temp = tasks[index].orderIndex;
        tasks[index].orderIndex = tasks[index + 1].orderIndex;
        tasks[index + 1].orderIndex = temp;
        
        await db.updateTask(tasks[index]);
        await db.updateTask(tasks[index + 1]);
        await loadTasksList();
        await autoSync();
    }
}

function showDeleteDialog(taskId) {
    taskToDelete = taskId;
    document.getElementById('delete-dialog').style.display = 'flex';
}

function closeDeleteDialog() {
    taskToDelete = null;
    document.getElementById('delete-dialog').style.display = 'none';
}

async function confirmDelete() {
    if (taskToDelete) {
        await db.deleteTask(taskToDelete);
        closeDeleteDialog();
        await loadTasksList();
        await autoSync();
    }
}

// Add Task Screen
function showAddTaskScreen() {
    const screen = document.getElementById('add-task-screen');
    screen.classList.add('active');
    
    currentStep = 1;
    document.getElementById('task-name').value = '';
    document.getElementById('task-tips').value = '';
    document.getElementById('task-instructions').value = '';
    document.getElementById('task-video').value = '';
    
    updateStepDisplay();
}

function updateStepDisplay() {
    document.querySelectorAll('.step').forEach(step => step.classList.remove('active'));
    document.getElementById(`step-${currentStep}`).classList.add('active');
    
    const backButton = document.getElementById('back-button');
    backButton.style.display = currentStep > 1 ? 'block' : 'none';
    
    const nextButton = document.getElementById('next-button');
    if (currentStep === 4) {
        nextButton.textContent = 'Save';
    } else if (currentStep === 3) {
        nextButton.textContent = 'Next (Video Optional)';
    } else {
        nextButton.textContent = 'Next';
    }
}

function previousStep() {
    if (currentStep > 1) {
        currentStep--;
        updateStepDisplay();
    }
}

function nextStep() {
    const taskName = document.getElementById('task-name').value.trim();
    
    if (currentStep === 1) {
        if (taskName) {
            currentStep++;
            updateStepDisplay();
        }
    } else if (currentStep === 2 || currentStep === 3) {
        currentStep++;
        updateStepDisplay();
    } else if (currentStep === 4) {
        saveTask();
    }
}

async function saveTask() {
    const taskName = document.getElementById('task-name').value.trim();
    const tips = document.getElementById('task-tips').value.trim();
    const instructions = document.getElementById('task-instructions').value.trim();
    const videoFile = document.getElementById('task-video').files[0];
    
    if (!taskName) {
        alert('Please enter a task name');
        return;
    }
    
    try {
        const tasks = await db.getTasksByMuscleGroup(currentMuscleGroupId);
        const orderIndex = tasks.length;
        
        let videoFileName = null;
        if (videoFile) {
            videoFileName = `video_${Date.now()}_${videoFile.name}`;
            const videoData = await fileToBase64(videoFile);
            await db.saveVideo(videoFileName, videoData);
        }
        
        const task = {
            muscleGroupId: currentMuscleGroupId,
            name: taskName,
            instructions: instructions,
            tips: tips,
            videoFileName: videoFileName,
            orderIndex: orderIndex
        };
        
        await db.insertTask(task);
        await autoSync();
        navigate('edit');
    } catch (error) {
        console.error('Error saving task:', error);
        alert('Failed to save task. Please try again.');
    }
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Workout Screen
async function showWorkoutScreen() {
    const screen = document.getElementById('workout-screen');
    screen.classList.add('active');
    
    const tasks = await db.getTasksByMuscleGroup(currentMuscleGroupId);
    if (tasks.length === 0) {
        alert('No tasks available. Please add tasks first.');
        navigate('detail');
        return;
    }
    
    currentTaskIndex = 0;
    taskStates = {};
    
    // Initialize task states
    for (const task of tasks) {
        const lastEntry = await db.getMostRecentEntry(task.id);
        taskStates[task.id] = {
            task: task,
            sets: lastEntry?.sets || 0,
            reps: lastEntry?.reps || 0,
            weightKg: lastEntry?.weightKg || 0,
            isDone: false,
            isSkipped: false,
            lastThreeEntries: await db.getLastThreeEntries(task.id)
        };
    }
    
    renderWorkoutPages(tasks);
    renderWorkoutProgress(tasks);
    showWorkoutPage(0);
    updateWorkoutActions();
}

function renderWorkoutPages(tasks) {
    const pager = document.getElementById('workout-pager');
    pager.innerHTML = '';
    
    tasks.forEach((task, index) => {
        const page = document.createElement('div');
        page.className = 'workout-page';
        page.id = `workout-page-${index}`;
        page.innerHTML = createWorkoutPageContent(task);
        pager.appendChild(page);
    });
}

function createWorkoutPageContent(task) {
    const state = taskStates[task.id];
    const hasVideo = state.task.videoFileName !== null;
    
    return `
        <div class="workout-content-inner">
            ${hasVideo ? `
                <button class="video-button" onclick="playVideo('${state.task.videoFileName}')">
                    ▶ Play Video
                </button>
            ` : ''}
            
            ${state.task.tips ? `
                <div class="collapsible-section" onclick="toggleCollapsible(this)">
                    <div class="collapsible-header">
                        <span>Tips</span>
                        <span>▼</span>
                    </div>
                    <div class="collapsible-content">${state.task.tips}</div>
                </div>
            ` : ''}
            
            ${state.task.instructions ? `
                <div class="collapsible-section" onclick="toggleCollapsible(this)">
                    <div class="collapsible-header">
                        <span>Instructions</span>
                        <span>▼</span>
                    </div>
                    <div class="collapsible-content">${state.task.instructions}</div>
                </div>
            ` : ''}
            
            <div class="counter-input">
                <label>Sets</label>
                <div class="counter-controls">
                    <button class="counter-button" onclick="updateSets(${task.id}, -1)">−</button>
                    <div class="counter-value" id="sets-${task.id}">${state.sets}</div>
                    <button class="counter-button" onclick="updateSets(${task.id}, 1)">+</button>
                </div>
            </div>
            
            <div class="counter-input">
                <label>Reps</label>
                <div class="counter-controls">
                    <button class="counter-button" onclick="updateReps(${task.id}, -1)">−</button>
                    <div class="counter-value" id="reps-${task.id}">${state.reps}</div>
                    <button class="counter-button" onclick="updateReps(${task.id}, 1)">+</button>
                </div>
            </div>
            
            <div class="weight-input">
                <label>Weight (kg)</label>
                <input type="number" step="0.1" id="weight-${task.id}" value="${state.weightKg || ''}" 
                       onchange="updateWeight(${task.id}, this.value)" />
            </div>
            
            ${state.lastThreeEntries.length > 0 ? `
                <div class="history-table">
                    <div class="history-table-header">
                        <div>Sets</div>
                        <div>Reps</div>
                        <div>Weight</div>
                        <div>Date</div>
                    </div>
                    ${state.lastThreeEntries.map(entry => `
                        <div class="history-table-row">
                            <div>${entry.sets}</div>
                            <div>${entry.reps}</div>
                            <div>${entry.weightKg} kg</div>
                            <div>${formatDate(entry.date)}</div>
                        </div>
                    `).join('')}
                </div>
            ` : ''}
        </div>
    `;
}

function updateWorkoutActions() {
    const tasks = Object.values(taskStates).map(s => s.task);
    const currentTask = tasks[currentTaskIndex];
    const state = taskStates[currentTask.id];
    
    const actionsContainer = document.getElementById('workout-actions-container');
    actionsContainer.innerHTML = `
        <button class="outlined-button" onclick="skipTask(${currentTask.id})">SKIP</button>
        <button class="primary-button" onclick="completeTask(${currentTask.id})">DONE</button>
    `;
}

function renderWorkoutProgress(tasks) {
    const progress = document.getElementById('workout-progress');
    progress.innerHTML = '';
    
    tasks.forEach((task, index) => {
        const indicator = document.createElement('div');
        indicator.className = 'progress-indicator';
        indicator.onclick = () => showWorkoutPage(index);
        progress.appendChild(indicator);
    });
    
    updateWorkoutProgress();
}

function showWorkoutPage(index) {
    document.querySelectorAll('.workout-page').forEach(page => page.classList.remove('active'));
    document.getElementById(`workout-page-${index}`).classList.add('active');
    currentTaskIndex = index;
    
    const tasks = Object.values(taskStates).map(s => s.task);
    document.getElementById('workout-title').textContent = tasks[index].name;
    
    updateWorkoutProgress();
    updateWorkoutActions();
}

function updateWorkoutProgress() {
    const tasks = Object.values(taskStates).map(s => s.task);
    const indicators = document.querySelectorAll('.progress-indicator');
    
    indicators.forEach((indicator, index) => {
        indicator.classList.remove('current', 'done', 'skipped');
        
        if (index === currentTaskIndex) {
            indicator.classList.add('current');
        }
        
        const taskId = tasks[index].id;
        const state = taskStates[taskId];
        if (state.isDone) {
            indicator.classList.add('done');
        } else if (state.isSkipped) {
            indicator.classList.add('skipped');
        }
    });
}

function updateSets(taskId, delta) {
    const state = taskStates[taskId];
    state.sets = Math.max(0, state.sets + delta);
    document.getElementById(`sets-${taskId}`).textContent = state.sets;
}

function updateReps(taskId, delta) {
    const state = taskStates[taskId];
    state.reps = Math.max(0, state.reps + delta);
    document.getElementById(`reps-${taskId}`).textContent = state.reps;
}

function updateWeight(taskId, value) {
    const state = taskStates[taskId];
    state.weightKg = parseFloat(value) || 0;
}

async function completeTask(taskId) {
    const state = taskStates[taskId];
    state.isDone = true;
    
    const logEntry = {
        taskId: taskId,
        date: Date.now(),
        sets: state.sets,
        reps: state.reps,
        weightKg: state.weightKg
    };
    
    await db.insertLogEntry(logEntry);
    await autoSync();
    
    const tasks = Object.values(taskStates).map(s => s.task);
    const currentIndex = tasks.findIndex(t => t.id === taskId);
    
    updateWorkoutProgress();
    
    if (currentIndex < tasks.length - 1) {
        showWorkoutPage(currentIndex + 1);
    } else {
        // Check if all tasks are done
        const allDone = tasks.every(t => taskStates[t.id].isDone);
        const skippedTasks = tasks.filter(t => taskStates[t.id].isSkipped && !taskStates[t.id].isDone);
        
        if (allDone) {
            showWorkoutCompleteDialog(true, []);
        } else {
            showWorkoutCompleteDialog(false, skippedTasks);
        }
    }
}

async function skipTask(taskId) {
    const state = taskStates[taskId];
    state.isSkipped = true;
    
    const tasks = Object.values(taskStates).map(s => s.task);
    const currentIndex = tasks.findIndex(t => t.id === taskId);
    
    updateWorkoutProgress();
    
    if (currentIndex < tasks.length - 1) {
        showWorkoutPage(currentIndex + 1);
    } else {
        // Check if all tasks are done
        const allDone = tasks.every(t => taskStates[t.id].isDone);
        const skippedTasks = tasks.filter(t => taskStates[t.id].isSkipped && !taskStates[t.id].isDone);
        
        if (allDone) {
            showWorkoutCompleteDialog(true, []);
        } else {
            showWorkoutCompleteDialog(false, skippedTasks);
        }
    }
}

function showWorkoutCompleteDialog(allDone, skippedTasks) {
    const dialog = document.getElementById('workout-complete-dialog');
    const title = document.getElementById('workout-complete-title');
    const message = document.getElementById('workout-complete-message');
    const buttons = document.getElementById('workout-complete-buttons');
    
    if (allDone) {
        title.textContent = 'Workout Complete!';
        message.textContent = 'Great job! You\'ve completed all exercises.';
        buttons.innerHTML = `
            <button class="primary-button" onclick="closeWorkoutCompleteDialog()">OK</button>
        `;
    } else {
        title.textContent = 'Workout Incomplete';
        message.textContent = `You have ${skippedTasks.length} skipped exercise${skippedTasks.length > 1 ? 's' : ''}. Would you like to complete them or finish anyway?`;
        buttons.innerHTML = `
            <button class="outlined-button" onclick="goToSkippedExercises()">Go to Skipped Exercises</button>
            <button class="primary-button" onclick="finishWorkoutAnyway()">Finish Anyway</button>
        `;
    }
    
    dialog.style.display = 'flex';
}

function closeWorkoutCompleteDialog() {
    document.getElementById('workout-complete-dialog').style.display = 'none';
    navigate('detail');
}

function goToSkippedExercises() {
    const tasks = Object.values(taskStates).map(s => s.task);
    const skippedTasks = tasks.filter(t => taskStates[t.id].isSkipped && !taskStates[t.id].isDone);
    
    if (skippedTasks.length > 0) {
        const firstSkippedIndex = tasks.findIndex(t => t.id === skippedTasks[0].id);
        document.getElementById('workout-complete-dialog').style.display = 'none';
        showWorkoutPage(firstSkippedIndex);
    }
}

function finishWorkoutAnyway() {
    closeWorkoutCompleteDialog();
}

// Edit Task functionality
async function editTask(taskId) {
    if (isOrderMode) {
        return; // Don't edit in order mode
    }
    
    taskToEdit = taskId;
    navigate('edit-task');
}

async function showEditTaskScreen() {
    if (!taskToEdit) {
        navigate('edit');
        return;
    }
    
    const screen = document.getElementById('edit-task-screen');
    screen.classList.add('active');
    
    const task = await db.getTaskById(taskToEdit);
    if (!task) {
        navigate('edit');
        return;
    }
    
    document.getElementById('edit-task-name').value = task.name;
    document.getElementById('edit-task-tips').value = task.tips || '';
    document.getElementById('edit-task-instructions').value = task.instructions || '';
    document.getElementById('edit-task-video').value = '';
    
    const removeVideoButton = document.getElementById('remove-video-button');
    if (task.videoFileName) {
        removeVideoButton.style.display = 'block';
    } else {
        removeVideoButton.style.display = 'none';
    }
}

async function saveEditedTask() {
    if (!taskToEdit) {
        return;
    }
    
    const taskName = document.getElementById('edit-task-name').value.trim();
    const tips = document.getElementById('edit-task-tips').value.trim();
    const instructions = document.getElementById('edit-task-instructions').value.trim();
    const videoFile = document.getElementById('edit-task-video').files[0];
    
    if (!taskName) {
        alert('Please enter a task name');
        return;
    }
    
    try {
        const task = await db.getTaskById(taskToEdit);
        if (!task) {
            alert('Task not found');
            navigate('edit');
            return;
        }
        
        // Update task properties
        task.name = taskName;
        task.tips = tips;
        task.instructions = instructions;
        
        // Handle video
        if (videoFile) {
            const videoFileName = `video_${Date.now()}_${videoFile.name}`;
            const videoData = await fileToBase64(videoFile);
            await db.saveVideo(videoFileName, videoData);
            task.videoFileName = videoFileName;
        }
        
        await db.updateTask(task);
        await autoSync();
        
        taskToEdit = null;
        navigate('edit');
    } catch (error) {
        console.error('Error saving task:', error);
        alert('Failed to save task. Please try again.');
    }
}

async function removeVideoFromTask() {
    if (!taskToEdit) {
        return;
    }
    
    if (confirm('Are you sure you want to remove the video from this exercise?')) {
        try {
            const task = await db.getTaskById(taskToEdit);
            if (task) {
                task.videoFileName = null;
                await db.updateTask(task);
                await autoSync();
                
                document.getElementById('remove-video-button').style.display = 'none';
                alert('Video removed successfully');
            }
        } catch (error) {
            console.error('Error removing video:', error);
            alert('Failed to remove video');
        }
    }
}

async function playVideo(videoFileName) {
    try {
        const videoData = await db.getVideo(videoFileName);
        if (videoData) {
            const videoWindow = window.open('', '_blank');
            videoWindow.document.write(`
                <html>
                    <head><title>Exercise Video</title></head>
                    <body style="margin:0;background:#000;display:flex;align-items:center;justify-content:center;height:100vh;">
                        <video controls autoplay style="max-width:100%;max-height:100%;">
                            <source src="${videoData}" type="video/mp4">
                            Your browser does not support the video tag.
                        </video>
                    </body>
                </html>
            `);
        } else {
            alert('Video not found');
        }
    } catch (error) {
        console.error('Error playing video:', error);
        alert('Error playing video');
    }
}

function toggleCollapsible(element) {
    element.classList.toggle('expanded');
}

// History Screen
async function showHistoryScreen() {
    const screen = document.getElementById('history-screen');
    screen.classList.add('active');
    
    const tasks = await db.getTasksByMuscleGroup(currentMuscleGroupId);
    const list = document.getElementById('history-list');
    list.innerHTML = '';
    
    for (const task of tasks) {
        const entries = await db.getLogEntriesByTask(task.id);
        if (entries.length > 0) {
            const item = document.createElement('div');
            item.className = 'history-task-item';
            item.innerHTML = `
                <div class="history-task-header" onclick="toggleHistoryTask(this.parentElement)">
                    <div class="history-task-name">${task.name}</div>
                    <div class="history-entry-count">${entries.length} entries</div>
                </div>
                <div class="history-entries">
                    ${entries.map(entry => `
                        <div class="history-entry">
                            <div>${entry.sets} sets × ${entry.reps} reps</div>
                            <div>${entry.weightKg} kg</div>
                            <div>${formatDate(entry.date)}</div>
                        </div>
                    `).join('')}
                </div>
            `;
            list.appendChild(item);
        }
    }
}

function toggleHistoryTask(element) {
    element.classList.toggle('expanded');
}

// Utility Functions
function formatDate(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) {
        return 'Today';
    } else if (diffDays === 2) {
        return 'Yesterday';
    } else if (diffDays <= 7) {
        return `${diffDays - 1} days ago`;
    } else {
        return date.toLocaleDateString();
    }
}

// Auto-sync helper (syncs in background without blocking)
async function autoSync() {
    if (githubSync.isAuthenticated()) {
        try {
            await githubSync.syncToGitHub();
            updateSyncStatus();
        } catch (error) {
            console.log('Auto-sync failed:', error);
        }
    }
}

// Update sync status in UI
function updateSyncStatus() {
    const syncButton = document.getElementById('sync-status-button');
    if (syncButton) {
        if (githubSync.isAuthenticated()) {
            syncButton.textContent = '✓ Synced';
            syncButton.style.color = 'green';
        } else {
            syncButton.textContent = '⚙️ Sync';
            syncButton.style.color = '';
        }
    }
}

// GitHub Sync Screen
async function showSyncScreen() {
    const screen = document.getElementById('sync-screen');
    screen.classList.add('active');
    
    const isAuthenticated = githubSync.isAuthenticated();
    const authSection = document.getElementById('sync-auth-section');
    const controlsSection = document.getElementById('sync-controls-section');
    const statusText = document.getElementById('sync-status-text');
    const statusInfo = document.getElementById('sync-status-info');
    
    if (isAuthenticated) {
        authSection.style.display = 'none';
        controlsSection.style.display = 'block';
        statusText.textContent = 'Connected to GitHub';
        statusText.style.color = 'green';
        
        const lastSync = localStorage.getItem('last_sync_time');
        const lastSyncElement = document.getElementById('last-sync-time');
        if (lastSync) {
            lastSyncElement.textContent = `Last synced: ${formatDate(parseInt(lastSync))}`;
        } else {
            lastSyncElement.textContent = 'Not synced yet';
        }
        
        // Show sync status info
        const gistId = githubSync.getGistId();
        if (gistId) {
            statusInfo.textContent = `Gist ID: ${gistId.substring(0, 8)}...`;
            statusInfo.style.color = 'var(--text-secondary)';
        } else {
            statusInfo.textContent = 'No Gist created yet. Upload data to create one.';
            statusInfo.style.color = 'var(--text-secondary)';
        }
        
        // Show local data count
        try {
            const groups = await db.getAllMuscleGroups();
            let taskCount = 0;
            let logCount = 0;
            for (const group of groups) {
                const tasks = await db.getTasksByMuscleGroup(group.id);
                taskCount += tasks.length;
                for (const task of tasks) {
                    const entries = await db.getLogEntriesByTask(task.id);
                    logCount += entries.length;
                }
            }
            const dataInfo = `Local data: ${groups.length} groups, ${taskCount} exercises, ${logCount} workout logs`;
            if (!statusInfo.textContent.includes('Local data')) {
                statusInfo.textContent += ` | ${dataInfo}`;
            }
        } catch (e) {
            console.log('Could not get data count:', e);
        }
    } else {
        authSection.style.display = 'block';
        controlsSection.style.display = 'none';
        statusText.textContent = 'Not connected to GitHub';
        statusText.style.color = 'red';
        if (statusInfo) {
            statusInfo.textContent = '';
        }
    }
}

async function connectGitHub() {
    const tokenInput = document.getElementById('github-token-input');
    const token = tokenInput.value.trim();
    
    if (!token) {
        alert('Please enter a GitHub token');
        return;
    }
    
    try {
        githubSync.setToken(token);
        // Test the token by trying to create/update a gist
        await githubSync.syncToGitHub();
        alert('Successfully connected to GitHub!');
        showSyncScreen();
        updateSyncStatus();
    } catch (error) {
        alert('Failed to connect: ' + error.message);
        githubSync.logout();
    }
}

async function syncToGitHub() {
    try {
        const button = event.target;
        button.disabled = true;
        button.textContent = 'Syncing...';
        
        console.log('Starting sync to GitHub...');
        await githubSync.syncToGitHub();
        localStorage.setItem('last_sync_time', Date.now().toString());
        
        alert('Successfully synced to GitHub! Your data is now saved in the cloud.');
        console.log('Upload completed successfully');
        showSyncScreen();
        updateSyncStatus();
    } catch (error) {
        console.error('Upload error details:', error);
        let errorMessage = 'Sync failed: ' + error.message;
        
        if (error.message.includes('401') || error.message.includes('Bad credentials')) {
            errorMessage += '\n\nYour GitHub token may be invalid or expired. Please disconnect and reconnect with a new token.';
        } else if (error.message.includes('network') || error.message.includes('fetch')) {
            errorMessage += '\n\nPlease check your internet connection and try again.';
        }
        
        alert(errorMessage);
    } finally {
        const button = event.target;
        button.disabled = false;
        button.textContent = 'Upload to GitHub';
    }
}

async function syncFromGitHub() {
    try {
        const button = event.target;
        button.disabled = true;
        button.textContent = 'Syncing...';
        
        console.log('Starting sync from GitHub...');
        const synced = await githubSync.syncFromGitHub();
        
        if (synced) {
            localStorage.setItem('last_sync_time', Date.now().toString());
            
            // Refresh the UI to show synced data (NO PAGE RELOAD)
            await initializeDefaultMuscleGroups();
            const currentScreen = document.querySelector('.screen.active');
            if (currentScreen && currentScreen.id === 'home-screen') {
                await showHomeScreen();
            } else if (currentMuscleGroupId) {
                await showDetailScreen();
            } else {
                await showHomeScreen();
            }
            updateSyncStatus();
            
            alert('Successfully synced from GitHub! Your data has been updated.');
            console.log('Sync completed successfully');
        } else {
            alert('No data found on GitHub. Make sure you\'ve uploaded data from another device first.');
        }
    } catch (error) {
        console.error('Sync error details:', error);
        let errorMessage = 'Sync failed: ' + error.message;
        
        if (error.message.includes('401') || error.message.includes('Bad credentials')) {
            errorMessage += '\n\nYour GitHub token may be invalid or expired. Please check your token and try again.';
        } else if (error.message.includes('404')) {
            errorMessage += '\n\nNo data found on GitHub. Make sure you\'ve uploaded data from another device first.';
        } else if (error.message.includes('network') || error.message.includes('fetch')) {
            errorMessage += '\n\nPlease check your internet connection and try again.';
        }
        
        alert(errorMessage);
    } finally {
        const button = event.target;
        button.disabled = false;
        button.textContent = 'Download from GitHub';
    }
}

function disconnectGitHub() {
    if (confirm('Are you sure you want to disconnect from GitHub? Your local data will remain, but it won\'t sync anymore.')) {
        githubSync.logout();
        showSyncScreen();
        updateSyncStatus();
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', init);

