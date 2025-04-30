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
        
        try {
            let cleanToken = token.trim();
            cleanToken = cleanToken.replace(/[^\x00-\x7F]/g, '');
            cleanToken = decodeURIComponent(encodeURIComponent(cleanToken));
            let asciiOnly = '';
            for (let i = 0; i < cleanToken.length; i++) {
                const charCode = cleanToken.charCodeAt(i);
                if (charCode <= 127) {
                    asciiOnly += cleanToken.charAt(i);
                }
            }
            cleanToken = asciiOnly;
            
            console.log('Original token length:', token.length);
            console.log('Sanitized token length:', cleanToken.length);
            if (cleanToken.length < 30) {
                console.error('Token is too short after sanitization, likely contains too many invalid characters');
                throw new Error('Token contains too many invalid characters');
            }

            this.token = cleanToken;
            localStorage.setItem('ghub_token', this.token);
            this.log('Token set and saved to localStorage');

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

            const userResponse = await fetch('https://api.github.com/user', {
                method: 'GET',
                headers: headers,
                mode: 'cors',
                cache: 'no-cache',
                credentials: 'omit'
            });
            
            if (!userResponse.ok) {
                return false;
            }
            
            this.userInfo = await userResponse.json();
            this.log('Token validated successfully', { username: this.userInfo.login });

            const repoResponse = await fetch(`https://api.github.com/repos/${this.repo}`, {
                headers: this.createHeaders(),
                mode: 'cors',
                cache: 'no-cache',
                credentials: 'omit'
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
     * @returns {Object}
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
     * @param {string} message
     * @param {Object} data
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
     * @param {string} message
     * @param {Error|Object} error
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
     * @param {boolean} includeContentType
     * @returns {Object}
     */
    createHeaders(includeContentType = false) {
        let safeToken = '';
        for (let i = 0; i < this.token.length; i++) {
            const charCode = this.token.charCodeAt(i);
            if (charCode <= 127) {
                safeToken += this.token.charAt(i);
            }
        }
        const headers = {
            'Authorization': `token ${safeToken}`,
            'Accept': 'application/vnd.github.v3+json'
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
            
            // Fix: Properly decode the Base64 content with UTF-8 support
            const base64 = data.content.replace(/\n/g, '');
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            const decodedContent = new TextDecoder('utf-8').decode(bytes);
            
            try {
                const messagesData = JSON.parse(decodedContent);
                this.lastSha = data.sha;
                
                this.log(`Successfully fetched ${messagesData.messages?.length || 0} messages`);
                return messagesData.messages || [];
            } catch (parseError) {
                this.logError('Error parsing messages JSON', parseError);
                this.logError('Raw content:', decodedContent);
                throw new Error('Invalid JSON in messages file');
            }
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
     * @param {Array} messages
     * @returns {Promise<boolean>}
     */
    async saveScheduledMessages(messages) {
        if (!this.isAuthenticated()) {
            this.log('Authentication required for saveScheduledMessages');
            throw new Error('Authentication required');
        }

        try {
            this.log(`Saving ${messages.length} message(s)`);
            let branchExists = await this.checkBranchExists('gh-pages');
            if (!branchExists) {
                const branchCreated = await this.createGhPagesBranch();
                if (!branchCreated) {
                    throw new Error('Could not create gh-pages branch');
                }
                branchExists = await this.checkBranchExists('gh-pages');
                if (!branchExists) {
                    throw new Error('gh-pages branch creation failed verification');
                }
            }
            
            await this.ensureDataDirectoryExists();
            
            const content = JSON.stringify({ messages: messages }, null, 2);
            
            const encodedContent = btoa(
                new Uint8Array(
                    [...unescape(encodeURIComponent(content))]
                    .map(c => c.charCodeAt(0))
                )
                .reduce((data, byte) => data + String.fromCharCode(byte), '')
            );
            
            if (!this.lastSha) {
                await this.getMessageFileSha();
            }

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

            const saveResponse = await this.fetchWithRetry(
                `https://api.github.com/repos/${this.repo}/contents/data/messages.json`,
                {
                    method: 'PUT',
                    headers: this.createHeaders(true),
                    body: JSON.stringify(body)
                },
                3
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
     * @param {string} url
     * @param {Object} options
     * @param {number} retries
     * @returns {Promise<Response>}
     */
    async fetchWithRetry(url, options, retries = 3) {
        if (!options.mode) {
            options.mode = 'cors';
        }

        if (!options.cache) {
            options.cache = 'no-cache';
        }
        
        if (!options.credentials) {
            options.credentials = 'omit';
        }
        
        let lastError;
        
        for (let i = 0; i < retries; i++) {
            try {
                const response = await fetch(url, options);

                if (response.ok || response.status < 500) {
                    return response;
                }
                
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
     * @param {string} branchName
     * @returns {Promise<boolean>}
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
     * @returns {Promise<string|null>}
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
     * @returns {Promise<boolean>}
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

                const content = btoa('');
                
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
     * @returns {Promise<boolean>}
     */
    async createGhPagesBranch() {
        try {
            this.log('Creating gh-pages branch');

            if (!this.defaultBranch) {
                const repoInfo = await this.getRepoInfo();
                this.defaultBranch = repoInfo.default_branch;
            }

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
     * @returns {Promise<Object>}
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
