# GitHub Sync Guide - Sync Your Workouts Across Devices

This guide will help you set up GitHub sync so you can access your workout data from any device.

## What is GitHub Sync?

GitHub Sync stores your workout data (exercises, routines, and workout history) in a private GitHub Gist. This allows you to:
- ✅ Access your workouts from any device (phone, tablet, computer)
- ✅ Keep your data backed up in the cloud
- ✅ Sync changes automatically
- ✅ Free and secure

**Note:** Videos are stored locally on each device (too large for GitHub).

## Step-by-Step Setup

### Step 1: Create a GitHub Account (if you don't have one)

1. Go to [GitHub.com](https://github.com)
2. Click "Sign up" in the top right
3. Follow the instructions to create a free account
4. Verify your email address

### Step 2: Create a Personal Access Token

1. **Go to GitHub Settings:**
   - Click your profile picture (top right) → **Settings**
   - Or go directly to: [https://github.com/settings/tokens](https://github.com/settings/tokens)

2. **Navigate to Developer Settings:**
   - Scroll down in the left sidebar
   - Click **Developer settings**

3. **Create a New Token:**
   - Click **Personal access tokens**
   - Click **Tokens (classic)**
   - Click **Generate new token** → **Generate new token (classic)**

4. **Configure the Token:**
   - **Note:** Give it a name like "Gym Tracker" or "Workout Sync"
   - **Expiration:** Choose how long it should last (90 days, 1 year, or no expiration)
   - **Select scopes:** Check the box for **`gist`** (this is the only one you need)
   - Scroll down and click **Generate token**

5. **Copy the Token:**
   - ⚠️ **IMPORTANT:** Copy the token immediately! It looks like: `ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
   - You won't be able to see it again after you leave this page
   - Save it somewhere safe (password manager, notes app, etc.)

### Step 3: Connect to GitHub in the App

1. **Open the Gym Tracker app** on your device
2. **Click the "⚙️ Sync" button** in the top right of the home screen
3. **Paste your GitHub token** in the input field
4. **Click "Connect"**
5. You should see a success message: "Successfully connected to GitHub!"

### Step 4: Sync Your Data

#### First Time Setup (Upload Your Data):

1. After connecting, you'll see sync controls
2. Click **"Upload to GitHub"** to save your current data to the cloud
3. Wait for the success message

#### On Other Devices:

1. **Open the app** on your other device (phone, tablet, etc.)
2. **Click "⚙️ Sync"** → Enter the same GitHub token
3. **Click "Download from GitHub"** to get your data
4. Your workouts should now appear!

## How to Use Sync

### Manual Sync

**Upload to GitHub (Save your changes):**
- Go to "⚙️ Sync" → Click "Upload to GitHub"
- Use this when you've made changes and want to save them

**Download from GitHub (Get latest data):**
- Go to "⚙️ Sync" → Click "Download from GitHub"
- Use this when you want to get the latest data from another device

### Automatic Sync

The app automatically syncs to GitHub when you:
- ✅ Add a new exercise
- ✅ Edit an exercise
- ✅ Delete an exercise
- ✅ Complete a workout (log entries)
- ✅ Reorder exercises

**Note:** Automatic sync only uploads. You still need to manually download on other devices.

## Best Practices

### Daily Workflow:

1. **Morning/Before workout:**
   - Open app on your phone
   - Click "⚙️ Sync" → "Download from GitHub" (to get latest data)

2. **After workout:**
   - Complete your workout in the app
   - Data automatically syncs to GitHub
   - No need to do anything!

3. **On another device:**
   - Open app → "⚙️ Sync" → "Download from GitHub"
   - Your workout history will appear

### Troubleshooting:

**"Sync failed" error:**
- Check your internet connection
- Verify your GitHub token is still valid
- Make sure the token has the `gist` scope enabled
- Try disconnecting and reconnecting

**Data not appearing on other device:**
- Make sure you uploaded from the first device first
- Click "Download from GitHub" on the second device
- Check that you're using the same GitHub token on both devices

**Token expired:**
- Go to GitHub → Settings → Developer settings → Personal access tokens
- Create a new token
- Disconnect and reconnect in the app with the new token

## Security Notes

- ✅ Your data is stored in a **private** GitHub Gist (only you can see it)
- ✅ The token is stored in your browser's localStorage (device-specific)
- ✅ Never share your GitHub token with anyone
- ✅ If you lose your token, you can create a new one

## Disconnecting

If you want to stop syncing:
1. Go to "⚙️ Sync"
2. Click "Disconnect"
3. Your local data will remain, but it won't sync anymore

## Need Help?

If you're having issues:
1. Check that your GitHub token has the `gist` scope
2. Make sure you're connected to the internet
3. Try disconnecting and reconnecting
4. Clear browser cache and try again

---

**Remember:** Videos are stored locally on each device and don't sync. Only exercise data, routines, and workout history sync across devices.

