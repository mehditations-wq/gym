# Google Drive Setup Guide

This guide will help you set up Google Drive for video storage in your Gym Tracker app.

## Benefits

- ✅ **15GB free storage** (shared with Gmail, Photos, etc.)
- ✅ **No payment method required**
- ✅ **Uses your existing Google account**
- ✅ **Videos sync across all devices**

## Step-by-Step Setup

### Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click the project dropdown at the top
3. Click **"New Project"**
4. Enter a project name (e.g., "Gym Tracker")
5. Click **"Create"**
6. Wait for the project to be created, then select it from the dropdown

### Step 2: Enable Google Drive API

1. In the left sidebar, go to **"APIs & Services"** → **"Library"**
2. Search for **"Google Drive API"**
3. Click on **"Google Drive API"**
4. Click **"Enable"**
5. Wait for it to enable (may take a few seconds)

### Step 3: Configure OAuth Consent Screen

1. Go to **"APIs & Services"** → **"OAuth consent screen"**
2. Select **"External"** (unless you have a Google Workspace account)
3. Click **"Create"**
4. Fill in the required fields:
   - **App name**: "Gym Tracker" (or any name you like)
   - **User support email**: Your email address
   - **Developer contact information**: Your email address
5. Click **"Save and Continue"**
6. On the **Scopes** page, click **"Add or Remove Scopes"**
7. Search for and select: `https://www.googleapis.com/auth/drive.file`
8. Click **"Update"**, then **"Save and Continue"**
9. On the **Test users** page (if shown), you can add your email, or click **"Save and Continue"**
10. Review and click **"Back to Dashboard"**

### Step 4: Create OAuth Client ID

1. Go to **"APIs & Services"** → **"Credentials"**
2. Click **"Create Credentials"** → **"OAuth client ID"**
3. If prompted, select **"Web application"** as the application type
4. Fill in the form:
   - **Name**: "Gym Tracker Web"
   - **Authorized JavaScript origins**: 
     - For local testing: `http://localhost`
     - For GitHub Pages: `https://yourusername.github.io`
     - Add both if you want to test locally and deploy
   - **Authorized redirect URIs**:
     - For local testing: `http://localhost`
     - For GitHub Pages: `https://yourusername.github.io`
     - Add both if needed
5. Click **"Create"**
6. **Copy the Client ID** (it looks like: `xxxxx.apps.googleusercontent.com`)
   - ⚠️ **Important**: Copy this immediately - you won't see it again easily!

### Step 5: Configure in the App

1. Open your Gym Tracker app
2. Click **"⚙️ Sync"** in the header
3. Scroll down to **"Video Sync (Google Drive)"**
4. Click **"Configure Google Drive"**
5. Paste your **OAuth Client ID** in the field
6. Click **"Save"**
7. You should see: "✓ Google Drive configured"
8. Click **"Sign In to Google"** button
9. A popup will open - sign in with your Google account
10. Grant permissions when prompted
11. You're done! ✅

## Testing

1. Add a new exercise with a video
2. The video should upload to Google Drive
3. Check your Google Drive - you should see a "videos" folder (or files in root)
4. On another device, sync and the video should download

## Troubleshooting

### "Failed to load Google API"
- Make sure the Google API script is included in your HTML (it should be automatically)
- Check browser console for errors

### "Sign in popup blocked"
- Allow popups for your site
- Try clicking "Sign In" again

### "Access denied" or "Permission denied"
- Make sure you've enabled Google Drive API
- Check that the OAuth consent screen is configured
- Verify the Client ID is correct

### "Invalid client" error
- Double-check your Client ID
- Make sure authorized origins match your domain exactly
- For localhost, use `http://localhost` (not `http://localhost:8000`)

### Videos not uploading
- Make sure you're signed in (check the status in Sync screen)
- Check browser console for errors
- Try signing out and signing back in

### Videos not syncing to other devices
- Make sure both devices are signed in with the same Google account
- Videos are stored in your Google Drive, so they're accessible from any device
- The app downloads videos when you sync from GitHub

## Security Notes

- Videos are stored in your personal Google Drive
- Only you can access them (unless you share them)
- The app uses OAuth2 for secure authentication
- Your Client ID is stored locally in your browser

## Free Tier Limits

- **15GB total storage** (shared with Gmail, Photos, etc.)
- **No bandwidth limits** for personal use
- **No payment required**

## Need Help?

If you encounter issues:
1. Check the browser console (F12) for error messages
2. Verify all steps were completed correctly
3. Try signing out and signing back in
4. Make sure Google Drive API is enabled in your project

---

**Note**: If you're testing locally, make sure to add `http://localhost` to authorized origins. If deploying to GitHub Pages, add your GitHub Pages URL.

