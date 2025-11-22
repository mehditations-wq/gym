// App State
let currentMuscleGroupId = null;
let currentTaskIndex = 0;
let taskStates = {};
let isOrderMode = false;
let taskToDelete = null;
let currentStep = 1;
let taskToEdit = null;

// Sync queue processor
let syncQueueProcessor = null;
const MAX_SYNC_RETRIES = 3;
const SYNC_RETRY_DELAY = 30000; // 30 seconds
let lastLocalChangeTime = null;
let lastSyncTime = null;

// Initialize app
async function init() {
    await db.init();
    githubSync.init();
    
    // Initialize Google Drive if configured
    const clientId = googleDriveStorage.getClientId();
    if (clientId) {
        try {
            await googleDriveStorage.init(clientId);
        } catch (error) {
            console.error('Google Drive initialization failed:', error);
        }
    }
    
    // Load last sync time
    lastSyncTime = localStorage.getItem('last_sync_time') ? parseInt(localStorage.getItem('last_sync_time')) : null;
    lastLocalChangeTime = localStorage.getItem('last_local_change_time') ? parseInt(localStorage.getItem('last_local_change_time')) : null;
    
    // Start sync queue processor
    startSyncQueueProcessor();
    
    // DO NOT auto-sync on startup - causes infinite loop
    // User must manually sync if they want to download from GitHub
    
    await initializeDefaultMuscleGroups();
    updateSyncStatus();
    checkSyncNeeded();
    showHomeScreen();
}

