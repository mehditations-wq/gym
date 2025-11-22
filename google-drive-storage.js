// Google Drive Storage Manager for Videos
class GoogleDriveStorage {
    constructor() {
        this.clientId = null;
        this.accessToken = null;
        this.initialized = false;
        this.gapiLoaded = false;
    }

    // Load Google API
    async loadGapi() {
        return new Promise((resolve, reject) => {
            // Check if already loaded
            if (window.gapi && window.gapi.load) {
                // API is loaded, just initialize client
                window.gapi.load('client:auth2', () => {
                    this.gapiLoaded = true;
                    resolve();
                });
                return;
            }

            // Check if already loading
            if (window.gapiLoading) {
                const checkInterval = setInterval(() => {
                    if (window.gapi && window.gapi.load) {
                        clearInterval(checkInterval);
                        window.gapi.load('client:auth2', () => {
                            this.gapiLoaded = true;
                            resolve();
                        });
                    }
                }, 100);
                return;
            }

            window.gapiLoading = true;

            // Wait for script from HTML to load
            const checkScript = setInterval(() => {
                if (window.gapi && window.gapi.load) {
                    clearInterval(checkScript);
                    window.gapiLoading = false;
                    window.gapi.load('client:auth2', () => {
                        this.gapiLoaded = true;
                        resolve();
                    });
                }
            }, 100);

            // Timeout after 10 seconds
            setTimeout(() => {
                clearInterval(checkScript);
                if (!this.gapiLoaded) {
                    window.gapiLoading = false;
                    reject(new Error('Failed to load Google API - script may not be included in HTML'));
                }
            }, 10000);
        });
    }

    // Initialize with Client ID
    async init(clientId) {
        if (this.initialized && this.clientId === clientId) {
            return;
        }

        try {
            await this.loadGapi();
            
            await window.gapi.client.init({
                clientId: clientId,
                discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
                scope: 'https://www.googleapis.com/auth/drive.file'
            });

            this.clientId = clientId;
            this.initialized = true;
            console.log('Google Drive API initialized');
        } catch (error) {
            console.error('Error initializing Google Drive:', error);
            throw error;
        }
    }

    // Check if configured
    isConfigured() {
        const clientId = localStorage.getItem('google_drive_client_id');
        return !!clientId && this.initialized;
    }

    // Set Client ID
    setClientId(clientId) {
        this.clientId = clientId;
        localStorage.setItem('google_drive_client_id', clientId);
    }

    // Get Client ID
    getClientId() {
        return localStorage.getItem('google_drive_client_id');
    }

    // Sign in
    async signIn() {
        if (!this.initialized) {
            const clientId = this.getClientId();
            if (clientId) {
                await this.init(clientId);
            } else {
                throw new Error('Google Drive not configured');
            }
        }

        const authInstance = window.gapi.auth2.getAuthInstance();
        const user = await authInstance.signIn();
        this.accessToken = user.getAuthResponse().access_token;
        return this.accessToken;
    }

    // Sign out
    async signOut() {
        if (!this.initialized) return;
        const authInstance = window.gapi.auth2.getAuthInstance();
        await authInstance.signOut();
        this.accessToken = null;
    }

    // Check if signed in
    async isSignedIn() {
        if (!this.initialized) return false;
        try {
            const authInstance = window.gapi.auth2.getAuthInstance();
            const isSignedIn = authInstance.isSignedIn.get();
            if (isSignedIn) {
                const user = authInstance.currentUser.get();
                this.accessToken = user.getAuthResponse().access_token;
            }
            return isSignedIn;
        } catch (error) {
            return false;
        }
    }

    // Get access token (refresh if needed)
    async getAccessToken() {
        if (!(await this.isSignedIn())) {
            await this.signIn();
        }
        return this.accessToken;
    }

    // Upload video to Google Drive
    async uploadVideo(file, fileName) {
        if (!this.initialized) {
            const clientId = this.getClientId();
            if (clientId) {
                await this.init(clientId);
            } else {
                throw new Error('Google Drive not configured');
            }
        }

        // Ensure signed in
        const token = await this.getAccessToken();

        try {
            const metadata = {
                name: fileName,
                mimeType: file.type || 'video/mp4'
            };

            // Create file metadata
            const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(metadata)
            });

            if (!createResponse.ok) {
                const error = await createResponse.json();
                throw new Error(error.error?.message || 'Failed to create file');
            }

            const fileData = await createResponse.json();
            const fileId = fileData.id;

            // Upload file content
            const uploadResponse = await fetch(
                `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
                {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': file.type || 'video/mp4'
                    },
                    body: file
                }
            );

            if (!uploadResponse.ok) {
                // Delete the file if upload failed
                await this.deleteVideo(fileId);
                throw new Error('Failed to upload file content');
            }

            // Make file publicly accessible for download
            try {
                await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        role: 'reader',
                        type: 'anyone'
                    })
                });
            } catch (permError) {
                console.warn('Failed to make file public, but upload succeeded:', permError);
            }

            // Return download URL (using file ID)
            // Store fileId with the video for later deletion
            return {
                url: `https://drive.google.com/uc?export=download&id=${fileId}`,
                fileId: fileId
            };
        } catch (error) {
            console.error('Error uploading video:', error);
            throw error;
        }
    }

    // Download video from Google Drive
    async downloadVideo(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error('Failed to download video');
            }
            const blob = await response.blob();
            return blob;
        } catch (error) {
            console.error('Error downloading video:', error);
            throw error;
        }
    }

    // Delete video from Google Drive
    async deleteVideo(fileId) {
        if (!this.initialized) {
            throw new Error('Google Drive not initialized');
        }

        const token = await this.getAccessToken();

        try {
            const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok && response.status !== 404) {
                throw new Error('Failed to delete file');
            }
        } catch (error) {
            console.error('Error deleting video:', error);
            throw error;
        }
    }

    // Extract file ID from URL
    extractFileId(url) {
        // Handle different Google Drive URL formats
        const match = url.match(/[?&]id=([^&]+)/);
        if (match) {
            return match[1];
        }
        // If URL is just the file ID
        if (url.length < 50 && !url.includes('http')) {
            return url;
        }
        return null;
    }
}

// Initialize Google Drive Storage instance
const googleDriveStorage = new GoogleDriveStorage();

