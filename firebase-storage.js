// Firebase Storage Manager for Videos
class FirebaseStorage {
    constructor() {
        this.app = null;
        this.storage = null;
        this.initialized = false;
    }

    // Initialize Firebase (call this with your Firebase config)
    async init(firebaseConfig) {
        if (this.initialized) {
            return;
        }

        try {
            // Check if Firebase is already loaded
            if (typeof firebase === 'undefined') {
                throw new Error('Firebase SDK not loaded. Please include Firebase scripts in your HTML.');
            }

            // Initialize Firebase App
            if (!firebase.apps.length) {
                this.app = firebase.initializeApp(firebaseConfig);
            } else {
                this.app = firebase.app();
            }

            // Initialize Storage
            this.storage = firebase.storage();
            this.initialized = true;
            console.log('Firebase Storage initialized');
        } catch (error) {
            console.error('Error initializing Firebase:', error);
            throw error;
        }
    }

    // Check if Firebase is configured
    isConfigured() {
        const config = localStorage.getItem('firebase_config');
        return !!config && this.initialized;
    }

    // Save Firebase config
    setConfig(firebaseConfig) {
        localStorage.setItem('firebase_config', JSON.stringify(firebaseConfig));
    }

    // Get Firebase config
    getConfig() {
        const config = localStorage.getItem('firebase_config');
        return config ? JSON.parse(config) : null;
    }

    // Upload video to Firebase Storage
    async uploadVideo(file, fileName) {
        if (!this.initialized) {
            const config = this.getConfig();
            if (config) {
                await this.init(config);
            } else {
                throw new Error('Firebase not configured. Please set up Firebase Storage first.');
            }
        }

        try {
            const storageRef = this.storage.ref();
            const videoRef = storageRef.child(`videos/${fileName}`);
            
            // Upload file
            const snapshot = await videoRef.put(file);
            
            // Get download URL
            const downloadURL = await snapshot.ref.getDownloadURL();
            
            return downloadURL;
        } catch (error) {
            console.error('Error uploading video:', error);
            throw error;
        }
    }

    // Download video from Firebase Storage
    async downloadVideo(url) {
        if (!this.initialized) {
            const config = this.getConfig();
            if (config) {
                await this.init(config);
            } else {
                throw new Error('Firebase not configured');
            }
        }

        try {
            // Fetch the video as blob
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

    // Delete video from Firebase Storage
    async deleteVideo(fileName) {
        if (!this.initialized) {
            const config = this.getConfig();
            if (config) {
                await this.init(config);
            } else {
                throw new Error('Firebase not configured');
            }
        }

        try {
            const storageRef = this.storage.ref();
            const videoRef = storageRef.child(`videos/${fileName}`);
            await videoRef.delete();
        } catch (error) {
            console.error('Error deleting video:', error);
            throw error;
        }
    }

    // Convert blob to base64 for local storage fallback
    async blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }
}

// Initialize Firebase Storage instance
const firebaseStorage = new FirebaseStorage();

