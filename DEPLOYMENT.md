# Deployment Guide - GitHub Pages

## Quick Deploy to GitHub Pages

### Step 1: Create a GitHub Repository

1. Go to [GitHub](https://github.com) and sign in
2. Click the "+" icon in the top right → "New repository"
3. Name your repository (e.g., `gym-tracker-web`)
4. Choose Public or Private
5. **Do NOT** initialize with README, .gitignore, or license
6. Click "Create repository"

### Step 2: Upload Files

1. In your new repository, click "uploading an existing file"
2. Drag and drop these files:
   - `index.html`
   - `styles.css`
   - `database.js`
   - `github-sync.js`
   - `app.js`
   - `.nojekyll`
   - `README_WEB.md` (optional)
   - `DEPLOYMENT.md` (optional)
3. Click "Commit changes"


### Step 3: Enable GitHub Pages

1. Go to your repository on GitHub
2. Click "Settings" (top menu)
3. Scroll down to "Pages" (left sidebar)
4. Under "Source", select:
   - Branch: `main` (or `master`)
   - Folder: `/ (root)`
5. Click "Save"
6. Wait a few minutes for GitHub to build your site

### Step 4: Access Your App

Your app will be available at:
```
https://YOUR_USERNAME.github.io/YOUR_REPO_NAME/
```

For example:
```
https://johndoe.github.io/gym-tracker-web/
```

## Testing Locally

Before deploying, test locally:

1. Open `index.html` in your browser, OR
2. Use a local server:
   ```bash
   # Python
   python -m http.server 8000
   
   # Node.js
   npx http-server
   
   # PHP
   php -S localhost:8000
   ```
3. Open `http://localhost:8000` in your browser

## Troubleshooting

### App not loading?
- Make sure all files are in the root directory
- Check that `.nojekyll` file exists (prevents Jekyll processing)
- Clear browser cache and try again

### Data not saving?
- Check browser console for errors (F12)
- Make sure your browser supports IndexedDB
- Try a different browser

### Styling looks broken?
- Check that `styles.css` is in the same folder as `index.html`
- Verify file paths in `index.html` are correct

### GitHub Sync not working?
- Make sure `github-sync.js` is uploaded to your repository
- Check that you've created a GitHub Personal Access Token with `gist` scope
- Verify the token is correct (go to Settings → GitHub Sync in the app)
- Check browser console for errors (F12)
- Make sure you're using HTTPS (required for GitHub API)

## Custom Domain (Optional)

To use a custom domain:

1. Add a `CNAME` file to your repository root with your domain name
2. Configure DNS settings with your domain provider
3. Update GitHub Pages settings to use custom domain

## GitHub Sync Setup

After deploying, you can enable GitHub Sync to access your data from any device:

1. Open your deployed app
2. Click the "⚙️ Sync" button in the header
3. Create a GitHub Personal Access Token:
   - Go to [GitHub Settings → Developer settings → Personal access tokens](https://github.com/settings/tokens)
   - Click "Generate new token (classic)"
   - Give it a name (e.g., "Gym Tracker")
   - Select the **`gist`** scope (check the box)
   - Click "Generate token"
   - **Copy the token immediately** (you won't see it again!)
4. Paste the token in the app and click "Connect"
5. Your data will now sync automatically to a private GitHub Gist

**Benefits:**
- ✅ Access your workouts from any device
- ✅ Automatic sync when you make changes
- ✅ Data backed up in GitHub
- ✅ Free and secure

**Note:** Videos are stored locally in your browser (too large for GitHub Gists)

## Updates

To update your app:

1. Make changes to your files
2. Commit and push to GitHub:
   ```bash
   git add .
   git commit -m "Update app"
   git push
   ```
3. Changes will be live in a few minutes

**Important:** If you update the app code, users may need to refresh their browser to get the latest version. GitHub sync data is independent and will persist across updates.