// Initialize default muscle groups
async function initializeDefaultMuscleGroups() {
    const existingGroups = await db.getAllMuscleGroups();
    if (existingGroups.length === 0) {
        const defaultGroups = [
            { name: 'Chest', orderIndex: 0 },
            { name: 'Back', orderIndex: 1 },
            { name: 'Shoulders', orderIndex: 2 },
            { name: 'Arms', orderIndex: 3 },
            { name: 'Legs', orderIndex: 4 },
            { name: 'Core', orderIndex: 5 },
            { name: 'Cardio', orderIndex: 6 },
            { name: 'Full Body', orderIndex: 7 }
        ];
        for (const group of defaultGroups) {
            await db.insertMuscleGroup(group);
        }
    } else {
        // Ensure all existing groups have orderIndex
        for (const group of existingGroups) {
            if (group.orderIndex === undefined) {
                group.orderIndex = existingGroups.indexOf(group);
                await db.updateMuscleGroup(group);
            }
        }
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
        case 'manage-muscle-groups':
            showManageMuscleGroupsScreen();
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
    
    checkSyncNeeded();
}

// Muscle Group Management
function showAddMuscleGroupDialog() {
    document.getElementById('add-muscle-group-dialog').style.display = 'flex';
    document.getElementById('new-muscle-group-name').value = '';
    document.getElementById('new-muscle-group-name').focus();
}

function closeAddMuscleGroupDialog() {
    document.getElementById('add-muscle-group-dialog').style.display = 'none';
}

async function saveNewMuscleGroup() {
    const name = document.getElementById('new-muscle-group-name').value.trim();
    if (!name) {
        alert('Please enter a workout name');
        return;
    }
    
    try {
        await db.insertMuscleGroup({ name });
        await db.addToSyncQueue('create', 'muscleGroup', { name });
        await autoSync();
        closeAddMuscleGroupDialog();
        await showHomeScreen();
    } catch (error) {
        console.error('Error saving muscle group:', error);
        alert('Failed to save workout. Please try again.');
    }
}

let isMuscleGroupOrderMode = false;
let muscleGroupToEdit = null;
let muscleGroupToDelete = null;

async function showManageMuscleGroups() {
    navigate('manage-muscle-groups');
}

async function showManageMuscleGroupsScreen() {
    const screen = document.getElementById('manage-muscle-groups-screen');
    screen.classList.add('active');
    
    isMuscleGroupOrderMode = false;
    await loadMuscleGroupsList();
}

async function loadMuscleGroupsList() {
    const muscleGroups = await db.getAllMuscleGroups();
    const list = document.getElementById('muscle-groups-list');
    list.innerHTML = '';
    
    muscleGroups.forEach((group, index) => {
        const item = document.createElement('div');
        item.className = `task-item ${isMuscleGroupOrderMode ? 'order-mode' : ''}`;
        item.innerHTML = `
            ${isMuscleGroupOrderMode ? `
                <div class="task-order-controls">
                    <button onclick="moveMuscleGroupUp(${index})" ${index === 0 ? 'disabled' : ''}>↑</button>
                    <button onclick="moveMuscleGroupDown(${index})" ${index === muscleGroups.length - 1 ? 'disabled' : ''}>↓</button>
                </div>
            ` : ''}
            <div class="task-name" onclick="editMuscleGroup(${group.id})" style="cursor: pointer; flex: 1;">${group.name}</div>
            <button class="delete-button-icon" onclick="showDeleteMuscleGroupDialog(${group.id})">🗑️</button>
        `;
        list.appendChild(item);
    });
}

async function editMuscleGroup(id) {
    if (isMuscleGroupOrderMode) return;
    
    muscleGroupToEdit = id;
    const group = await db.getMuscleGroupById(id);
    const newName = prompt('Enter new name:', group.name);
    if (newName && newName.trim() && newName.trim() !== group.name) {
        group.name = newName.trim();
        await db.updateMuscleGroup(group);
        await db.addToSyncQueue('update', 'muscleGroup', group);
        await autoSync();
        await loadMuscleGroupsList();
    }
}

function showDeleteMuscleGroupDialog(id) {
    muscleGroupToDelete = id;
    if (confirm('Are you sure you want to delete this workout? All exercises and history will also be deleted.')) {
        confirmDeleteMuscleGroup();
    }
}

async function confirmDeleteMuscleGroup() {
    if (muscleGroupToDelete) {
        const group = await db.getMuscleGroupById(muscleGroupToDelete);
        await db.deleteMuscleGroup(muscleGroupToDelete);
        await db.addToSyncQueue('delete', 'muscleGroup', group);
        await autoSync();
        muscleGroupToDelete = null;
        await loadMuscleGroupsList();
    }
}

async function moveMuscleGroupUp(index) {
    const groups = await db.getAllMuscleGroups();
    if (index > 0) {
        const temp = groups[index].orderIndex;
        groups[index].orderIndex = groups[index - 1].orderIndex;
        groups[index - 1].orderIndex = temp;
        
        await db.updateMuscleGroup(groups[index]);
        await db.updateMuscleGroup(groups[index - 1]);
        await db.addToSyncQueue('update', 'muscleGroup', groups[index]);
        await db.addToSyncQueue('update', 'muscleGroup', groups[index - 1]);
        await autoSync();
        await loadMuscleGroupsList();
    }
}

async function moveMuscleGroupDown(index) {
    const groups = await db.getAllMuscleGroups();
    if (index < groups.length - 1) {
        const temp = groups[index].orderIndex;
        groups[index].orderIndex = groups[index + 1].orderIndex;
        groups[index + 1].orderIndex = temp;
        
        await db.updateMuscleGroup(groups[index]);
        await db.updateMuscleGroup(groups[index + 1]);
        await db.addToSyncQueue('update', 'muscleGroup', groups[index]);
        await db.addToSyncQueue('update', 'muscleGroup', groups[index + 1]);
        await autoSync();
        await loadMuscleGroupsList();
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

async function startWorkout() {
    // Check if workout already completed today
    const isCompleted = await db.isWorkoutCompletedToday(currentMuscleGroupId);
    if (isCompleted) {
        if (confirm('You have already completed this workout today. Do you want to start it again anyway?')) {
            navigate('workout');
        }
    } else {
        navigate('workout');
    }
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
        await db.addToSyncQueue('update', 'task', tasks[index]);
        await db.addToSyncQueue('update', 'task', tasks[index - 1]);
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
        await db.addToSyncQueue('update', 'task', tasks[index]);
        await db.addToSyncQueue('update', 'task', tasks[index + 1]);
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
        const task = await db.getTaskById(taskToDelete);
        await db.deleteTask(taskToDelete);
        await db.addToSyncQueue('delete', 'task', task);
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
    if (currentStep === 5) {
        nextButton.textContent = 'Save';
    } else if (currentStep === 4) {
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
    } else if (currentStep === 2 || currentStep === 3 || currentStep === 4) {
        currentStep++;
        updateStepDisplay();
    } else if (currentStep === 5) {
        saveTask();
    }
}

async function saveTask() {
    const taskName = document.getElementById('task-name').value.trim();
    const tips = document.getElementById('task-tips').value.trim();
    const instructions = document.getElementById('task-instructions').value.trim();
    const defaultSets = parseInt(document.getElementById('task-default-sets').value) || 3;
    const defaultReps = parseInt(document.getElementById('task-default-reps').value) || 10;
    const videoFile = document.getElementById('task-video').files[0];
    
    if (!taskName) {
        alert('Please enter a task name');
        return;
    }
    
    try {
        const tasks = await db.getTasksByMuscleGroup(currentMuscleGroupId);
        const orderIndex = tasks.length;
        
        let videoFileName = null;
        let videoUrl = null;
        
        if (videoFile) {
            videoFileName = `video_${Date.now()}_${videoFile.name}`;
            
            // Try to upload to Google Drive if configured
            if (googleDriveStorage.isConfigured()) {
                try {
                    // Ensure signed in
                    if (!(await googleDriveStorage.isSignedIn())) {
                        await googleDriveStorage.signIn();
                    }
                    const uploadResult = await googleDriveStorage.uploadVideo(videoFile, videoFileName);
                    videoUrl = uploadResult.url;
                    // Store fileId for later deletion
                    const videoData = await fileToBase64(videoFile);
                    await db.saveVideo(videoFileName, videoData);
                } catch (error) {
                    console.error('Google Drive upload failed, saving locally only:', error);
                    // Fallback to local storage
                    const videoData = await fileToBase64(videoFile);
                    await db.saveVideo(videoFileName, videoData);
                }
            } else {
                // Save locally only
                const videoData = await fileToBase64(videoFile);
                await db.saveVideo(videoFileName, videoData);
            }
        }
        
        const task = {
            muscleGroupId: currentMuscleGroupId,
            name: taskName,
            instructions: instructions,
            tips: tips,
            videoFileName: videoFileName,
            videoUrl: videoUrl,
            defaultSets: defaultSets,
            defaultReps: defaultReps,
            orderIndex: orderIndex
        };
        
        await db.insertTask(task);
        await db.addToSyncQueue('create', 'task', task);
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
    
    // Initialize task states with per-set tracking
    for (const task of tasks) {
        const defaultSets = task.defaultSets || 3;
        const defaultReps = task.defaultReps || 10;
        const lastEntry = await db.getMostRecentEntry(task.id);
        
        // Initialize sets array
        const sets = [];
        if (lastEntry && lastEntry.sets) {
            // If old format (single sets/reps/weight), convert to array
            if (Array.isArray(lastEntry.sets)) {
                sets.push(...lastEntry.sets);
            } else {
                // Convert old format to new format
                for (let i = 0; i < lastEntry.sets; i++) {
                    sets.push({
                        reps: lastEntry.reps || defaultReps,
                        weightKg: lastEntry.weightKg || 0
                    });
                }
            }
        } else {
            // Initialize with default sets
            for (let i = 0; i < defaultSets; i++) {
                sets.push({
                    reps: defaultReps,
                    weightKg: 0
                });
            }
        }
        
        taskStates[task.id] = {
            task: task,
            sets: sets,
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
    const hasVideo = state.task.videoFileName !== null || state.task.videoUrl !== null;
    
    // Generate sets HTML
    const setsHtml = state.sets.map((set, index) => `
        <div class="set-row" id="set-row-${task.id}-${index}">
            <div class="set-label">Set ${index + 1}</div>
            <div class="set-controls">
                <div class="set-reps">
                    <label>Reps</label>
                    <div class="counter-controls-small">
                        <button class="counter-button-small" onclick="updateSetReps(${task.id}, ${index}, -1)">−</button>
                        <div class="counter-value-small" id="reps-${task.id}-${index}">${set.reps}</div>
                        <button class="counter-button-small" onclick="updateSetReps(${task.id}, ${index}, 1)">+</button>
                    </div>
                </div>
                <div class="set-weight">
                    <label>Weight (kg)</label>
                    <input type="number" step="0.1" id="weight-${task.id}-${index}" value="${set.weightKg || ''}" 
                           onchange="updateSetWeight(${task.id}, ${index}, this.value)" />
                </div>
            </div>
        </div>
    `).join('');
    
    return `
        <div class="workout-content-inner">
            ${hasVideo ? `
                <button class="video-button" onclick="playVideo('${state.task.videoFileName || ''}', '${state.task.videoUrl || ''}')">
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
            
            <div class="sets-container">
                ${setsHtml}
                <button class="outlined-button" onclick="addSet(${task.id})" style="width: 100%; margin-top: 16px;">+ Add Set</button>
            </div>
            
            ${state.lastThreeEntries.length > 0 ? `
                <div class="history-table">
                    <div class="history-table-header">
                        <div>Sets</div>
                        <div>Reps</div>
                        <div>Weight</div>
                        <div>Date</div>
                    </div>
                    ${state.lastThreeEntries.map(entry => {
                        const setsDisplay = Array.isArray(entry.sets) 
                            ? entry.sets.map(s => `${s.reps}×${s.weightKg}kg`).join(', ')
                            : `${entry.sets} sets × ${entry.reps} reps`;
                        return `
                            <div class="history-table-row">
                                <div>${setsDisplay}</div>
                                <div>${Array.isArray(entry.sets) ? entry.sets.reduce((sum, s) => sum + s.reps, 0) : entry.reps}</div>
                                <div>${Array.isArray(entry.sets) ? entry.sets.map(s => s.weightKg).join('/') : entry.weightKg} kg</div>
                                <div>${formatDate(entry.date)}</div>
                            </div>
                        `;
                    }).join('')}
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

function updateSetReps(taskId, setIndex, delta) {
    const state = taskStates[taskId];
    if (state.sets[setIndex]) {
        state.sets[setIndex].reps = Math.max(0, state.sets[setIndex].reps + delta);
        document.getElementById(`reps-${taskId}-${setIndex}`).textContent = state.sets[setIndex].reps;
    }
}

function updateSetWeight(taskId, setIndex, value) {
    const state = taskStates[taskId];
    if (state.sets[setIndex]) {
        state.sets[setIndex].weightKg = parseFloat(value) || 0;
    }
}

function addSet(taskId) {
    const state = taskStates[taskId];
    const defaultReps = state.task.defaultReps || 10;
    state.sets.push({
        reps: defaultReps,
        weightKg: 0
    });
    
    // Re-render the page
    const tasks = Object.values(taskStates).map(s => s.task);
    const taskIndex = tasks.findIndex(t => t.id === taskId);
    renderWorkoutPages(tasks);
    showWorkoutPage(taskIndex);
}

async function completeTask(taskId) {
    const state = taskStates[taskId];
    state.isDone = true;
    
    // Calculate totals for backward compatibility
    const totalReps = state.sets.reduce((sum, set) => sum + set.reps, 0);
    const avgWeight = state.sets.length > 0 
        ? state.sets.reduce((sum, set) => sum + set.weightKg, 0) / state.sets.length 
        : 0;
    
    const logEntry = {
        taskId: taskId,
        date: Date.now(),
        sets: state.sets, // Store as array
        reps: totalReps, // Keep for backward compatibility
        weightKg: avgWeight, // Keep for backward compatibility
        setCount: state.sets.length
    };
    
    await db.insertLogEntry(logEntry);
    await db.addToSyncQueue('create', 'logEntry', logEntry);
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
    document.getElementById('edit-task-default-sets').value = task.defaultSets || 3;
    document.getElementById('edit-task-default-reps').value = task.defaultReps || 10;
    document.getElementById('edit-task-video').value = '';
    
    const removeVideoButton = document.getElementById('remove-video-button');
    if (task.videoFileName || task.videoUrl) {
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
        task.defaultSets = parseInt(document.getElementById('edit-task-default-sets').value) || 3;
        task.defaultReps = parseInt(document.getElementById('edit-task-default-reps').value) || 10;
        
        // Handle video
        if (videoFile) {
            const videoFileName = `video_${Date.now()}_${videoFile.name}`;
            
            // Try to upload to Google Drive if configured
            if (googleDriveStorage.isConfigured()) {
                try {
                    // Ensure signed in
                    if (!(await googleDriveStorage.isSignedIn())) {
                        await googleDriveStorage.signIn();
                    }
                    const uploadResult = await googleDriveStorage.uploadVideo(videoFile, videoFileName);
                    task.videoUrl = uploadResult.url;
                    // Store fileId for later deletion (we'll store it in videoFileName or a separate field)
                    // Also save locally as fallback
                    const videoData = await fileToBase64(videoFile);
                    await db.saveVideo(videoFileName, videoData);
                } catch (error) {
                    console.error('Google Drive upload failed, saving locally only:', error);
                    // Fallback to local storage
                    const videoData = await fileToBase64(videoFile);
                    await db.saveVideo(videoFileName, videoData);
                }
            } else {
                // Save locally only
                const videoData = await fileToBase64(videoFile);
                await db.saveVideo(videoFileName, videoData);
            }
            
            task.videoFileName = videoFileName;
        }
        
        await db.updateTask(task);
        await db.addToSyncQueue('update', 'task', task);
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
                // Try to delete from Google Drive if URL exists
                if (task.videoUrl && googleDriveStorage.isConfigured()) {
                    try {
                        const fileId = googleDriveStorage.extractFileId(task.videoUrl);
                        if (fileId) {
                            await googleDriveStorage.deleteVideo(fileId);
                        }
                    } catch (error) {
                        console.error('Failed to delete from Google Drive:', error);
                    }
                }
                
                task.videoFileName = null;
                task.videoUrl = null;
                await db.updateTask(task);
                await db.addToSyncQueue('update', 'task', task);
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

async function playVideo(videoFileName, videoUrl) {
    try {
        let videoSrc = null;
        
        // Try Google Drive URL first (or any cloud URL)
        if (videoUrl) {
            videoSrc = videoUrl;
        } else if (videoFileName) {
            // Try local storage
            const videoData = await db.getVideo(videoFileName);
            if (videoData) {
                videoSrc = videoData;
            }
        }
        
        if (videoSrc) {
            const videoWindow = window.open('', '_blank');
            videoWindow.document.write(`
                <html>
                    <head><title>Exercise Video</title></head>
                    <body style="margin:0;background:#000;display:flex;align-items:center;justify-content:center;height:100vh;">
                        <video controls autoplay style="max-width:100%;max-height:100%;">
                            <source src="${videoSrc}" type="video/mp4">
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
let entryToEdit = null;

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
            
            const entriesHtml = entries.map(entry => {
                const setsDisplay = Array.isArray(entry.sets) 
                    ? entry.sets.map(s => `${s.reps}×${s.weightKg}kg`).join(', ')
                    : `${entry.sets} sets × ${entry.reps} reps`;
                return `
                    <div class="history-entry" onclick="editHistoryEntry(${entry.id})">
                        <div>${setsDisplay}</div>
                        <div>${Array.isArray(entry.sets) ? entry.sets.reduce((sum, s) => sum + s.reps, 0) : entry.reps} reps</div>
                        <div>${Array.isArray(entry.sets) ? entry.sets.map(s => s.weightKg).join('/') : entry.weightKg} kg</div>
                        <div>${formatDate(entry.date)}</div>
                    </div>
                `;
            }).join('');
            
            item.innerHTML = `
                <div class="history-task-header" onclick="toggleHistoryTask(this.parentElement)">
                    <div class="history-task-name">${task.name}</div>
                    <div class="history-entry-count">${entries.length} entries</div>
                </div>
                <div class="history-entries">
                    ${entriesHtml}
                </div>
            `;
            list.appendChild(item);
        }
    }
}

async function editHistoryEntry(entryId) {
    entryToEdit = entryId;
    const entry = await db.getLogEntryById(entryId);
    if (!entry) {
        alert('Entry not found');
        return;
    }
    
    // Handle both old and new format
    if (Array.isArray(entry.sets)) {
        // New format - show first set values (or allow editing all sets)
        document.getElementById('edit-entry-sets').value = entry.sets.length;
        document.getElementById('edit-entry-reps').value = entry.sets[0]?.reps || entry.reps;
        document.getElementById('edit-entry-weight').value = entry.sets[0]?.weightKg || entry.weightKg;
    } else {
        // Old format
        document.getElementById('edit-entry-sets').value = entry.sets || 1;
        document.getElementById('edit-entry-reps').value = entry.reps || 0;
        document.getElementById('edit-entry-weight').value = entry.weightKg || 0;
    }
    
    const date = new Date(entry.date);
    const dateStr = date.toISOString().slice(0, 16);
    document.getElementById('edit-entry-date').value = dateStr;
    
    document.getElementById('edit-history-entry-dialog').style.display = 'flex';
}

function closeEditHistoryEntryDialog() {
    document.getElementById('edit-history-entry-dialog').style.display = 'none';
    entryToEdit = null;
}

async function saveEditedHistoryEntry() {
    if (!entryToEdit) return;
    
    const entry = await db.getLogEntryById(entryToEdit);
    if (!entry) {
        alert('Entry not found');
        return;
    }
    
    const sets = parseInt(document.getElementById('edit-entry-sets').value) || 1;
    const reps = parseInt(document.getElementById('edit-entry-reps').value) || 0;
    const weight = parseFloat(document.getElementById('edit-entry-weight').value) || 0;
    const dateStr = document.getElementById('edit-entry-date').value;
    const date = new Date(dateStr).getTime();
    
    // Convert to new format (array of sets)
    const setsArray = [];
    for (let i = 0; i < sets; i++) {
        setsArray.push({
            reps: reps,
            weightKg: weight
        });
    }
    
    entry.sets = setsArray;
    entry.reps = reps * sets; // Total reps
    entry.weightKg = weight;
    entry.date = date;
    
    await db.updateLogEntry(entry);
    await db.addToSyncQueue('update', 'logEntry', entry);
    await autoSync();
    
    closeEditHistoryEntryDialog();
    await showHistoryScreen();
}

async function deleteHistoryEntry() {
    if (!entryToEdit) return;
    
    if (confirm('Are you sure you want to delete this workout entry?')) {
        const entry = await db.getLogEntryById(entryToEdit);
        await db.deleteLogEntry(entryToEdit);
        await db.addToSyncQueue('delete', 'logEntry', entry);
        await autoSync();
        closeEditHistoryEntryDialog();
        await showHistoryScreen();
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
    if (!githubSync.isAuthenticated()) {
        return;
    }
    
    // Mark that we have local changes
    lastLocalChangeTime = Date.now();
    localStorage.setItem('last_local_change_time', lastLocalChangeTime.toString());
    
    // Try to sync immediately
    try {
        await processSyncQueue();
        checkSyncNeeded();
    } catch (error) {
        console.log('Auto-sync failed:', error);
        checkSyncNeeded();
    }
}

// Process sync queue
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
            
            // Success - remove from queue and update sync time
            await db.removeFromSyncQueue(item.id);
            lastSyncTime = Date.now();
            localStorage.setItem('last_sync_time', lastSyncTime.toString());
            lastLocalChangeTime = null;
            localStorage.removeItem('last_local_change_time');
            
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
    updateSyncStatus();
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

// Check if sync is needed
function checkSyncNeeded() {
    const warningElement = document.getElementById('sync-warning');
    if (!warningElement) return;
    
    if (!githubSync.isAuthenticated()) {
        warningElement.style.display = 'none';
        return;
    }
    
    // Check if there are pending sync items
    db.getSyncQueue('pending').then(queue => {
        if (queue.length > 0) {
            warningElement.style.display = 'inline';
            return;
        }
        
        // Check if local changes are newer than last sync
        if (lastLocalChangeTime && lastSyncTime && lastLocalChangeTime > lastSyncTime) {
            warningElement.style.display = 'inline';
        } else if (lastLocalChangeTime && !lastSyncTime) {
            warningElement.style.display = 'inline';
        } else {
            warningElement.style.display = 'none';
        }
    });
}

// Update sync queue status
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
    
    checkSyncNeeded();
}

// Update sync status in UI
function updateSyncStatus() {
    const syncButton = document.getElementById('sync-status-button');
    if (syncButton) {
        if (githubSync.isAuthenticated()) {
            if (lastSyncTime) {
                const syncDate = new Date(lastSyncTime);
                const now = new Date();
                const diffMs = now - syncDate;
                const diffMins = Math.floor(diffMs / 60000);
                const diffHours = Math.floor(diffMs / 3600000);
                const diffDays = Math.floor(diffMs / 86400000);
                
                let timeText = '';
                if (diffMins < 1) {
                    timeText = 'Just now';
                } else if (diffMins < 60) {
                    timeText = `${diffMins}m ago`;
                } else if (diffHours < 24) {
                    timeText = `${diffHours}h ago`;
                } else {
                    timeText = `${diffDays}d ago`;
                }
                
                syncButton.textContent = `✓ Synced ${timeText}`;
            } else {
                syncButton.textContent = '✓ Synced';
            }
            syncButton.style.color = 'green';
        } else {
            syncButton.textContent = '⚙️ Sync';
            syncButton.style.color = '';
        }
    }
    checkSyncNeeded();
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
            const syncDate = new Date(parseInt(lastSync));
            const formattedDate = syncDate.toLocaleString();
            lastSyncElement.textContent = `Last synced: ${formattedDate}`;
        } else {
            lastSyncElement.textContent = 'Not synced yet';
        }
        
        // Update Google Drive status
        const googleDriveStatus = document.getElementById('google-drive-status');
        const googleDriveButton = document.getElementById('google-drive-config-button');
        const signInButton = document.getElementById('google-drive-signin-button');
        
        if (googleDriveStorage.isConfigured()) {
            googleDriveStorage.isSignedIn().then(isSignedIn => {
                if (isSignedIn) {
                    googleDriveStatus.textContent = '✓ Google Drive configured and signed in';
                    googleDriveStatus.style.color = 'green';
                    googleDriveButton.textContent = 'Reconfigure Google Drive';
                    signInButton.style.display = 'none';
                } else {
                    googleDriveStatus.textContent = '⚠ Google Drive configured but not signed in. Click "Sign In" to enable video sync.';
                    googleDriveStatus.style.color = 'orange';
                    googleDriveButton.textContent = 'Reconfigure Google Drive';
                    signInButton.style.display = 'block';
                }
            });
        } else {
            googleDriveStatus.textContent = '⚠ Google Drive not configured. Videos will only be stored locally.';
            googleDriveStatus.style.color = 'orange';
            googleDriveButton.textContent = 'Configure Google Drive';
            signInButton.style.display = 'none';
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
        await processSyncQueue(); // Process any queued items first
        await githubSync.syncToGitHub();
        lastSyncTime = Date.now();
        localStorage.setItem('last_sync_time', lastSyncTime.toString());
        lastLocalChangeTime = null;
        localStorage.removeItem('last_local_change_time');
        
        alert('Successfully synced to GitHub! Your data is now saved in the cloud.');
        console.log('Upload completed successfully');
        showSyncScreen();
        updateSyncStatus();
        checkSyncNeeded();
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
            lastSyncTime = Date.now();
            localStorage.setItem('last_sync_time', lastSyncTime.toString());
            lastLocalChangeTime = null;
            localStorage.removeItem('last_local_change_time');
            
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
            checkSyncNeeded();
            
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

// Google Drive Config Dialog
function showGoogleDriveConfigDialog() {
    const clientId = googleDriveStorage.getClientId();
    if (clientId) {
        document.getElementById('google-drive-client-id').value = clientId;
    }
    document.getElementById('google-drive-config-dialog').style.display = 'flex';
}

function closeGoogleDriveConfigDialog() {
    document.getElementById('google-drive-config-dialog').style.display = 'none';
}

async function saveGoogleDriveConfig() {
    const clientId = document.getElementById('google-drive-client-id').value.trim();
    
    if (!clientId) {
        alert('Please enter your OAuth Client ID');
        return;
    }
    
    if (!clientId.includes('.apps.googleusercontent.com')) {
        if (!confirm('The Client ID should end with .apps.googleusercontent.com. Continue anyway?')) {
            return;
        }
    }
    
    try {
        googleDriveStorage.setClientId(clientId);
        await googleDriveStorage.init(clientId);
        closeGoogleDriveConfigDialog();
        showSyncScreen();
        alert('Google Drive configured successfully! Please sign in to enable video sync.');
    } catch (error) {
        alert('Failed to configure Google Drive: ' + error.message);
    }
}

async function signInGoogleDrive() {
    try {
        if (!googleDriveStorage.isConfigured()) {
            alert('Please configure Google Drive first');
            return;
        }
        
        await googleDriveStorage.signIn();
        showSyncScreen();
        alert('Successfully signed in to Google Drive!');
    } catch (error) {
        if (error.error === 'popup_closed_by_user') {
            alert('Sign in was cancelled');
        } else {
            alert('Failed to sign in: ' + error.message);
        }
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

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', init);

