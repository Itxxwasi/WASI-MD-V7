/**
 * ═══════════════════════════════════════════════════════════════════
 *  WASI-MD V7 DOCKER LOADER
 *  Pulls and runs the bot from Docker image (source code protected)
 *  © ITXXWASI - All Rights Reserved
 * ═══════════════════════════════════════════════════════════════════
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
    DOCKER_IMAGE: process.env.DOCKER_IMAGE || 'mrwasi/sha256:4c0e06bfe4c36201d778420b85f063e3afe88a3594e7278461a2b6d116880de8',
    CONTAINER_NAME: 'wasi-md-v7-bot',
    MAX_RETRIES: 3,
    RETRY_DELAY: 5000, // 5 seconds
    // Auto-detect Heroku and disable Docker by default (Heroku doesn't support Docker on standard dynos)
    USE_DOCKER: process.env.USE_DOCKER === 'true' ? true : (process.env.DYNO ? false : process.env.USE_DOCKER !== 'false')
};

// Check if running inside Docker container
function isInsideDocker() {
    try {
        // Check for Docker-specific files
        if (fs.existsSync('/.dockerenv')) return true;

        // Check cgroup for docker
        if (fs.existsSync('/proc/1/cgroup')) {
            const cgroup = fs.readFileSync('/proc/1/cgroup', 'utf8');
            if (cgroup.includes('docker') || cgroup.includes('containerd')) return true;
        }

        // Check if index.js exists at root (Docker image structure)
        if (fs.existsSync(path.join(__dirname, 'index.js'))) {
            // Verify it's the actual bot code, not just a placeholder
            const content = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
            if (content.includes('WASI-MD') || content.includes('baileys') || content.includes('makeWASocket')) {
                return true;
            }
        }

        return false;
    } catch (e) {
        return false;
    }
}

// Check if Heroku is using container stack
function isHerokuContainerStack() {
    // When using heroku.yml with container stack, DYNO_RAM is usually set
    // and the build process is different
    return process.env.DYNO && (
        process.env.HEROKU_SLUG_COMMIT ||
        fs.existsSync(path.join(__dirname, 'index.js'))
    );
}

// Utility functions
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const log = {
    info: (msg) => console.log(`\x1b[36mℹ️  ${msg}\x1b[0m`),
    success: (msg) => console.log(`\x1b[32m✅ ${msg}\x1b[0m`),
    error: (msg) => console.error(`\x1b[31m❌ ${msg}\x1b[0m`),
    warn: (msg) => console.log(`\x1b[33m⚠️  ${msg}\x1b[0m`),
    step: (msg) => console.log(`\x1b[35m➤  ${msg}\x1b[0m`)
};

// Check if Docker is available
function isDockerAvailable() {
    try {
        execSync('docker --version', { stdio: 'pipe' });
        return true;
    } catch (error) {
        return false;
    }
}

// Check if running in a Docker-compatible environment
function isDockerEnvironment() {
    // Check for common PaaS platforms that support Docker
    const platform = process.env.PLATFORM || '';
    const isRailway = process.env.RAILWAY_ENVIRONMENT !== undefined;
    const isRender = process.env.RENDER !== undefined;
    const isHeroku = process.env.DYNO !== undefined;

    return isRailway || isRender || (isHeroku && process.env.HEROKU_DOCKER === 'true');
}

// Pull Docker image with retry
async function pullDockerImage(retries = CONFIG.MAX_RETRIES) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            log.step(`Pulling Docker image (attempt ${attempt}/${retries})...`);

            execSync(`docker pull ${CONFIG.DOCKER_IMAGE}`, {
                stdio: 'inherit',
                timeout: 300000 // 5 minute timeout
            });

            return true;
        } catch (error) {
            log.warn(`Pull attempt ${attempt} failed: ${error.message}`);

            if (attempt < retries) {
                log.info(`Waiting ${CONFIG.RETRY_DELAY / 1000}s before retry...`);
                await sleep(CONFIG.RETRY_DELAY);
            }
        }
    }
    return false;
}

// Stop and remove existing container
function cleanupContainer() {
    try {
        log.step('Cleaning up existing container...');
        execSync(`docker stop ${CONFIG.CONTAINER_NAME}`, { stdio: 'pipe' });
        execSync(`docker rm ${CONFIG.CONTAINER_NAME}`, { stdio: 'pipe' });
        log.success('Old container removed');
    } catch (error) {
        // Container doesn't exist, that's fine
    }
}

// Build environment variables for Docker
function buildDockerEnvVars() {
    const envVars = [];
    const requiredVars = ['SESSION_ID', 'OWNER_NUMBER'];
    const optionalVars = ['PREFIX', 'BOT_NAME', 'MODE', 'AUTO_READ', 'ANTI_DELETE', 'MONGO_URI'];

    // Add required vars
    for (const varName of requiredVars) {
        if (process.env[varName]) {
            envVars.push(`-e ${varName}="${process.env[varName]}"`);
        }
    }

    // Add optional vars
    for (const varName of optionalVars) {
        if (process.env[varName]) {
            envVars.push(`-e ${varName}="${process.env[varName]}"`);
        }
    }

    return envVars.join(' ');
}

async function cloneWithRetry(authUrl, retries = CONFIG.MAX_RETRIES) {
    const TARGET_DIR = path.join(__dirname, 'core');
    const REPO = 'itxxwasi-group/WASI-MD-V7';
    const BRANCH = process.env.BRANCH || 'master';

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            log.step(`Clone attempt ${attempt}/${retries}...`);

            execSync(`git clone --depth 1 --branch ${BRANCH} "${authUrl}" "${TARGET_DIR}"`, {
                stdio: 'pipe',
                env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
                timeout: 120000 // 2 minute timeout
            });

            return true;
        } catch (error) {
            log.warn(`Attempt ${attempt} failed: ${error.message}`);

            if (attempt < retries) {
                log.info(`Waiting ${CONFIG.RETRY_DELAY / 1000}s before retry...`);
                await sleep(CONFIG.RETRY_DELAY);
            }
        }
    }
    return false;
}

async function loader() {
    console.log('\n');
    console.log('\x1b[36m═══════════════════════════════════════════════════════════════\x1b[0m');
    console.log('\x1b[36m   🚀 WASI-MD V7 DOCKER LOADER - BY ITXXWASI\x1b[0m');
    console.log('\x1b[36m   Version: 7.2.0 | Build: 2026.02.08\x1b[0m');
    console.log('\x1b[36m═══════════════════════════════════════════════════════════════\x1b[0m');
    console.log('');

    // Detect platform
    const isHeroku = process.env.DYNO !== undefined;
    const isRailway = process.env.RAILWAY_ENVIRONMENT !== undefined;
    const isRender = process.env.RENDER !== undefined;

    if (isHeroku) {
        log.info('🟣 Heroku platform detected');
    } else if (isRailway) {
        log.info('🟣 Railway platform detected');
    } else if (isRender) {
        log.info('🟣 Render platform detected');
    }
    console.log('');

    // ═══════════════════════════════════════════════════════════════
    // CHECK IF RUNNING INSIDE DOCKER CONTAINER (Container Stack)
    // This handles deployment via heroku.yml / template button
    // ═══════════════════════════════════════════════════════════════
    if (isInsideDocker()) {
        log.success('🐳 Running inside Docker container!');
        log.info('Bot code is already present from Docker image.');
        console.log('');
        return; // Let start.js handle the execution
    }

    // Check required environment variables
    const sessionId = process.env.SESSION_ID;
    const ownerNumber = process.env.OWNER_NUMBER;

    if (!sessionId || !ownerNumber) {
        log.error('Required environment variables missing!');
        console.log('');
        console.log('   Required variables:');
        console.log('   ┌─────────────────────────────────────────────────────┐');
        console.log('   │  SESSION_ID     - Your WhatsApp session ID          │');
        console.log('   │  OWNER_NUMBER   - Your WhatsApp number              │');
        console.log('   └─────────────────────────────────────────────────────┘');
        console.log('');
        if (isHeroku) {
            console.log('   Set on Heroku:');
            console.log('   heroku config:set SESSION_ID=your_session_id');
            console.log('   heroku config:set OWNER_NUMBER=923001234567');
            console.log('');
        }
        process.exit(1);
    }

    // Determine deployment method
    const useDocker = CONFIG.USE_DOCKER && (isDockerAvailable() || isDockerEnvironment());

    if (useDocker) {
        log.info('🐳 Docker mode enabled');
        log.info(`Image: ${CONFIG.DOCKER_IMAGE}`);
        console.log('');

        // Check Docker availability
        if (!isDockerAvailable()) {
            log.error('Docker is not available on this system!');
            console.log('');
            console.log('   Options:');
            console.log('   1. Install Docker: https://docs.docker.com/get-docker/');
            console.log('   2. Use GitLab token mode: Set USE_DOCKER=false');
            console.log('');
            if (isHeroku) {
                log.warn('Heroku standard dynos do not support Docker!');
                console.log('   Switching to GitLab mode automatically...');
                console.log('   Please set GITLAB_TOKEN environment variable.');
                console.log('');
            }
            process.exit(1);
        }

        // Pull Docker image
        log.step('Pulling WASI-MD V7 Docker image...');
        const pullSuccess = await pullDockerImage();

        if (!pullSuccess) {
            log.error('Failed to pull Docker image!');
            console.log('');
            console.log('   Possible issues:');
            console.log('   • Network connectivity problems');
            console.log('   • Docker registry authentication required');
            console.log('   • Image does not exist or was moved');
            console.log('');
            process.exit(1);
        }

        log.success('Docker image pulled successfully');

        // Cleanup old container
        cleanupContainer();

        // Build environment variables
        const envVars = buildDockerEnvVars();

        // Run container
        log.step('Starting WASI-MD V7 container...');
        console.log('');

        const dockerCmd = `docker run -d --name ${CONFIG.CONTAINER_NAME} --restart unless-stopped ${envVars} -v wasi_session:/app/session ${CONFIG.DOCKER_IMAGE}`;

        try {
            execSync(dockerCmd, { stdio: 'inherit' });
            log.success('Container started successfully!');

            // Show logs
            console.log('');
            log.info('Showing container logs (Ctrl+C to exit):');
            console.log('');

            const logsProcess = spawn('docker', ['logs', '-f', CONFIG.CONTAINER_NAME], {
                stdio: 'inherit'
            });

            // Handle graceful shutdown
            process.on('SIGTERM', () => {
                logsProcess.kill();
            });

            process.on('SIGINT', () => {
                logsProcess.kill();
                process.exit(0);
            });

        } catch (error) {
            log.error(`Failed to start container: ${error.message}`);
            process.exit(1);
        }

    } else {
        // Fallback to GitLab clone method
        if (isHeroku) {
            log.info('📦 Heroku GitLab mode (optimized for Heroku dynos)');
        } else {
            log.info('📦 GitLab clone mode enabled');
        }
        console.log('');

        const token = process.env.GITLAB_TOKEN;
        if (!token) {
            log.error('GITLAB_TOKEN environment variable is not set!');
            console.log('');
            if (isHeroku) {
                log.info('💡 RECOMMENDED FOR HEROKU:');
                log.info('   You are likely using the Node.js buildpack.');
                log.info('   To use Docker instead (recommended), run this command:');
                console.log('   \x1b[33mheroku stack:set container -a your-app-name\x1b[0m');
                log.info('   Then redeploy your app.');
                console.log('');
            }
            console.log('   Otherwise, GitLab mode requires a Personal Access Token.');
            console.log('');
            console.log('   📋 How to get your token:');
            console.log('   1. Go to: https://gitlab.com/-/profile/personal_access_tokens');
            console.log('   2. Create token with "read_repository" scope');
            console.log('   3. Copy the token');
            console.log('');
            if (isHeroku) {
                console.log('   🟣 Set on Heroku:');
                console.log('   heroku config:set GITLAB_TOKEN=glpat-xxxxxxxxxxxx');
            } else {
                console.log('   Set environment variable:');
                console.log('   export GITLAB_TOKEN=glpat-xxxxxxxxxxxx');
            }
            console.log('');
            process.exit(1);
        }

        const TARGET_DIR = path.join(__dirname, 'core');
        const REPO = 'itxxwasi-group/WASI-MD-V7';
        const BRANCH = process.env.BRANCH || 'master';

        // Mask token in logs
        const maskedToken = token.substring(0, 4) + '*'.repeat(token.length - 8) + token.substring(token.length - 4);
        log.info(`Token detected: ${maskedToken}`);
        log.info(`Target branch: ${BRANCH}`);
        console.log('');

        // Clean existing installation
        if (fs.existsSync(TARGET_DIR)) {
            log.step('Cleaning existing installation...');
            try {
                fs.rmSync(TARGET_DIR, { recursive: true, force: true });
                log.success('Old installation removed');
            } catch (err) {
                log.warn(`Could not fully clean: ${err.message}`);
            }
        }

        // Construct authenticated URL
        const authUrl = `https://oauth2:${token}@gitlab.com/${REPO}.git`;

        // Clone repository
        log.step('Fetching WASI-MD V7 from private repository...');
        const cloneSuccess = await cloneWithRetry(authUrl);

        if (!cloneSuccess) {
            log.error('Failed to clone repository after multiple attempts!');
            console.log('');
            console.log('   Possible issues:');
            console.log('   • Invalid or expired GITLAB_TOKEN');
            console.log('   • Token lacks read_repository permission');
            console.log('   • Network connectivity issues');
            console.log('   • Repository does not exist or was moved');
            console.log('');
            if (isHeroku) {
                console.log('   🟣 Verify your Heroku config:');
                console.log('   heroku config:get GITLAB_TOKEN');
                console.log('');
            }
            process.exit(1);
        }

        log.success('Repository cloned successfully');

        // Remove .git directory (security + space)
        const gitDir = path.join(TARGET_DIR, '.git');
        if (fs.existsSync(gitDir)) {
            log.step('Securing installation...');
            fs.rmSync(gitDir, { recursive: true, force: true });
            log.success('Git history removed');
        }

        // Install dependencies
        const corePkgPath = path.join(TARGET_DIR, 'package.json');
        if (fs.existsSync(corePkgPath)) {
            log.step('Installing core dependencies...');
            console.log('');

            try {
                execSync('npm install --production --legacy-peer-deps', {
                    cwd: TARGET_DIR,
                    stdio: 'inherit',
                    timeout: 300000 // 5 minute timeout
                });
                console.log('');
                log.success('Dependencies installed');
            } catch (err) {
                log.warn('Some dependencies may have failed. Bot might still work.');
            }
        }
    }

    // Final status
    console.log('');
    console.log('\x1b[32m═══════════════════════════════════════════════════════════════\x1b[0m');
    console.log('\x1b[32m   ✅ WASI-MD V7 LOADED SUCCESSFULLY!\x1b[0m');
    console.log('\x1b[32m═══════════════════════════════════════════════════════════════\x1b[0m');
    console.log('');
}

// Error handling
process.on('unhandledRejection', (err) => {
    log.error(`Unhandled error: ${err.message}`);
    process.exit(1);
});

// Run loader
loader().catch(err => {
    log.error(`Fatal error: ${err.message}`);
    process.exit(1);
});
