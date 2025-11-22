# Gym Tracker - Web App

A modern, responsive web application for tracking gym workouts. This is a web version of the Gym Tracker app that can be hosted on GitHub Pages.

## Features

- 🏋️ **8 Muscle Groups**: Chest, Back, Shoulders, Arms, Legs, Core, Cardio, Full Body
- 📝 **Custom Tasks**: Add exercises with instructions, tips, and optional videos
- 📊 **Workout Logging**: Track sets, reps, and weight (in kg) for each exercise
- 📈 **History Tracking**: View your workout history organized by exercise
- 💾 **Local Storage**: All data is stored locally in your browser using IndexedDB
- ☁️ **GitHub Sync**: Sync your data across all devices using GitHub Gists
- 📱 **Responsive Design**: Works on desktop, tablet, and mobile devices
- 🎥 **Video Support**: Attach videos to exercises for reference

## How to Use

1. **Open the app**: Simply open `index.html` in your web browser, or host it on GitHub Pages
2. **Select a muscle group**: Click on any muscle group card from the home screen
3. **Add exercises**: Click "EDIT" to add exercises to your routine
4. **Start workout**: Click "START" to begin logging your workout
5. **Track progress**: View your history to see past workouts

## Local Development

Simply open `index.html` in a modern web browser. No build process or server required!

For best results, use a local web server:
```bash
# Using Python 3
python -m http.server 8000

# Using Node.js (http-server)
npx http-server

# Using PHP
php -S localhost:8000
```

Then open `http://localhost:8000` in your browser.

## Deploy to GitHub Pages

1. Push all files to a GitHub repository
2. Go to repository Settings → Pages
3. Select the branch (usually `main` or `master`)
4. Select the root folder
5. Click Save
6. Your app will be available at `https://yourusername.github.io/repository-name/`

## Browser Support

- Chrome/Edge (recommended)
- Firefox
- Safari
- Opera

Requires a modern browser with IndexedDB support.

## Data Storage

### Local Storage (IndexedDB)
All data is stored locally in your browser using IndexedDB. This means:
- ✅ No server required
- ✅ Your data stays private
- ✅ Works offline
- ⚠️ Data is browser-specific by default

### GitHub Sync (Optional)
You can sync your data across all devices using GitHub Gists:
- ✅ Access your workouts from any device
- ✅ Automatic sync when you make changes
- ✅ Data stored in a private GitHub Gist
- ✅ Free and secure

**To enable GitHub Sync:**
1. Go to Settings → GitHub Sync in the app
2. Create a GitHub Personal Access Token:
   - Go to [GitHub Settings → Developer settings → Personal access tokens](https://github.com/settings/tokens)
   - Click "Generate new token (classic)"
   - Select the `gist` scope
   - Copy the token and paste it in the app
3. Your data will automatically sync to GitHub!

**Note:** Videos are stored locally in your browser (too large for GitHub Gists)

## File Structure

```
.
├── index.html          # Main HTML file
├── styles.css          # All styles
├── database.js         # IndexedDB database manager
├── github-sync.js      # GitHub Gists sync manager
├── app.js              # Main application logic
└── README_WEB.md       # This file
```

## Features in Detail

### Home Screen
- Grid view of 8 muscle groups
- Shows last workout date for each group
- Click any card to view details

### Muscle Group Detail
- START button to begin workout
- EDIT button to manage exercises
- HISTORY button to view past workouts

### Edit Screen
- Add new exercises
- Delete exercises
- Reorder exercises (ORDER mode)
- Each exercise can have:
  - Name
  - Tips
  - Instructions
  - Optional video

### Workout Screen
- Swipeable pages for each exercise
- Pre-filled values from last workout
- Quick +/- buttons for sets and reps
- Weight input in kilograms
- Progress bar at bottom
- DONE and SKIP buttons

### History Screen
- View all logged workouts
- Organized by exercise
- Expandable entries
- Shows sets, reps, weight, and date

## License

This project is open source and available for personal use.

