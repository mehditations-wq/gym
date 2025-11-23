# GitHub Sync - Complete User Guide

## 📋 Overview

The Gym Tracker app uses GitHub Gists to sync your workout data across multiple devices. This guide explains how to set it up and use it effectively.

---

## 🔧 Initial Setup (First Time)

### Step 1: Create a GitHub Personal Access Token

1. Go to [GitHub Settings → Developer settings → Personal access tokens](https://github.com/settings/tokens)
2. Click **"Generate new token (classic)"**
3. Give it a name (e.g., "Gym Tracker Sync")
4. **Important:** Select the **`gist`** scope (check the box)
5. Click **"Generate token"**
6. **Copy the token immediately** - you won't be able to see it again!

### Step 2: Connect Your First Device

1. Open the Gym Tracker app
2. Tap the **"⚙️ Sync"** button at the top of the home screen
3. Paste your GitHub token in the input field
4. Tap **"Connect"**
5. You should see "Connected to GitHub" in green

---

## 📤 Setting Up Your First Device (Upload)

After connecting:

1. Tap **"Upload to GitHub"**
2. Wait for the success message: "Successfully synced to GitHub!"
3. Your data is now saved in the cloud

**What gets uploaded:**
- ✅ All workouts (e.g., "Chest", "Back", "Legs")
- ✅ All exercises/tasks (e.g., "Bench Press", "Pull-ups")
- ✅ All workout history (sets, reps, weights, dates)
- ❌ Videos (stored locally only - too large for GitHub)

---

## 📥 Setting Up Additional Devices (Download)

On your second device (phone, tablet, etc.):

1. Open the Gym Tracker app
2. Tap **"⚙️ Sync"** button
3. Enter the **same GitHub token** you used on the first device
4. Tap **"Connect"**
5. Tap **"Download from GitHub"**
6. Wait for the success message
7. Your data will appear on this device!

**Important:** Use the **same token** on all devices to sync the same data.

---

## 🔄 How Automatic Sync Works

Once connected, the app automatically syncs in the background:

### When Auto-Sync Happens:
- ✅ After completing a workout
- ✅ After adding/editing a workout
- ✅ After adding/editing an exercise
- ✅ After editing workout history
- ✅ Every 30 seconds (if there are pending changes)

### What Happens:
1. Changes are queued for sync
2. If online: Sync happens immediately
3. If offline: Changes are saved locally and synced when you're back online
4. A warning icon (⚠️) appears if sync is needed

---

## 📊 Understanding Sync Status

### Top Bar Indicators:

- **⚙️ Sync** (gray) = Not synced yet or no changes
- **⏳ Sync (2)** = 2 pending changes waiting to sync
- **✓ Synced 5m ago** (green) = Last synced 5 minutes ago
- **⚠️** (warning icon) = Sync needed (changes pending or offline)

### Sync Screen Information:

- **Last synced:** Shows the exact date/time of last successful sync
- **Gist ID:** Your unique cloud storage identifier
- **Local data:** Shows counts of workouts, exercises, and logs

---

## 🔀 Syncing Between Devices

### Scenario 1: You Work Out on Phone, Then Check on Tablet

1. Complete workout on phone → Auto-syncs to GitHub
2. Open app on tablet → Tap **"Download from GitHub"**
3. Your workout appears on tablet!

### Scenario 2: You Add Exercises on Tablet, Then Use Phone

1. Add new exercises on tablet → Auto-syncs to GitHub
2. Open app on phone → Tap **"Download from GitHub"**
3. New exercises appear on phone!

### Scenario 3: Both Devices Have Changes

The app uses **smart merging**:
- ✅ New entries are added (no duplicates)
- ✅ Existing entries are updated if newer
- ✅ Conflicts are resolved automatically (newer data wins)

---

## 🚨 Troubleshooting

### "Sync failed: Bad credentials"
- Your token may be expired or invalid
- **Solution:** Generate a new token and reconnect

### "No data found on GitHub"
- You haven't uploaded data yet
- **Solution:** Go to your first device and tap "Upload to GitHub"

### Warning Icon Won't Go Away
- Check your internet connection
- Tap "Upload to GitHub" manually to force sync
- Check if you're connected (tap "⚙️ Sync" button)

### Duplicate Entries
- This shouldn't happen with the current version
- If it does, the app prevents duplicates automatically
- **Solution:** If you see duplicates, they won't sync again (deduplication is active)

### Offline Changes
- Changes are saved locally when offline
- They automatically sync when you're back online
- Check the sync queue status in the Sync screen

---

## 💡 Best Practices

### Daily Workflow:
1. **Morning:** Open app → Check sync status (should be green ✓)
2. **During workout:** Use app normally - changes auto-sync
3. **Evening:** If warning icon appears, tap "Upload to GitHub" to ensure sync

### Multi-Device Workflow:
1. **Before switching devices:** Wait for sync to complete (green checkmark)
2. **On new device:** Always tap "Download from GitHub" first
3. **After workout:** Let auto-sync complete before closing app

### Backup Strategy:
- Use **"Download Database Backup"** button for local backups
- Keep your GitHub token safe (you'll need it for new devices)
- The GitHub Gist serves as your cloud backup automatically

---

## 🔐 Security & Privacy

- Your data is stored in a **private GitHub Gist** (only you can access it)
- The token gives access only to Gists (not your repositories)
- You can revoke the token anytime from GitHub settings
- All data is encrypted in transit (HTTPS)

---

## ❓ Frequently Asked Questions

**Q: Do I need to manually sync every time?**  
A: No! Auto-sync handles it. Only manually sync when setting up a new device or if you see the warning icon.

**Q: What if I lose my token?**  
A: Generate a new one and reconnect. Your data is safe in the Gist.

**Q: Can I use different tokens on different devices?**  
A: No, use the same token on all devices to sync the same data.

**Q: What happens if I'm offline?**  
A: Changes are saved locally and synced automatically when you're back online.

**Q: How do I know if sync worked?**  
A: Check the top bar - green checkmark means synced. Also check "Last synced" time in Sync screen.

**Q: Can I sync videos?**  
A: No, videos are too large. They're stored locally on each device only.

**Q: What if I want to start fresh?**  
A: Use "Clear Workout History" button (keeps workouts/exercises, only clears logs).

---

## 🎯 Quick Reference

| Action | When to Use | Button Location |
|--------|-------------|-----------------|
| **Upload to GitHub** | First time setup, or force sync | Sync Screen |
| **Download from GitHub** | Setting up new device, or getting latest data | Sync Screen |
| **Check Sync Status** | See if sync is needed | Top bar (⚙️ Sync button) |
| **Disconnect** | Stop syncing (keeps local data) | Sync Screen |

---

## 📞 Need More Help?

- Check the browser console (F12) for detailed error messages
- Verify your internet connection
- Ensure your GitHub token has the `gist` scope
- Make sure you're using the same token on all devices

---

**Last Updated:** Based on current app version with content-based deduplication

