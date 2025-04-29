class GitHubManager {
    constructor() {
        this.token = sessionStorage.getItem('github_token') || '';
        this.repo = 'Steinzu/discordScheduler';
        this.cacheBuster = Date.now(); // Prevent caching issues
    }

    isAuthenticated() {
        return !!this.token;
    }

    setToken(token) {
        this.token = token;
        sessionStorage.setItem('github_token', token);
    }

    getCredentials() {
        return {
            token: this.token,
            repo: this.repo
        };
    }

    async fetchScheduledMessages() {
        if (!this.isAuthenticated()) {
            throw new Error('Authentication required');
        }

        try {
            // Add cache buster to prevent stale data
            const url = `https://api.github.com/repos/${this.repo}/contents/data/messages.json?timestamp=${this.cacheBuster}`;
            const response = await fetch(url, {
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Cache-Control': 'no-cache, no-store, must-revalidate'
                }
            });

            if (response.status === 404) {
                return [];
            }

            if (!response.ok) {
                throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            const content = atob(data.content);
            const messagesData = JSON.parse(content);
            this.lastSha = data.sha; // Store SHA for later use
            
            return messagesData.messages || [];
        } catch (error) {
            console.error('Error fetching messages:', error);
            if (error.message.includes('404')) {
                return [];
            }
            throw error;
        } finally {
            // Update cache buster for next request
            this.cacheBuster = Date.now();
        }
    }

    async saveScheduledMessages(messages) {
        if (!this.isAuthenticated()) {
            throw new Error('Authentication required');
        }

        try {
            // If we don't have the SHA from a previous fetch, get it now
            if (!this.lastSha) {
                try {
                    const fileResponse = await fetch(`https://api.github.com/repos/${this.repo}/contents/data/messages.json`, {
                        headers: {
                            'Authorization': `token ${this.token}`,
                            'Accept': 'application/vnd.github.v3+json',
                            'Cache-Control': 'no-cache'
                        }
                    });
                    
                    if (fileResponse.ok) {
                        const fileData = await fileResponse.json();
                        this.lastSha = fileData.sha;
                    }
                } catch (e) {
                    // File probably doesn't exist yet
                }
            }

            // Prepare the content to save
            const content = JSON.stringify({ messages: messages }, null, 2);
            const encodedContent = btoa(unescape(encodeURIComponent(content)));

            // Build the request body
            const body = {
                message: 'Update scheduled messages',
                content: encodedContent,
                branch: 'gh-pages', // Use gh-pages branch for data to avoid rebuilding the site
                sha: this.lastSha || undefined
            };

            // Save the file
            const saveResponse = await fetch(`https://api.github.com/repos/${this.repo}/contents/data/messages.json`, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/vnd.github.v3+json'
                },
                body: JSON.stringify(body)
            });

            if (!saveResponse.ok) {
                const errorData = await saveResponse.json();
                throw new Error(`GitHub API error: ${errorData.message || saveResponse.statusText}`);
            }

            // Update SHA for next save
            const responseData = await saveResponse.json();
            this.lastSha = responseData.content.sha;

            return true;
        } catch (error) {
            console.error('Error saving messages:', error);
            throw error;
        }
    }
}
