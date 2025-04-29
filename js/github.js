/**
 * Enhanced GitHub Manager v2.0
 * Handles authentication, branch management, and file operations
 * with comprehensive error handling and debugging
 */
class GitHubManager {
    constructor() {
        this.token = localStorage.getItem('ghub_token') || '';
        this.repo = 'Steinzu/discordScheduler';
        this.cacheBuster = Date.now();
        this.lastSha = null;
        this.debug = true;
        this.defaultBranch = null;
        this.userInfo = null;
    }

    /**
     * Check if user is authenticated
     * @returns {boolean} Authentication status
     */
    isAuthenticated() {
        return !!this.token && this.token.length > 0;
    }

    /**
     * Set GitHub access token and validate it
     * @param {string} token - GitHub Personal Access Token
     * @returns {Promise<boolean>} Whether token is valid
     */
    async setToken(token) {
        if (!token) return false;
        
        // Sanitize token to remove any non-ASCII characters (like zero-width spaces)
        const sanitizedToken = this.sanitizeToken(token);
        console.log('Original token length:', token.length);
        console.log('Sanitized token length:', sanitizedToken.length);
        
        this.token = sanitizedToken;
        localStorage.setItem('ghub_token', this.token);
        this.log('Token set and saved to localStorage');
        
        // Validate token by checking user info
        try {
            const isValid = await this.validateToken();
            if (!isValid) {
                this.clearData();
                throw new Error('Invalid token or insufficient permissions');
            }
            return true;
        } catch (error) {
            this.logError('Token validation failed', error);
            this.clearData();
            return false;
        }
    }

    /**
     * Remove non-ASCII characters from token
     * @param {string} token - Token to sanitize
     * @returns {string} Sanitized token
     */
    sanitizeToken(token) {
        // Remove all non-ASCII characters (keep only chars 0-127)
        return token.replace(/[^\x00-\x7F]/g, '');
    }

    /**
     * Validate token by making a test request to GitHub API
     * @returns {Promise<boolean>} Whether token is valid
     */
    async validateToken() {
        try {
            // Log what's actually being sent (safely)
            const headers = this.createHeaders();
            console.log('Authorization header present:', !!headers.Authorization);
            console.log('Token length:', this.token.length);
            console.log('First few characters:', this.token.substring(0, 4) + '...');
            
            // Check user info
            const userResponse = await fetch('https://api.github.com/user', {
                headers: headers
            });
            
            if (!userResponse.ok) {
                return false;
            }
            
            this.userInfo = await userResponse.json();
            this.log('Token validated successfully', { username: this.userInfo.login });
            
            // Check repo access
            const repoResponse = await fetch(`https://api.github.com/repos/${this.repo}`, {
                headers: this.createHeaders()
            });
            
            if (!repoResponse.ok) {
                this.logError('Repository access failed', await repoResponse.text());
                return false;
            }
            
            const repoData = await repoResponse.json();
            this.defaultBranch = repoData.default_branch;
            this.log('Repository access confirmed', { defaultBranch: this.defaultBranch });
            
            return true;
        } catch (error) {
            this.logError('Token validation error', error);
            return false;
        }
    }

    /**
     * Get current credentials
     * @returns {Object} Credentials object
     */
    getCredentials() {
        return {
            token: this.token ? '****' + this.token.slice(-4) : '',
            repo: this.repo,
            user: this.userInfo ? this.userInfo.login : null
        };
    }

    /**
     * Log messages in debug mode
     * @param {string} message - Message to log
     * @param {Object} data - Optional data to log
     */
    log(message, data = null) {
        if (this.debug) {
            if (data) {
                console.log(`[GitHub] ${message}`, data);
            } else {
                console.log(`[GitHub] ${message}`);
            }
        }
    }

    /**
     * Log errors
     * @param {string} message - Error message
     * @param {Error|Object} error - Error object
     */
    logError(message, error) {
        console.error(`[GitHub Error] ${message}`, error);
        
        if (error && error.response) {
            console.error('API Response:', {
                status: error.response.status,
                statusText: error.response.statusText,
                data: error.response.data
            });
        }
    }

    /**
     * Create standardized headers for GitHub API requests
     * @param {boolean} includeContentType - Whether to include Content-Type header
     * @returns {Object} Headers object
     */
    createHeaders(includeContentType = false) {
        const headers = {
            'Authorization': `token ${this.token}`,  // Changed from 'Bearer' to 'token'
            'Accept': 'application/vnd.github.v3+json',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
        };
        
        if (includeContentType) {
            headers['Content-Type'] = 'application/json';
        }
        
        return headers;
    }

