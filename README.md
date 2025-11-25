# Gym Tracker - Complete Documentation

A modern, progressive web application for tracking gym workouts. Built with vanilla JavaScript, IndexedDB, and GitHub Gists for cloud sync. No build process or server required - works entirely in the browser.

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Installation & Setup](#installation--setup)
- [Architecture](#architecture)
- [Database Schema](#database-schema)
- [Key Components](#key-components)
- [GitHub Sync System](#github-sync-system)
- [Usage Guide](#usage-guide)
- [Development](#development)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)

---

## 🎯 Overview

Gym Tracker is a Progressive Web App (PWA) that allows users to:
- Create and manage workout routines organized by muscle groups
- Track exercises with detailed information (instructions, tips, videos)
- Log workout sessions with per-set tracking (reps and weight)
- View and edit workout history
- Sync data across devices using GitHub Gists
- Store all data locally with optional cloud backup

**Key Design Principles:**
- **Offline-first**: Works completely offline, syncs when online
- **No backend required**: All data stored in browser IndexedDB
- **Cross-device sync**: Optional GitHub Gists integration
- **Progressive enhancement**: Works in any modern browser

---

## ✨ Features

### Core Features

1. **Workout Management**
   - 8 default muscle groups: Chest, Back, Shoulders, Arms, Legs, Core, Cardio, Full Body
   - Create custom workouts
   - Reorder workouts and exercises
   - Edit workout names

2. **Exercise Management**
   - Create exercises with:
     - Name
     - Target muscle tips
     - Instructions
     - Default sets and reps
     - Optional video attachments
   - Edit existing exercises
   - Delete exercises
   - View exercise history

3. **Workout Logging**
   - Per-set tracking (reps and weight per set)
   - Pre-filled values from last workout
   - Add/remove sets dynamically
   - Skip exercises
   - Progress indicators
   - Last 3 workout history display

4. **History & Analytics**
   - View workout history by exercise
   - Edit past workout entries
   - Delete workout entries
   - Date-based filtering
   - Set-by-set history display

5. **Data Management**
   - Local storage via IndexedDB
   - GitHub Gists cloud sync (optional)
   - Database export/backup (JSON)
   - Clear workout history (preserves exercises)

6. **User Interface**
   - Modern, responsive design
   - Mobile-friendly
   - Smooth animations
   - Intuitive navigation
   - Visual progress indicators

---

## 🛠 Technology Stack

### Core Technologies

- **HTML5**: Semantic markup, no frameworks
- **CSS3**: Modern CSS with CSS variables, flexbox, grid
- **JavaScript (ES6+)**: Vanilla JavaScript, no frameworks
- **IndexedDB**: Client-side database for local storage
- **GitHub Gists API**: Cloud sync functionality
- **LocalStorage**: Settings and sync metadata

### Browser APIs Used

- `IndexedDB`: Database storage
- `localStorage`: Settings storage
- `fetch`: GitHub API calls
- `FileReader`: Video file reading
- `Blob`: File downloads
- `URL.createObjectURL`: Video playback

### Browser Requirements

- Modern browser with IndexedDB support
- JavaScript enabled
- Recommended: Chrome, Firefox, Safari, Edge (latest versions)

---

## 📁 Project Structure

```
gym/
├── index.html              # Main HTML file (all screens)
├── styles.css              # Complete stylesheet (1362 lines)
├── app.js                  # Main application logic (2223 lines)
├── database.js             # IndexedDB database manager (802 lines)
├── github-sync.js          # GitHub Gists sync manager (585 lines)
├── README.md               # This file
├── README_WEB.md           # Quick start guide for web version
├── DEPLOYMENT.md           # GitHub Pages deployment guide
└── SYNC_USER_GUIDE.md      # GitHub sync user guide
```

### File Responsibilities

**index.html**
- All UI screens and dialogs
- Screen navigation structure
- Form inputs and buttons
- Dialog overlays

**styles.css**
- Complete styling system
- CSS variables for theming
- Responsive design
- Animations and transitions

**app.js**
- Application state management
- Screen navigation
- UI event handlers
- Workout flow logic
- Sync queue processing
- Utility functions

**database.js**
- IndexedDB initialization
- Database schema and migrations
- CRUD operations for all entities
- Device ID management
- Sync queue management

**github-sync.js**
- GitHub API integration
- Gist creation/updates
- Data export/import
- Deduplication logic
- Authentication management

---

## 🚀 Installation & Setup

### Quick Start (Local Development)

1. **Clone or download the project**
   ```bash
   git clone <repository-url>
   cd gym
   ```

2. **Open in browser**
   - Simply open `index.html` in a modern web browser
   - Or use a local server (recommended):
     ```bash
     # Python 3
     python -m http.server 8000
     
     # Node.js
     npx http-server
     
     # PHP
     php -S localhost:8000
     ```

3. **Access the app**
   - Open `http://localhost:8000` in your browser
   - The app will initialize with default workouts

### No Dependencies Required

This app has **zero dependencies**. No npm, no build process, no package manager needed. Just open the HTML file in a browser.

---

## 🏗 Architecture

### Application Flow

```
User Action
    ↓
Event Handler (app.js)
    ↓
Database Operation (database.js)
    ↓
IndexedDB Storage
    ↓
Sync Queue (if GitHub sync enabled)
    ↓
GitHub Gists (optional)
```

### State Management

The app uses a simple state management pattern:

- **Global State Variables** (in `app.js`):
  - `currentWorkoutId`: Currently selected workout
  - `currentTaskIndex`: Current exercise in workout
  - `taskStates`: State of each exercise during workout
  - `isOrderMode`: Whether reordering is active
  - `syncQueueProcessor`: Background sync interval

- **Persistent State** (IndexedDB):
  - Workouts
  - Tasks (exercises)
  - Log entries (workout history)
  - Videos
  - Sync queue

- **Settings** (localStorage):
  - GitHub token
  - Gist ID
  - Last sync time
  - Device ID
  - Database version

### Screen Navigation

The app uses a simple screen-based navigation system:

```javascript
function navigate(screen) {
    // Hide all screens
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    
    // Show target screen
    switch(screen) {
        case 'home': showHomeScreen(); break;
        case 'detail': showDetailScreen(); break;
        // ... etc
    }
}
```

Screens are defined in `index.html` with the class `screen` and shown/hidden via the `active` class.

---

## 💾 Database Schema

### IndexedDB Structure

**Database Name:** `GymTrackerDB`  
**Version:** 3

### Object Stores

#### 1. `workouts` Store
Stores workout/muscle group definitions.

```javascript
{
    id: number (auto-increment),
    name: string,
    taskIds: number[],  // Array of task IDs
    orderIndex: number,
    lastModified: number (timestamp),
    deviceId: string
}
```

**Indexes:**
- `name`: Non-unique index on name

#### 2. `tasks` Store
Stores exercise/task definitions.

```javascript
{
    id: number (auto-increment),
    name: string,
    instructions: string,
    tips: string,
    videoFileName: string | null,
    defaultSets: number,
    defaultReps: number,
    orderIndex: number,
    lastModified: number (timestamp),
    deviceId: string
}
```

**Indexes:** None (tasks are independent of workouts)

#### 3. `logEntries` Store
Stores workout history entries.

```javascript
{
    id: number (auto-increment),
    taskId: number,
    date: number (timestamp),
    sets: Array<{reps: number, weightKg: number}>,
    reps: number,  // Total reps (backward compatibility)
    weightKg: number,  // Average weight (backward compatibility)
    setCount: number,
    lastModified: number (timestamp),
    deviceId: string
}
```

**Indexes:**
- `taskId`: Non-unique index on taskId
- `date`: Non-unique index on date

#### 4. `videos` Store
Stores video files as base64 data.

```javascript
{
    id: number (auto-increment),
    fileName: string,
    data: string  // Base64 encoded video data
}
```

**Indexes:** None

#### 5. `syncQueue` Store
Stores pending sync operations.

```javascript
{
    id: number (auto-increment),
    operation: 'create' | 'update' | 'delete',
    entityType: 'workout' | 'task' | 'logEntry',
    entityData: object,
    timestamp: number,
    retries: number,
    status: 'pending' | 'failed',
    lastError: string | null,
    lastRetry: number | null
}
```

**Indexes:**
- `timestamp`: Non-unique index on timestamp
- `status`: Non-unique index on status

#### 6. `muscleGroups` Store (Legacy)
Kept for backward compatibility during migration. Not used in version 3+.

### Database Migrations

**Version 1 → 2:**
- Added `syncQueue` store

**Version 2 → 3:**
- Added `workouts` store
- Migrated `muscleGroups` to `workouts`
- Removed `muscleGroupId` from tasks (tasks are now independent)
- Tasks linked to workouts via `taskIds` array in workouts

---

## 🔧 Key Components

### 1. Database Manager (`database.js`)

**Class:** `GymDatabase`

**Key Methods:**
- `init()`: Initialize IndexedDB
- `getAllWorkouts()`: Get all workouts
- `getWorkoutById(id)`: Get workout by ID
- `insertWorkout(workout)`: Create new workout
- `updateWorkout(workout)`: Update workout
- `deleteWorkout(id)`: Delete workout
- `getAllTasks()`: Get all exercises
- `getTaskById(id)`: Get exercise by ID
- `insertTask(task)`: Create new exercise
- `updateTask(task)`: Update exercise
- `deleteTask(id)`: Delete exercise
- `getTasksByWorkout(workoutId)`: Get exercises for a workout
- `getLogEntriesByTask(taskId)`: Get history for an exercise
- `insertLogEntry(entry)`: Log a workout
- `updateLogEntry(entry)`: Update workout entry
- `deleteLogEntry(id)`: Delete workout entry
- `saveVideo(fileName, data)`: Save video file
- `getVideo(fileName)`: Retrieve video file
- `addToSyncQueue(operation, entityType, entityData)`: Queue sync operation
- `getSyncQueue(status)`: Get sync queue items
- `removeFromSyncQueue(id)`: Remove from sync queue

### 2. GitHub Sync Manager (`github-sync.js`)

**Class:** `GitHubSync`

**Key Methods:**
- `init()`: Initialize from localStorage
- `setToken(token)`: Set GitHub token
- `isAuthenticated()`: Check if authenticated
- `syncToGitHub()`: Upload data to GitHub
- `syncFromGitHub()`: Download data from GitHub
- `exportData()`: Export all data for sync
- `importData(data)`: Import data from sync
- `createEntryHash(entry, taskName)`: Create hash for deduplication
- `areEntriesDuplicate(entry1, entry2, ...)`: Check if entries are duplicates
- `logout()`: Clear authentication

**Deduplication Strategy:**
- Content-based hashing for O(1) duplicate detection
- Hash based on: task name, date (day precision), sets (normalized)
- Additional comparison for collision detection

### 3. Application Logic (`app.js`)

**Key Functions:**

**Initialization:**
- `init()`: Initialize app on load
- `initializeDefaultWorkouts()`: Create default workouts

**Navigation:**
- `navigate(screen)`: Navigate between screens
- `showHomeScreen()`: Display home screen
- `showDetailScreen()`: Display workout detail
- `showEditScreen()`: Display edit screen
- `showWorkoutScreen()`: Display active workout
- `showHistoryScreen(taskId)`: Display exercise history

**Workout Management:**
- `showManageWorkouts()`: Show workout management
- `saveNewWorkout()`: Create new workout
- `editWorkout(id)`: Edit workout name
- `deleteWorkout(id)`: Delete workout
- `moveWorkoutUp/Down(index)`: Reorder workouts

**Exercise Management:**
- `showManageTasksScreen()`: Show exercise management
- `showAddTaskScreen()`: Show add exercise form
- `saveTask()`: Save new exercise
- `editTask(id)`: Edit exercise
- `deleteTask(id)`: Delete exercise
- `moveTaskUp/Down(index)`: Reorder exercises

**Workout Execution:**
- `startWorkout()`: Begin workout session
- `showWorkoutPage(index)`: Display exercise page
- `updateSetReps(taskId, setIndex, delta)`: Update reps
- `updateSetWeight(taskId, setIndex, value)`: Update weight
- `addSet(taskId)`: Add new set
- `completeTask(taskId)`: Mark exercise complete
- `skipTask(taskId)`: Skip exercise
- `finishWorkout()`: Save workout and finish

**History Management:**
- `showTaskHistory(taskId)`: Show exercise history
- `editHistoryEntry(entryId)`: Edit past workout
- `saveEditedHistoryEntry()`: Save edited entry
- `deleteHistoryEntry()`: Delete entry

**Sync Management:**
- `showSyncScreen()`: Display sync screen
- `connectGitHub()`: Connect to GitHub
- `syncToGitHub()`: Upload to GitHub
- `syncFromGitHub()`: Download from GitHub
- `autoSync()`: Automatic background sync
- `processSyncQueue()`: Process pending syncs
- `updateSyncStatus()`: Update UI sync status

**Utilities:**
- `formatDate(timestamp)`: Format date for display
- `fileToBase64(file)`: Convert file to base64
- `exportDatabase()`: Export database as JSON
- `confirmDatabaseWipe()`: Clear workout history

---

## ☁️ GitHub Sync System

### Overview

The app uses GitHub Gists as a free cloud storage solution for syncing data across devices.

### How It Works

1. **Authentication:**
   - User creates a GitHub Personal Access Token with `gist` scope
   - Token stored in localStorage
   - Token used for all API requests

2. **Data Storage:**
   - All data (workouts, exercises, history) stored in a private GitHub Gist
   - Gist ID stored in localStorage
   - Videos NOT synced (too large for Gists)

3. **Sync Process:**
   - **Upload**: Export all data → Merge with existing Gist data → Upload to Gist
   - **Download**: Download Gist → Import data → Merge with local data
   - **Deduplication**: Content-based hashing prevents duplicates

4. **Automatic Sync:**
   - Changes queued in `syncQueue` store
   - Background processor runs every 30 seconds
   - Syncs when online, queues when offline

### Sync Queue System

**Operations:**
- `create`: New entity created
- `update`: Entity updated
- `delete`: Entity deleted

**Processing:**
- Max 3 retries per item
- 30 second delay between retries
- Network errors stop processing (resume when online)
- Failed items marked as `failed` after max retries

### Data Format

**Exported JSON Structure:**
```json
{
    "version": 3,
    "workouts": [...],
    "tasks": [...],
    "logEntries": [...],
    "videos": [],
    "lastSync": 1234567890
}
```

### Deduplication Algorithm

1. **Hash Creation:**
   - Normalize task name (lowercase, trim)
   - Normalize date to day precision
   - Normalize sets (sort by weight, then reps)
   - Create hash from normalized data

2. **Comparison:**
   - Compare hashes first (O(1) lookup)
   - If hash matches, do full comparison
   - Check: task name, date, sets array

3. **Merging:**
   - Remote entries added to hash map
   - Local entries checked against map
   - Only new entries added

---

## 📖 Usage Guide

### Creating Your First Workout

1. Open the app
2. Click "Manage Workouts" on home screen
3. Click "+ Add Workout"
4. Enter workout name (e.g., "Push Day")
5. Click "Add"

### Adding Exercises

1. Click "Manage Tasks" on home screen
2. Click "+ Add Task"
3. Fill in exercise details:
   - **Step 1**: Exercise name (required)
   - **Step 2**: Target muscle tips (optional)
   - **Step 3**: Instructions (optional)
   - **Step 4**: Default sets and reps
   - **Step 5**: Video file (optional)
4. Click "Save"

### Adding Exercises to a Workout

1. Select a workout from home screen
2. Click "EDIT"
3. Click "+ Add Task to Workout"
4. Select exercises to add
5. Click "Add Tasks"

### Starting a Workout

1. Select a workout from home screen
2. Click "START"
3. For each exercise:
   - Adjust reps using +/- buttons
   - Enter weight in kg
   - Add/remove sets as needed
   - Click "DONE" when complete
   - Click "SKIP" to skip exercise
4. Click "Finish" when done

### Viewing History

1. Click "Manage Tasks"
2. Click the 📊 icon next to an exercise
3. View all past workouts for that exercise
4. Click an entry to edit or delete

### Setting Up GitHub Sync

1. Create GitHub Personal Access Token:
   - Go to https://github.com/settings/tokens
   - Click "Generate new token (classic)"
   - Select `gist` scope
   - Copy token

2. In the app:
   - Click "⚙️ Sync" button
   - Paste token
   - Click "Connect"
   - Click "Upload to GitHub" (first device)
   - On other devices: Click "Download from GitHub"

---

## 💻 Development

### Code Style

- **JavaScript**: ES6+ features, async/await
- **Naming**: camelCase for variables/functions, PascalCase for classes
- **Comments**: JSDoc-style comments for complex functions
- **Error Handling**: Try-catch blocks with user-friendly messages

### Adding New Features

1. **New Screen:**
   - Add HTML in `index.html` with class `screen`
   - Add navigation case in `navigate()`
   - Create show function (e.g., `showNewScreen()`)

2. **New Database Entity:**
   - Add object store in `database.js` `onupgradeneeded`
   - Add CRUD methods
   - Update sync queue if needed

3. **New Sync Operation:**
   - Add to `exportData()` in `github-sync.js`
   - Add to `importData()` in `github-sync.js`
   - Update deduplication if needed

### Testing

**Manual Testing Checklist:**
- [ ] Create workout
- [ ] Add exercise
- [ ] Add exercise to workout
- [ ] Start and complete workout
- [ ] View history
- [ ] Edit history entry
- [ ] Delete exercise
- [ ] Reorder workouts/exercises
- [ ] GitHub sync (upload/download)
- [ ] Export database
- [ ] Clear history

**Browser Testing:**
- Chrome/Edge
- Firefox
- Safari
- Mobile browsers

### Debugging

**Browser Console:**
- Open DevTools (F12)
- Check Console tab for errors
- Check Application tab → IndexedDB for database inspection
- Check Network tab for GitHub API calls

**Common Issues:**
- Database not initialized: Check `db.init()` called
- Sync failing: Check token validity, network connection
- Data not saving: Check IndexedDB quota, browser permissions

---

## 🚀 Deployment

### GitHub Pages

1. **Create Repository:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin <your-repo-url>
   git push -u origin main
   ```

2. **Enable GitHub Pages:**
   - Go to repository Settings → Pages
   - Source: `main` branch, `/ (root)` folder
   - Save

3. **Access:**
   - `https://<username>.github.io/<repo-name>/`

### Other Hosting Options

**Any Static Host:**
- Netlify
- Vercel
- Firebase Hosting
- AWS S3 + CloudFront
- Any web server

**Requirements:**
- HTTPS (required for GitHub API)
- Serve `index.html` as default
- No server-side processing needed

### Custom Domain

1. Add `CNAME` file with domain name
2. Configure DNS with provider
3. Update GitHub Pages settings

---

## 🔍 Troubleshooting

### App Not Loading

**Problem:** Blank screen or errors

**Solutions:**
- Check browser console (F12) for errors
- Verify all files are present
- Check file paths in `index.html`
- Try different browser
- Clear browser cache

### Data Not Saving

**Problem:** Changes not persisting

**Solutions:**
- Check IndexedDB quota (browser settings)
- Check browser console for errors
- Verify database initialized (`db.init()`)
- Check browser permissions
- Try incognito/private mode

### GitHub Sync Not Working

**Problem:** Sync fails or doesn't connect

**Solutions:**
- Verify token has `gist` scope
- Check token hasn't expired
- Verify internet connection
- Check browser console for API errors
- Ensure using HTTPS (required for GitHub API)
- Try generating new token

### Videos Not Playing

**Problem:** Video won't play

**Solutions:**
- Check video file format (MP4 recommended)
- Verify video file size (large files may fail)
- Check browser video codec support
- Try different video file

### Performance Issues

**Problem:** App is slow

**Solutions:**
- Check number of log entries (large history can slow down)
- Clear old workout history
- Check browser performance (DevTools → Performance)
- Reduce video file sizes
- Use "Clear Workout History" if needed

### Data Loss

**Problem:** Data disappeared

**Solutions:**
- Check if using different browser/device
- Check if database was cleared
- Restore from GitHub sync (if enabled)
- Restore from exported backup (if available)
- Check browser storage settings

---

## 📝 Version History

### Version 3 (Current)
- **Major Refactor:** Workouts and tasks are now independent
- Tasks can belong to multiple workouts
- Improved sync deduplication
- Better data structure

### Version 2
- Added GitHub sync functionality
- Added sync queue system
- Added database export

### Version 1
- Initial release
- Basic workout tracking
- Local storage only

---

## 🔐 Security & Privacy

### Data Storage

- **Local Data:** Stored in browser IndexedDB (private to browser)
- **Cloud Data:** Stored in private GitHub Gist (only accessible with token)
- **Videos:** Stored locally only (not synced)

### Authentication

- GitHub token stored in localStorage (browser-specific)
- Token only has `gist` scope (limited permissions)
- Token can be revoked from GitHub settings

### Best Practices

- Keep GitHub token secure
- Don't share token with others
- Regularly export database backups
- Use strong GitHub password
- Enable 2FA on GitHub account

---

## 📄 License

This project is open source and available for personal use.

---

## 🤝 Contributing

This is a personal project, but suggestions and improvements are welcome!

---

## 📞 Support

For issues or questions:
1. Check this README
2. Check browser console for errors
3. Review `SYNC_USER_GUIDE.md` for sync issues
4. Review `DEPLOYMENT.md` for deployment issues

---

## 🎯 Future Enhancements

Potential features for future versions:
- [ ] Dark mode
- [ ] Exercise templates
- [ ] Workout plans/programs
- [ ] Progress charts/graphs
- [ ] Export to CSV/PDF
- [ ] Rest timer
- [ ] Exercise search
- [ ] Body weight tracking
- [ ] Workout sharing
- [ ] PWA install prompt

---

**Last Updated:** Based on current codebase analysis  
**App Version:** 3  
**Database Version:** 3


