// App State
let currentWorkoutId = null;
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
    
    
    // Load last sync time
    lastSyncTime = localStorage.getItem('last_sync_time') ? parseInt(localStorage.getItem('last_sync_time')) : null;
    lastLocalChangeTime = localStorage.getItem('last_local_change_time') ? parseInt(localStorage.getItem('last_local_change_time')) : null;
    
    // Start sync queue processor
    startSyncQueueProcessor();
    
    // DO NOT auto-sync on startup - causes infinite loop
    // User must manually sync if they want to download from GitHub
    
    await initializeDefaultWorkouts();
    updateSyncStatus();
    checkSyncNeeded();
    showHomeScreen();
}

// Initialize default workouts
async function initializeDefaultWorkouts() {
    const existingWorkouts = await db.getAllWorkouts();
    if (existingWorkouts.length === 0) {
        const defaultWorkouts = [
            { name: 'Chest', orderIndex: 0, taskIds: [] },
            { name: 'Back', orderIndex: 1, taskIds: [] },
            { name: 'Shoulders', orderIndex: 2, taskIds: [] },
            { name: 'Arms', orderIndex: 3, taskIds: [] },
            { name: 'Legs', orderIndex: 4, taskIds: [] },
            { name: 'Core', orderIndex: 5, taskIds: [] },
            { name: 'Cardio', orderIndex: 6, taskIds: [] },
            { name: 'Full Body', orderIndex: 7, taskIds: [] }
        ];
        for (const workout of defaultWorkouts) {
            await db.insertWorkout(workout);
        }
    } else {
        // Ensure all existing workouts have orderIndex
        for (const workout of existingWorkouts) {
            if (workout.orderIndex === undefined) {
                workout.orderIndex = existingWorkouts.indexOf(workout);
                await db.updateWorkout(workout);
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
            // History screen is shown via showTaskHistory(taskId)
            // Don't call showHistoryScreen() here as it needs a taskId
            break;
        case 'sync':
            showSyncScreen();
            break;
        case 'edit-task':
            showEditTaskScreen();
            break;
        case 'manage-muscle-groups':
            showManageWorkoutsScreen();
            break;
        case 'manage-tasks':
            showManageTasksScreenContent();
            break;
    }
}

// Home Screen
async function showHomeScreen() {
    const screen = document.getElementById('home-screen');
    screen.classList.add('active');
    
    const workouts = await db.getAllWorkouts();
    const grid = document.getElementById('muscle-groups-grid');
    grid.innerHTML = '';
    
    for (const workout of workouts) {
        const lastWorkoutDate = await db.getLastWorkoutDateForWorkout(workout.id);
        const lastWorkoutText = lastWorkoutDate 
            ? `Last: ${formatDate(lastWorkoutDate)}`
            : 'No workouts yet';
        
        const card = document.createElement('div');
        card.className = 'muscle-group-card';
        card.onclick = () => {
            currentWorkoutId = workout.id;
            navigate('detail');
        };
        card.innerHTML = `
            <h2>${workout.name}</h2>
            <p>${lastWorkoutText}</p>
        `;
        grid.appendChild(card);
    }
    
    checkSyncNeeded();
}

// Workout Management
function showAddWorkoutDialog() {
    document.getElementById('add-muscle-group-dialog').style.display = 'flex';
    document.getElementById('new-muscle-group-name').value = '';
    document.getElementById('new-muscle-group-name').focus();
}

function closeAddWorkoutDialog() {
    document.getElementById('add-muscle-group-dialog').style.display = 'none';
}

async function saveNewWorkout() {
    const nameInput = document.getElementById('new-muscle-group-name');
    if (!nameInput) {
        alert('Error: Input field not found');
        return;
    }
    
    const name = nameInput.value.trim();
    if (!name) {
        alert('Please enter a workout name');
        nameInput.focus();
        return;
    }
    
    // Disable button to prevent double-clicks
    const addButton = document.getElementById('add-workout-button');
    if (addButton) {
        addButton.disabled = true;
        addButton.textContent = 'Adding...';
    }
    
    console.log('Attempting to save workout:', name);
    
    try {
        // Check if database is initialized
        if (!db || !db.db) {
            throw new Error('Database not initialized. Please refresh the page.');
        }
        
        // Insert the workout
        console.log('Calling insertWorkout...');
        const newId = await db.insertWorkout({ name, taskIds: [] });
        console.log('Workout inserted with ID:', newId);
        
        if (!newId) {
            throw new Error('Failed to get ID from insert operation');
        }
        
        // Get the inserted workout to add to sync queue
        const insertedWorkout = await db.getWorkoutById(newId);
        console.log('Retrieved inserted workout:', insertedWorkout);
        
        if (insertedWorkout) {
            try {
                await db.addToSyncQueue('create', 'workout', insertedWorkout);
            } catch (queueError) {
                console.warn('Failed to add to sync queue:', queueError);
            }
        }
        
        // Try to sync (don't fail if sync fails)
        try {
            await autoSync();
        } catch (syncError) {
            console.log('Auto-sync failed (non-critical):', syncError);
        }
        
        // Close dialog
        closeAddWorkoutDialog();
        
        // Refresh list
        console.log('Refreshing workouts list...');
        await loadWorkoutsList();
        
        // Show success feedback
        console.log('Workout added successfully!');
        
    } catch (error) {
        console.error('Error saving workout:', error);
        console.error('Error stack:', error.stack);
        alert('Failed to save workout: ' + (error.message || 'Unknown error') + '\n\nCheck browser console (F12) for details.');
    } finally {
        // Re-enable button
        if (addButton) {
            addButton.disabled = false;
            addButton.textContent = 'Add';
        }
    }
}

let isWorkoutOrderMode = false;
let workoutToEdit = null;
let workoutToDelete = null;

async function showManageWorkouts() {
    navigate('manage-muscle-groups');
}

async function showManageWorkoutsScreen() {
    const screen = document.getElementById('manage-muscle-groups-screen');
    screen.classList.add('active');
    
    isWorkoutOrderMode = false;
    const orderToggle = document.getElementById('muscle-group-order-toggle');
    if (orderToggle) {
        orderToggle.textContent = 'ORDER';
    }
    await loadWorkoutsList();
}

function toggleWorkoutOrderMode() {
    isWorkoutOrderMode = !isWorkoutOrderMode;
    const orderToggle = document.getElementById('muscle-group-order-toggle');
    if (orderToggle) {
        orderToggle.textContent = isWorkoutOrderMode ? 'DONE' : 'ORDER';
    }
    loadWorkoutsList();
}

async function loadWorkoutsList() {
    const workouts = await db.getAllWorkouts();
    const list = document.getElementById('muscle-groups-list');
    list.innerHTML = '';
    
    workouts.forEach((workout, index) => {
        const item = document.createElement('div');
        item.className = `task-item ${isWorkoutOrderMode ? 'order-mode' : ''}`;
        item.innerHTML = `
            ${isWorkoutOrderMode ? `
                <div class="task-order-controls">
                    <button onclick="moveWorkoutUp(${index})" ${index === 0 ? 'disabled' : ''}>↑</button>
                    <button onclick="moveWorkoutDown(${index})" ${index === workouts.length - 1 ? 'disabled' : ''}>↓</button>
                </div>
            ` : ''}
            <div class="task-name" onclick="editWorkout(${workout.id})" style="cursor: pointer; flex: 1;">${workout.name}</div>
            <button class="delete-button-icon" onclick="showDeleteWorkoutDialog(${workout.id})">🗑️</button>
        `;
        list.appendChild(item);
    });
}

async function editWorkout(id) {
    if (isWorkoutOrderMode) return;
    
    workoutToEdit = id;
    const workout = await db.getWorkoutById(id);
    const newName = prompt('Enter new name:', workout.name);
    if (newName && newName.trim() && newName.trim() !== workout.name) {
        workout.name = newName.trim();
        await db.updateWorkout(workout);
        await db.addToSyncQueue('update', 'workout', workout);
        await autoSync();
        await loadWorkoutsList();
    }
}

function showDeleteWorkoutDialog(id) {
    workoutToDelete = id;
    if (confirm('Are you sure you want to delete this workout? The tasks in this workout will not be deleted, only the workout grouping will be removed.')) {
        confirmDeleteWorkout();
    }
}

async function confirmDeleteWorkout() {
    if (workoutToDelete) {
        const workout = await db.getWorkoutById(workoutToDelete);
        await db.deleteWorkout(workoutToDelete);
        await db.addToSyncQueue('delete', 'workout', workout);
        await autoSync();
        workoutToDelete = null;
        await loadWorkoutsList();
    }
}

async function moveWorkoutUp(index) {
    const workouts = await db.getAllWorkouts();
    if (index > 0) {
        const temp = workouts[index].orderIndex;
        workouts[index].orderIndex = workouts[index - 1].orderIndex;
        workouts[index - 1].orderIndex = temp;
        
        await db.updateWorkout(workouts[index]);
        await db.updateWorkout(workouts[index - 1]);
        await db.addToSyncQueue('update', 'workout', workouts[index]);
        await db.addToSyncQueue('update', 'workout', workouts[index - 1]);
        await autoSync();
        await loadWorkoutsList();
    }
}

async function moveWorkoutDown(index) {
    const workouts = await db.getAllWorkouts();
    if (index < workouts.length - 1) {
        const temp = workouts[index].orderIndex;
        workouts[index].orderIndex = workouts[index + 1].orderIndex;
        workouts[index + 1].orderIndex = temp;
        
        await db.updateWorkout(workouts[index]);
        await db.updateWorkout(workouts[index + 1]);
        await db.addToSyncQueue('update', 'workout', workouts[index]);
        await db.addToSyncQueue('update', 'workout', workouts[index + 1]);
        await autoSync();
        await loadWorkoutsList();
    }
}

// Detail Screen
async function showDetailScreen() {
    const screen = document.getElementById('detail-screen');
    screen.classList.add('active');
    
    const workout = await db.getWorkoutById(currentWorkoutId);
    document.getElementById('detail-title').textContent = workout.name;
    
    const tasks = await db.getTasksByWorkout(currentWorkoutId);
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
    const isCompleted = await db.isWorkoutCompletedToday(currentWorkoutId);
    if (isCompleted) {
        if (confirm('You have already completed this workout today. Do you want to start it again anyway?')) {
            navigate('workout');
        }
    } else {
        navigate('workout');
    }
}

// Edit Screen - Now manages workout's task selection
async function showEditScreen() {
    const screen = document.getElementById('edit-screen');
    screen.classList.add('active');
    
    isOrderMode = false;
    document.getElementById('order-toggle').textContent = 'ORDER';
    
    await loadWorkoutTasksList();
}

async function loadWorkoutTasksList() {
    const workout = await db.getWorkoutById(currentWorkoutId);
    const tasks = await db.getTasksByWorkout(currentWorkoutId);
    const list = document.getElementById('tasks-list');
    list.innerHTML = '';
    
    tasks.forEach((task, index) => {
        const item = document.createElement('div');
        item.className = `task-item ${isOrderMode ? 'order-mode' : ''}`;
        item.innerHTML = `
            ${isOrderMode ? `
                <div class="task-order-controls">
                    <button onclick="moveWorkoutTaskUp(${index})" ${index === 0 ? 'disabled' : ''}>↑</button>
                    <button onclick="moveWorkoutTaskDown(${index})" ${index === tasks.length - 1 ? 'disabled' : ''}>↓</button>
                </div>
            ` : ''}
            <div class="task-name" onclick="editTask(${task.id})" style="cursor: pointer; flex: 1;">${task.name}</div>
            <button class="delete-button-icon" onclick="removeTaskFromWorkout(${task.id})">🗑️</button>
        `;
        list.appendChild(item);
    });
}

function toggleOrderMode() {
    isOrderMode = !isOrderMode;
    document.getElementById('order-toggle').textContent = isOrderMode ? 'DONE' : 'ORDER';
    loadWorkoutTasksList();
}

async function moveWorkoutTaskUp(index) {
    const workout = await db.getWorkoutById(currentWorkoutId);
    if (!workout || !workout.taskIds || index === 0) return;
    
    const taskIds = [...workout.taskIds];
    [taskIds[index], taskIds[index - 1]] = [taskIds[index - 1], taskIds[index]];
    workout.taskIds = taskIds;
    
    await db.updateWorkout(workout);
    await db.addToSyncQueue('update', 'workout', workout);
    await loadWorkoutTasksList();
    await autoSync();
}

async function moveWorkoutTaskDown(index) {
    const workout = await db.getWorkoutById(currentWorkoutId);
    if (!workout || !workout.taskIds || index >= workout.taskIds.length - 1) return;
    
    const taskIds = [...workout.taskIds];
    [taskIds[index], taskIds[index + 1]] = [taskIds[index + 1], taskIds[index]];
    workout.taskIds = taskIds;
    
    await db.updateWorkout(workout);
    await db.addToSyncQueue('update', 'workout', workout);
    await loadWorkoutTasksList();
    await autoSync();
}

async function removeTaskFromWorkout(taskId) {
    if (!confirm('Remove this task from this workout? The task itself will not be deleted.')) {
        return;
    }
    
    const workout = await db.getWorkoutById(currentWorkoutId);
    if (workout && workout.taskIds) {
        workout.taskIds = workout.taskIds.filter(id => id !== taskId);
        await db.updateWorkout(workout);
        await db.addToSyncQueue('update', 'workout', workout);
        await loadWorkoutTasksList();
        await autoSync();
    }
}

// Add Task to Workout Dialog
let selectedTaskIds = [];

async function showAddTaskToWorkoutDialog() {
    console.log('showAddTaskToWorkoutDialog called, currentWorkoutId:', currentWorkoutId);
    
    if (!currentWorkoutId) {
        alert('No workout selected. Please go back and select a workout first.');
        return;
    }
    
    // Wait a moment to ensure DOM is ready
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Hide all screens first
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    
    const screen = document.getElementById('add-task-to-workout-screen');
    const list = document.getElementById('available-tasks-list');
    
    if (!screen) {
        console.error('add-task-to-workout-screen element not found in DOM');
        console.error('Available screen elements:', Array.from(document.querySelectorAll('.screen')).map(s => s.id));
        alert('Screen not found. Please refresh the page (Ctrl+F5 or Cmd+Shift+R to clear cache).');
        // Try to navigate back
        if (currentWorkoutId) {
            navigate('edit');
        }
        return;
    }
    
    if (!list) {
        console.error('available-tasks-list element not found in screen');
        alert('Tasks list not found. Please refresh the page.');
        // Try to navigate back
        if (currentWorkoutId) {
            navigate('edit');
        }
        return;
    }
    
    try {
        const workout = await db.getWorkoutById(currentWorkoutId);
        if (!workout) {
            alert('Workout not found. Please refresh the page.');
            console.error('Workout not found for ID:', currentWorkoutId);
            return;
        }
        
        console.log('Workout found:', workout);
        
        const currentTaskIds = workout.taskIds || [];
        const allTasks = await db.getAllTasks();
        const availableTasks = allTasks.filter(task => !currentTaskIds.includes(task.id));
        
        selectedTaskIds = []; // Reset selection
        
        list.innerHTML = '';
        
        if (availableTasks.length === 0) {
            list.innerHTML = '<p style="padding: 16px; text-align: center; color: var(--text-secondary);">All tasks are already in this workout. Create new tasks in the "Manage Tasks" screen first.</p>';
        } else {
            availableTasks.forEach(task => {
                const item = document.createElement('div');
                item.className = 'task-item';
                item.style.padding = '16px';
                item.style.cursor = 'pointer';
                item.style.borderBottom = '1px solid var(--border-color)';
                item.style.minHeight = '60px';
                item.style.display = 'flex';
                item.style.alignItems = 'center';
                item.onclick = () => toggleTaskSelection(task.id, item);
                item.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 16px; width: 100%;">
                        <input type="checkbox" id="task-checkbox-${task.id}" 
                               onclick="event.stopPropagation(); toggleTaskSelection(${task.id}, this.parentElement.parentElement)"
                               style="width: 24px; height: 24px; cursor: pointer; flex-shrink: 0;" />
                        <div class="task-name" style="flex: 1; font-size: 16px;">${task.name}</div>
                    </div>
                `;
                list.appendChild(item);
            });
        }
        
        // Reset button state
        const addButton = document.getElementById('add-selected-tasks-button');
        if (addButton) {
            addButton.disabled = true;
            addButton.textContent = 'Add Tasks';
        }
        
        // Show the screen (hide all others first)
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        screen.classList.add('active');
        console.log('Screen displayed successfully');
    } catch (error) {
        console.error('Error showing add task screen:', error);
        console.error('Error stack:', error.stack);
        alert('Error loading tasks: ' + error.message + '\n\nCheck browser console (F12) for details.');
    }
}

function toggleTaskSelection(taskId, element) {
    const checkbox = document.getElementById(`task-checkbox-${taskId}`);
    if (!checkbox) return;
    
    if (selectedTaskIds.includes(taskId)) {
        selectedTaskIds = selectedTaskIds.filter(id => id !== taskId);
        checkbox.checked = false;
        element.style.backgroundColor = '';
    } else {
        selectedTaskIds.push(taskId);
        checkbox.checked = true;
        element.style.backgroundColor = 'var(--primary-color-light)';
    }
    
    // Update add button state
    const addButton = document.getElementById('add-selected-tasks-button');
    if (addButton) {
        addButton.disabled = selectedTaskIds.length === 0;
        addButton.textContent = selectedTaskIds.length > 0 
            ? `Add ${selectedTaskIds.length} Task${selectedTaskIds.length > 1 ? 's' : ''}`
            : 'Add Tasks';
    }
}

function closeAddTaskToWorkoutDialog() {
    const screen = document.getElementById('add-task-to-workout-screen');
    if (screen) {
        screen.classList.remove('active');
    }
    selectedTaskIds = [];
    // Navigate back to edit screen
    if (currentWorkoutId) {
        navigate('edit');
    } else {
        navigate('home');
    }
}

async function addSelectedTasksToWorkout() {
    console.log('addSelectedTasksToWorkout called, selectedTaskIds:', selectedTaskIds);
    
    if (selectedTaskIds.length === 0) {
        alert('Please select at least one task to add');
        return;
    }
    
    if (!currentWorkoutId) {
        alert('No workout selected. Please go back and select a workout first.');
        return;
    }
    
    try {
        const workout = await db.getWorkoutById(currentWorkoutId);
        if (!workout) {
            alert('Workout not found. Please refresh the page.');
            console.error('Workout not found for ID:', currentWorkoutId);
            return;
        }
        
        console.log('Adding tasks to workout:', workout.name);
        
        if (!workout.taskIds) {
            workout.taskIds = [];
        }
        
        // Add selected tasks (avoid duplicates)
        let addedCount = 0;
        selectedTaskIds.forEach(taskId => {
            if (!workout.taskIds.includes(taskId)) {
                workout.taskIds.push(taskId);
                addedCount++;
            }
        });
        
        if (addedCount === 0) {
            alert('Selected tasks are already in this workout');
            return;
        }
        
        await db.updateWorkout(workout);
        await db.addToSyncQueue('update', 'workout', workout);
        await loadWorkoutTasksList();
        await autoSync();
        
        console.log('Tasks added successfully:', addedCount, 'tasks');
        closeAddTaskToWorkoutDialog();
        // Show success message
        if (addedCount > 0) {
            // Brief visual feedback - the list will refresh automatically
        }
    } catch (error) {
        console.error('Error adding tasks to workout:', error);
        console.error('Error stack:', error.stack);
        alert('Error adding tasks: ' + error.message + '\n\nCheck browser console (F12) for details.');
    }
}

// Tasks Management Screen
let isTaskOrderMode = false;

async function showManageTasksScreen() {
    navigate('manage-tasks');
}

async function showManageTasksScreenContent() {
    try {
        const screen = document.getElementById('manage-tasks-screen');
        if (!screen) {
            console.error('manage-tasks-screen element not found');
            return;
        }
        screen.classList.add('active');
        
        isTaskOrderMode = false;
        const orderToggle = document.getElementById('task-order-toggle');
        if (orderToggle) {
            orderToggle.textContent = 'ORDER';
        }
        await loadAllTasksList();
    } catch (error) {
        console.error('Error showing manage tasks screen:', error);
        alert('Error loading Manage Tasks screen: ' + error.message);
    }
}

function toggleTaskOrderMode() {
    isTaskOrderMode = !isTaskOrderMode;
    const orderToggle = document.getElementById('task-order-toggle');
    if (orderToggle) {
        orderToggle.textContent = isTaskOrderMode ? 'DONE' : 'ORDER';
    }
    loadAllTasksList();
}

async function loadAllTasksList() {
    try {
        const list = document.getElementById('all-tasks-list');
        if (!list) {
            console.error('all-tasks-list element not found');
            return;
        }
        
        const allTasks = await db.getAllTasks();
        list.innerHTML = '';
        
        if (allTasks.length === 0) {
            list.innerHTML = '<p style="padding: 16px; text-align: center; color: var(--text-secondary);">No tasks yet. Click "+ Add Task" to create your first task.</p>';
            return;
        }
        
        allTasks.forEach((task, index) => {
            const item = document.createElement('div');
            item.className = `task-item ${isTaskOrderMode ? 'order-mode' : ''}`;
            item.innerHTML = `
                ${isTaskOrderMode ? `
                    <div class="task-order-controls">
                        <button onclick="moveTaskUp(${index})" ${index === 0 ? 'disabled' : ''}>↑</button>
                        <button onclick="moveTaskDown(${index})" ${index === allTasks.length - 1 ? 'disabled' : ''}>↓</button>
                    </div>
                ` : ''}
                <div class="task-name" onclick="editTask(${task.id})" style="cursor: pointer; flex: 1;">${task.name}</div>
                <button class="text-button" onclick="showTaskHistory(${task.id})" style="margin-right: 8px;" title="View History">📊</button>
                <button class="delete-button-icon" onclick="showDeleteTaskDialog(${task.id})">🗑️</button>
            `;
            list.appendChild(item);
        });
    } catch (error) {
        console.error('Error loading tasks list:', error);
        const list = document.getElementById('all-tasks-list');
        if (list) {
            list.innerHTML = '<p style="padding: 16px; text-align: center; color: var(--error-color);">Error loading tasks. Please refresh the page.</p>';
        }
    }
}

async function moveTaskUp(index) {
    try {
        const allTasks = await db.getAllTasks();
        if (index > 0 && index < allTasks.length) {
            const temp = allTasks[index].orderIndex;
            allTasks[index].orderIndex = allTasks[index - 1].orderIndex;
            allTasks[index - 1].orderIndex = temp;
            
            await db.updateTask(allTasks[index]);
            await db.updateTask(allTasks[index - 1]);
            await db.addToSyncQueue('update', 'task', allTasks[index]);
            await db.addToSyncQueue('update', 'task', allTasks[index - 1]);
            await loadAllTasksList();
            await autoSync();
        }
    } catch (error) {
        console.error('Error moving task up:', error);
        alert('Error moving task: ' + error.message);
    }
}

async function moveTaskDown(index) {
    try {
        const allTasks = await db.getAllTasks();
        if (index < allTasks.length - 1 && index >= 0) {
            const temp = allTasks[index].orderIndex;
            allTasks[index].orderIndex = allTasks[index + 1].orderIndex;
            allTasks[index + 1].orderIndex = temp;
            
            await db.updateTask(allTasks[index]);
            await db.updateTask(allTasks[index + 1]);
            await db.addToSyncQueue('update', 'task', allTasks[index]);
            await db.addToSyncQueue('update', 'task', allTasks[index + 1]);
            await loadAllTasksList();
            await autoSync();
        }
    } catch (error) {
        console.error('Error moving task down:', error);
        alert('Error moving task: ' + error.message);
    }
}

function showDeleteTaskDialog(taskId) {
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
        
        // Refresh the appropriate list based on current screen
        const currentScreen = document.querySelector('.screen.active');
        if (currentScreen && currentScreen.id === 'manage-tasks-screen') {
            await loadAllTasksList();
        } else if (currentScreen && currentScreen.id === 'edit-screen') {
            await loadWorkoutTasksList();
        }
        await autoSync();
    }
}

// Show history for a specific task
async function showTaskHistory(taskId) {
    navigate('history');
    await showHistoryScreen(taskId);
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

// Update back button navigation for add task screen
function getAddTaskBackScreen() {
    const currentScreen = document.querySelector('.screen.active');
    if (currentScreen && currentScreen.id === 'manage-tasks-screen') {
        return 'manage-tasks';
    }
    return 'edit';
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
        const allTasks = await db.getAllTasks();
        const orderIndex = allTasks.length;
        
        let videoFileName = null;
        
        if (videoFile) {
            videoFileName = `video_${Date.now()}_${videoFile.name}`;
            
            // Save video locally
            const videoData = await fileToBase64(videoFile);
            await db.saveVideo(videoFileName, videoData);
        }
        
        const task = {
            name: taskName,
            instructions: instructions,
            tips: tips,
            videoFileName: videoFileName,
            defaultSets: defaultSets,
            defaultReps: defaultReps,
            orderIndex: orderIndex
        };
        
        await db.insertTask(task);
        await db.addToSyncQueue('create', 'task', task);
        
        // Try to sync, but don't let sync errors prevent navigation
        try {
            await autoSync();
        } catch (syncError) {
            console.log('Auto-sync failed (non-critical):', syncError);
        }
        
        // Close add task screen and navigate to manage tasks
        const addTaskScreen = document.getElementById('add-task-screen');
        if (addTaskScreen) {
            addTaskScreen.classList.remove('active');
        }
        
        // Always navigate to manage tasks after saving
        navigate('manage-tasks');
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
    
    const tasks = await db.getTasksByWorkout(currentWorkoutId);
    if (tasks.length === 0) {
        alert('No tasks available. Please add tasks to this workout first.');
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
            completedAt: null,
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
                <button class="video-button" onclick="playVideo('${state.task.videoFileName || ''}')">
                    ▶ Play Video
                </button>
            ` : ''}
            
            ${state.task.tips ? `
                <div class="collapsible-section" onclick="toggleCollapsible(this)">
                    <div class="collapsible-header">
                        <span>Target Muscle</span>
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

function completeTask(taskId) {
    const state = taskStates[taskId];
    state.isDone = true;
    state.isSkipped = false;
    state.completedAt = Date.now(); // Store completion timestamp
    
    const tasks = Object.values(taskStates).map(s => s.task);
    const currentIndex = tasks.findIndex(t => t.id === taskId);
    
    updateWorkoutProgress();
    updateWorkoutActions();
    
    // Move to next task
    if (currentIndex < tasks.length - 1) {
        showWorkoutPage(currentIndex + 1);
    }
}

function skipTask(taskId) {
    const state = taskStates[taskId];
    state.isSkipped = true;
    state.isDone = false;
    state.completedAt = Date.now(); // Store skip timestamp
    
    const tasks = Object.values(taskStates).map(s => s.task);
    const currentIndex = tasks.findIndex(t => t.id === taskId);
    
    updateWorkoutProgress();
    updateWorkoutActions();
    
    // Move to next task
    if (currentIndex < tasks.length - 1) {
        showWorkoutPage(currentIndex + 1);
    }
}

// Finish workout - save all entries at once
async function finishWorkout() {
    const tasks = Object.values(taskStates).map(s => s.task);
    const skippedTasks = tasks.filter(t => taskStates[t.id].isSkipped && !taskStates[t.id].isDone);
    
    if (skippedTasks.length > 0) {
        if (!confirm(`You have ${skippedTasks.length} skipped exercise${skippedTasks.length > 1 ? 's' : ''}. Do you want to finish anyway?`)) {
            return;
        }
    }
    
    const workoutDate = Date.now();
    
    // Save all completed tasks
    for (const task of tasks) {
        const state = taskStates[task.id];
        
        if (state.isDone && state.completedAt) {
            // Calculate totals for backward compatibility
            const totalReps = state.sets.reduce((sum, set) => sum + set.reps, 0);
            const avgWeight = state.sets.length > 0 
                ? state.sets.reduce((sum, set) => sum + set.weightKg, 0) / state.sets.length 
                : 0;
            
            const logEntry = {
                taskId: task.id,
                date: state.completedAt, // Use the timestamp when DONE was clicked
                sets: state.sets, // Store as array
                reps: totalReps, // Keep for backward compatibility
                weightKg: avgWeight, // Keep for backward compatibility
                setCount: state.sets.length
            };
            
            await db.insertLogEntry(logEntry);
            await db.addToSyncQueue('create', 'logEntry', logEntry);
        }
    }
    
    await autoSync();
    
    // Show completion dialog
    const allDone = tasks.every(t => taskStates[t.id].isDone);
    if (allDone) {
        showWorkoutCompleteDialog(true, []);
    } else {
        showWorkoutCompleteDialog(false, skippedTasks);
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
        task.defaultSets = parseInt(document.getElementById('edit-task-default-sets').value) || 3;
        task.defaultReps = parseInt(document.getElementById('edit-task-default-reps').value) || 10;
        
        // Handle video
        if (videoFile) {
            const videoFileName = `video_${Date.now()}_${videoFile.name}`;
            
            // Save video locally
            const videoData = await fileToBase64(videoFile);
            await db.saveVideo(videoFileName, videoData);
            
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
                // Video is stored locally, deletion from database is handled by updateTask
                
                task.videoFileName = null;
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

async function playVideo(videoFileName) {
    try {
        let videoSrc = null;
        
        // Get video from local storage
        if (videoFileName) {
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

// History Screen - Shows history for a specific task
let entryToEdit = null;
let currentTaskForHistory = null;

async function showHistoryScreen(taskId) {
    const screen = document.getElementById('history-screen');
    screen.classList.add('active');
    
    currentTaskForHistory = taskId;
    const task = await db.getTaskById(taskId);
    if (!task) {
        alert('Task not found');
        navigate('home');
        return;
    }
    
    document.getElementById('history-title').textContent = `${task.name} - History`;
    
    const entries = await db.getLogEntriesByTask(taskId);
    const list = document.getElementById('history-list');
    list.innerHTML = '';
    
    if (entries.length === 0) {
        list.innerHTML = '<p style="padding: 16px; text-align: center; color: var(--text-secondary);">No workout history for this task yet.</p>';
        return;
    }
    
    // Sort entries by date (newest first)
    entries.sort((a, b) => b.date - a.date);
    
    entries.forEach(entry => {
        const setsDisplay = Array.isArray(entry.sets) 
            ? entry.sets.map(s => `${s.reps}×${s.weightKg}kg`).join(', ')
            : `${entry.sets} sets × ${entry.reps} reps`;
        
        const item = document.createElement('div');
        item.className = 'history-entry';
        item.onclick = () => editHistoryEntry(entry.id);
        item.innerHTML = `
            <div>${setsDisplay}</div>
            <div>${Array.isArray(entry.sets) ? entry.sets.reduce((sum, s) => sum + s.reps, 0) : entry.reps} reps</div>
            <div>${Array.isArray(entry.sets) ? entry.sets.map(s => s.weightKg).join('/') : entry.weightKg} kg</div>
            <div>${formatDate(entry.date)}</div>
        `;
        list.appendChild(item);
    });
}

let historyEntrySets = [];

async function editHistoryEntry(entryId) {
    entryToEdit = entryId;
    const entry = await db.getLogEntryById(entryId);
    if (!entry) {
        alert('Entry not found');
        return;
    }
    
    // Initialize sets array
    if (Array.isArray(entry.sets)) {
        historyEntrySets = entry.sets.map(s => ({ ...s })); // Deep copy
    } else {
        // Convert old format to new format
        const setCount = entry.sets || 1;
        historyEntrySets = [];
        for (let i = 0; i < setCount; i++) {
            historyEntrySets.push({
                reps: entry.reps || 0,
                weightKg: entry.weightKg || 0
            });
        }
    }
    
    const date = new Date(entry.date);
    const dateStr = date.toISOString().slice(0, 16);
    document.getElementById('edit-entry-date').value = dateStr;
    
    renderHistoryEntrySets();
    document.getElementById('edit-history-entry-dialog').style.display = 'flex';
}

function renderHistoryEntrySets() {
    const container = document.getElementById('edit-entry-sets-container');
    container.innerHTML = '';
    
    historyEntrySets.forEach((set, index) => {
        const setDiv = document.createElement('div');
        setDiv.className = 'set-row';
        setDiv.style.marginBottom = '12px';
        setDiv.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                <div class="set-label" style="min-width: 60px;">Set ${index + 1}</div>
                <button class="outlined-button" onclick="removeSetFromHistoryEntry(${index})" style="padding: 4px 8px; font-size: 12px;">Remove</button>
            </div>
            <div class="set-controls">
                <div class="set-reps">
                    <label>Reps</label>
                    <input type="number" id="edit-set-reps-${index}" value="${set.reps}" min="0" 
                           onchange="updateHistoryEntrySet(${index}, 'reps', this.value)" />
                </div>
                <div class="set-weight">
                    <label>Weight (kg)</label>
                    <input type="number" id="edit-set-weight-${index}" value="${set.weightKg}" step="0.1" min="0"
                           onchange="updateHistoryEntrySet(${index}, 'weight', this.value)" />
                </div>
            </div>
        `;
        container.appendChild(setDiv);
    });
}

function updateHistoryEntrySet(index, field, value) {
    if (historyEntrySets[index]) {
        if (field === 'reps') {
            historyEntrySets[index].reps = parseInt(value) || 0;
        } else if (field === 'weight') {
            historyEntrySets[index].weightKg = parseFloat(value) || 0;
        }
    }
}

function addSetToHistoryEntry() {
    historyEntrySets.push({
        reps: 10,
        weightKg: 0
    });
    renderHistoryEntrySets();
}

function removeSetFromHistoryEntry(index) {
    if (historyEntrySets.length > 1) {
        historyEntrySets.splice(index, 1);
        renderHistoryEntrySets();
    } else {
        alert('You must have at least one set');
    }
}

function closeEditHistoryEntryDialog() {
    document.getElementById('edit-history-entry-dialog').style.display = 'none';
    entryToEdit = null;
    historyEntrySets = [];
}

async function saveEditedHistoryEntry() {
    if (!entryToEdit) return;
    
    const entry = await db.getLogEntryById(entryToEdit);
    if (!entry) {
        alert('Entry not found');
        return;
    }
    
    if (historyEntrySets.length === 0) {
        alert('You must have at least one set');
        return;
    }
    
    const dateStr = document.getElementById('edit-entry-date').value;
    const date = new Date(dateStr).getTime();
    
    // Calculate totals for backward compatibility
    const totalReps = historyEntrySets.reduce((sum, set) => sum + set.reps, 0);
    const avgWeight = historyEntrySets.length > 0 
        ? historyEntrySets.reduce((sum, set) => sum + set.weightKg, 0) / historyEntrySets.length 
        : 0;
    
    entry.sets = historyEntrySets;
    entry.reps = totalReps; // Total reps
    entry.weightKg = avgWeight;
    entry.date = date;
    entry.setCount = historyEntrySets.length;
    
    await db.updateLogEntry(entry);
    await db.addToSyncQueue('update', 'logEntry', entry);
    await autoSync();
    
    closeEditHistoryEntryDialog();
    if (currentTaskForHistory) {
        await showHistoryScreen(currentTaskForHistory);
    }
}

async function deleteHistoryEntry() {
    if (!entryToEdit) return;
    
    if (confirm('Are you sure you want to delete this workout entry?')) {
        const entry = await db.getLogEntryById(entryToEdit);
        await db.deleteLogEntry(entryToEdit);
        await db.addToSyncQueue('delete', 'logEntry', entry);
        await autoSync();
        closeEditHistoryEntryDialog();
        if (currentTaskForHistory) {
        await showHistoryScreen(currentTaskForHistory);
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
            const workouts = await db.getAllWorkouts();
            const allTasks = await db.getAllTasks();
            let logCount = 0;
            for (const task of allTasks) {
                const entries = await db.getLogEntriesByTask(task.id);
                logCount += entries.length;
            }
            const dataInfo = `Local data: ${workouts.length} workouts, ${allTasks.length} exercises, ${logCount} workout logs`;
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
            await initializeDefaultWorkouts();
            const currentScreen = document.querySelector('.screen.active');
            if (currentScreen && currentScreen.id === 'home-screen') {
                await showHomeScreen();
            } else if (currentWorkoutId) {
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


// Database Wipe Functions
function showDatabaseWipeDialog() {
    document.getElementById('database-wipe-dialog').style.display = 'flex';
    document.getElementById('wipe-confirm-input').value = '';
    document.getElementById('confirm-wipe-button').disabled = true;
    
    // Enable button when user types "DELETE"
    const confirmInput = document.getElementById('wipe-confirm-input');
    const confirmButton = document.getElementById('confirm-wipe-button');
    
    confirmInput.oninput = () => {
        confirmButton.disabled = confirmInput.value.trim().toUpperCase() !== 'DELETE';
    };
    
    confirmInput.focus();
}

function closeDatabaseWipeDialog() {
    document.getElementById('database-wipe-dialog').style.display = 'none';
    document.getElementById('wipe-confirm-input').value = '';
}

async function confirmDatabaseWipe() {
    const confirmText = document.getElementById('wipe-confirm-input').value.trim().toUpperCase();
    if (confirmText !== 'DELETE') {
        alert('Please type "DELETE" to confirm');
        return;
    }
    
    try {
        // Only clear workout history (log entries), keep workouts and exercises
        await db.clearAllLogEntries();
        
        closeDatabaseWipeDialog();
        
        // Reset app state
        currentWorkoutId = null;
        currentTaskIndex = 0;
        taskStates = {};
        
        alert('Workout history cleared successfully! Your workouts and exercises have been preserved.');
        
        // Refresh the UI to show updated history
        if (currentWorkoutId) {
            await showDetailScreen();
        } else {
            navigate('home');
            await showHomeScreen();
        }
    } catch (error) {
        console.error('Error clearing workout history:', error);
        alert('Failed to clear workout history: ' + error.message);
    }
}

// Export and download database
async function exportDatabase(event) {
    const button = event ? event.target : null;
    const originalText = button ? button.textContent : '';
    
    try {
        if (button) {
            button.disabled = true;
            button.textContent = 'Exporting...';
        }
        
        console.log('Starting database export...');
        
        // Get all data from database
        const workouts = await db.getAllWorkouts();
        const allTasks = await db.getAllTasks();
        const allLogEntries = [];
        const allVideos = [];
        
        // Get all log entries
        for (const task of allTasks) {
            const entries = await db.getLogEntriesByTask(task.id);
            allLogEntries.push(...entries);
        }
        
        // Get all videos
        const videos = await db.getAllVideos();
        allVideos.push(...videos);
        
        // Get sync queue (optional, for reference)
        const syncQueue = await db.getSyncQueue();
        
        // Create export object
        const exportData = {
            version: 3,
            exportDate: new Date().toISOString(),
            exportTimestamp: Date.now(),
            workouts,
            tasks: allTasks,
            logEntries: allLogEntries,
            videos: allVideos,
            syncQueue: syncQueue,
            metadata: {
                deviceId: db.getDeviceId(),
                lastSyncTime: localStorage.getItem('last_sync_time'),
                lastLocalChangeTime: localStorage.getItem('last_local_change_time')
            }
        };
        
        // Convert to JSON string
        const jsonString = JSON.stringify(exportData, null, 2);
        
        // Create blob and download
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `gym-tracker-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        console.log('Database exported successfully');
        alert('Database exported successfully! Your backup file has been downloaded.');
        
    } catch (error) {
        console.error('Error exporting database:', error);
        alert('Failed to export database: ' + error.message);
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = originalText || 'Download Database';
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