    /**
     * Fetch scheduled messages from GitHub
     * @returns {Promise<Array>} Array of message objects
     */
    async fetchScheduledMessages() {
        if (!this.isAuthenticated()) {
            this.log('Authentication required for fetchScheduledMessages');
            throw new Error('Authentication required');
        }

        try {
            this.log('Fetching scheduled messages');
            const url = `https://api.github.com/repos/${this.repo}/contents/data/messages.json?ref=gh-pages&timestamp=${this.cacheBuster}`;
            
            const response = await fetch(url, {
                headers: this.createHeaders()
            });

            if (response.status === 404) {
                this.log('No messages file found (404)');
                return [];
            }

            if (!response.ok) {
                const errorText = await response.text();
                this.logError(`GitHub API error: ${response.status} ${response.statusText}`, { 
                    responseText: errorText 
                });
                throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            const content = atob(data.content);
            const messagesData = JSON.parse(content);
            this.lastSha = data.sha;
            
            this.log(`Successfully fetched ${messagesData.messages?.length || 0} messages`);
            return messagesData.messages || [];
        } catch (error) {
            this.logError('Error fetching messages', error);
            
            if (error.message && error.message.includes('404')) {
                return [];
            }
            
            throw error;
        } finally {
            this.cacheBuster = Date.now();
        }
    }

    /**
     * Save scheduled messages to GitHub
     * @param {Array} messages - Array of message objects to save
     * @returns {Promise<boolean>} Success status
     */
    async saveScheduledMessages(messages) {
        if (!this.isAuthenticated()) {
            this.log('Authentication required for saveScheduledMessages');
            throw new Error('Authentication required');
        }

        try {
            this.log(`Saving ${messages.length} message(s)`);

            // Check if gh-pages branch exists first
            let branchExists = await this.checkBranchExists('gh-pages');
            
            // Create branch if it doesn't exist
            if (!branchExists) {
                const branchCreated = await this.createGhPagesBranch();
                if (!branchCreated) {
                    throw new Error('Could not create gh-pages branch');
                }
                // Retry branch check to confirm creation
                branchExists = await this.checkBranchExists('gh-pages');
                if (!branchExists) {
                    throw new Error('gh-pages branch creation failed verification');
                }
            }
            
            // Ensure data directory exists
            await this.ensureDataDirectoryExists();
            
            // Prepare content for saving
            const content = JSON.stringify({ messages: messages }, null, 2);
            const encodedContent = btoa(unescape(encodeURIComponent(content)));
            
            // Get SHA for the file if we don't have it
            if (!this.lastSha) {
                await this.getMessageFileSha();
            }

            // Construct request body
            const body = {
                message: 'Update scheduled messages',
                content: encodedContent,
                branch: 'gh-pages'
            };
            
            if (this.lastSha) {
                body.sha = this.lastSha;
            }

            this.log('Sending PUT request to save messages', { 
                fileExists: !!this.lastSha, 
                contentLength: content.length 
            });

            // Submit the request with retries
            const saveResponse = await this.fetchWithRetry(
                `https://api.github.com/repos/${this.repo}/contents/data/messages.json`,
                {
                    method: 'PUT',
                    headers: this.createHeaders(true),
                    body: JSON.stringify(body)
                },
                3 // Retry 3 times
            );

            if (saveResponse.ok) {
                const responseData = await saveResponse.json();
                this.lastSha = responseData.content.sha;
                this.log('Messages saved successfully', { newSha: this.lastSha });
                return true;
            } else {
                const errorData = await saveResponse.json();
                this.logError('GitHub API error when saving messages', errorData);
                
                if (errorData.message && errorData.message.includes('Invalid request')) {
                    throw new Error(`GitHub API error: ${errorData.message} - Token may have insufficient permissions`);
                } else if (errorData.message && errorData.message.includes('Not Found')) {
                    throw new Error('GitHub API error: Repository or branch not found');
                } else {
                    throw new Error(`GitHub API error: ${errorData.message || saveResponse.statusText}`);
                }
            }
        } catch (error) {
            this.logError('Error saving messages', error);
            throw error;
        }
    }

    /**
     * Fetch with retry logic
     * @param {string} url - URL to fetch
     * @param {Object} options - Fetch options
     * @param {number} retries - Number of retries
     * @returns {Promise<Response>} Fetch response
     */
    async fetchWithRetry(url, options, retries = 3) {
        let lastError;
        
        for (let i = 0; i < retries; i++) {
            try {
                const response = await fetch(url, options);
                
                // If successful or permanent error, return immediately
                if (response.ok || response.status < 500) {
                    return response;
                }
                
                // For server errors, retry after a delay
                this.log(`Retry ${i+1}/${retries} for ${options.method} ${url} (status ${response.status})`);
                await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
                
            } catch (error) {
                lastError = error;
                this.log(`Fetch error on attempt ${i+1}/${retries}`, error);
                await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
            }
        }
        
        throw lastError || new Error(`Failed after ${retries} retries`);
    }

    /**
     * Check if a branch exists
     * @param {string} branchName - Branch to check
     * @returns {Promise<boolean>} Whether branch exists
     */
    async checkBranchExists(branchName) {
        try {
            const branchResponse = await fetch(
                `https://api.github.com/repos/${this.repo}/branches/${branchName}`,
                { headers: this.createHeaders() }
            );
            
            if (branchResponse.ok) {
                this.log(`Branch ${branchName} exists`);
                return true;
            }
            
            this.log(`Branch ${branchName} does not exist (${branchResponse.status})`);
            return false;
        } catch (error) {
            this.logError(`Error checking if branch ${branchName} exists`, error);
            return false;
        }
    }

    /**
     * Get the SHA of the messages file if it exists
     * @returns {Promise<string|null>} SHA of the file or null if it doesn't exist
     */
    async getMessageFileSha() {
        try {
            this.log('Getting SHA for messages.json');
            const fileResponse = await fetch(
                `https://api.github.com/repos/${this.repo}/contents/data/messages.json?ref=gh-pages`, 
                { headers: this.createHeaders() }
            );
            
            if (fileResponse.ok) {
                const fileData = await fileResponse.json();
                this.lastSha = fileData.sha;
                this.log('Got file SHA', { sha: this.lastSha });
                return this.lastSha;
            } else if (fileResponse.status === 404) {
                this.log('File does not exist yet, no SHA available');
                return null;
            } else {
                const errorText = await fileResponse.text();
                this.logError('Error getting file SHA', errorText);
                return null;
            }
        } catch (e) {
            this.log('Error retrieving file SHA', e);
            return null;
        }
    }

    /**
     * Ensure data directory exists in gh-pages branch
     * @returns {Promise<boolean>} Success status
     */
    async ensureDataDirectoryExists() {
        try {
            this.log('Checking if data directory exists');
            
            const dirResponse = await fetch(
                `https://api.github.com/repos/${this.repo}/contents/data?ref=gh-pages`, 
                { headers: this.createHeaders() }
            );
            
            if (dirResponse.ok) {
                this.log('Data directory exists');
                return true;
            }
            
            if (dirResponse.status === 404) {
                this.log('Data directory does not exist, creating it');
                
                // Create an empty .gitkeep file in the data directory
                const content = btoa(''); // Empty file content
                
                const createDirResponse = await fetch(
                    `https://api.github.com/repos/${this.repo}/contents/data/.gitkeep`, 
                    {
                        method: 'PUT',
                        headers: this.createHeaders(true),
                        body: JSON.stringify({
                            message: 'Create data directory',
                            content: content,
                            branch: 'gh-pages'
                        })
                    }
                );
                
                if (createDirResponse.ok) {
                    this.log('Data directory created successfully');
                    return true;
                } else {
                    const errorText = await createDirResponse.text();
                    this.logError('Failed to create data directory', errorText);
                    return false;
                }
            }
            
            return false;
        } catch (error) {
            this.logError('Error ensuring data directory exists', error);
            return false;
        }
    }

    /**
     * Create the gh-pages branch if it doesn't exist
     * @returns {Promise<boolean>} Success status
     */
    async createGhPagesBranch() {
        try {
            this.log('Creating gh-pages branch');
            
            // Get default branch if we don't have it
            if (!this.defaultBranch) {
                const repoInfo = await this.getRepoInfo();
                this.defaultBranch = repoInfo.default_branch;
            }
            
            // Get the SHA of latest commit on default branch
            const refResponse = await fetch(
                `https://api.github.com/repos/${this.repo}/git/refs/heads/${this.defaultBranch}`,
                { headers: this.createHeaders() }
            );
            
            if (!refResponse.ok) {
                this.logError('Could not get reference for default branch', await refResponse.text());
                return false;
            }
            
            const refData = await refResponse.json();
            const sha = refData.object.sha;
            this.log(`Got SHA for latest commit: ${sha}`);
            
            // Create the gh-pages branch
            const createResponse = await fetch(
                `https://api.github.com/repos/${this.repo}/git/refs`,
                {
                    method: 'POST',
                    headers: this.createHeaders(true),
                    body: JSON.stringify({
                        ref: 'refs/heads/gh-pages',
                        sha: sha
                    })
                }
            );
            
            if (createResponse.ok) {
                this.log('Created gh-pages branch successfully');
                return true;
            }
            
            const createErrorText = await createResponse.text();
            
            // If branch already exists, that's fine
            if (createErrorText.includes('Reference already exists')) {
                this.log('Branch already exists, continuing');
                return true;
            }
            
            this.logError('Failed to create gh-pages branch', createErrorText);
            return false;
        } catch (error) {
            this.logError('Error creating gh-pages branch', error);
            return false;
        }
    }

    /**
     * Get repository information
     * @returns {Promise<Object>} Repository information
     */
    async getRepoInfo() {
        try {
            const repoResponse = await fetch(
                `https://api.github.com/repos/${this.repo}`,
                { headers: this.createHeaders() }
            );
            
            if (!repoResponse.ok) {
                throw new Error(`Could not get repository information: ${repoResponse.status}`);
            }
            
            return await repoResponse.json();
        } catch (error) {
            this.logError('Error getting repository information', error);
            throw error;
        }
    }

    /**
     * Clear all stored data and reset the manager
     */
    clearData() {
        localStorage.removeItem('ghub_token');
        this.token = '';
        this.lastSha = null;
        this.userInfo = null;
        this.log('GitHub data cleared');
    }
}
