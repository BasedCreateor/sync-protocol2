/**
 * ============================================================================
 * ARCHITECTURAL INSTRUCTION: GLOBAL VARIABLES & STATE INITIALIZATION
 * ============================================================================
 * WHY: A Single Source of Truth (SSOT) prevents data desynchronization across 
 * different views (e.g., spending tokens in the shop must reflect instantly in 
 * the HUD). 
 * HOW: We define a global `AppState` object that holds all dynamic user data. 
 * Any function modifying the user's progress must mutate this object directly 
 * and then trigger `updateHUD()` and `saveState()`.
 */
const AppState = {
    tokens: 50,
    xp: 0,
    level: 1,
    rank: 'E-Tier',
    highScore: 0,
    completedQuests: [],
    ownedItems: [],
    equippedSkin: '#00ff88',
    activeTrack: 'Calisthenics'
};

/**
 * ============================================================================
 * ARCHITECTURAL INSTRUCTION: PERSISTENCE ENGINE
 * ============================================================================
 */

/**
 * Serializes and saves the current AppState to the browser's localStorage.
 * 
 * WHY: Mobile web apps can be killed by the OS aggressively to save memory. 
 * State must be serialized constantly so the user doesn't lose their tokens 
 * or XP upon returning.
 * HOW: Converts the JS Object into a JSON string and stores it under the 
 * unique key 'syncOS_state'.
 */
function saveState() {
    try {
        const serializedState = JSON.stringify(AppState);
        localStorage.setItem('syncOS_state', serializedState);
    } catch (error) {
        console.error("Persistence Engine Error: Failed to save state to localStorage", error);
    }
}

/**
 * Parses and loads the saved AppState from localStorage into memory.
 * 
 * WHY: When the app initializes, we need to restore the user's progression 
 * seamlessly. If it's their first time loading the app, we gracefully fall 
 * back to the default initialized `AppState` values.
 * HOW: Fetches the string via 'syncOS_state'. If it exists, it parses the JSON 
 * and uses Object.assign() to merge it into the global AppState, preserving 
 * any default keys that might have been added in newer app versions.
 */
function loadState() {
    try {
        const savedState = localStorage.getItem('syncOS_state');
        if (savedState) {
            const parsedState = JSON.parse(savedState);
            Object.assign(AppState, parsedState);
        }
    } catch (error) {
        console.error("Persistence Engine Error: Failed to load state from localStorage", error);
    }
}

/**
 * ============================================================================
 * ARCHITECTURAL INSTRUCTION: UI TELEMETRY CONTROLLER
 * ============================================================================
 */

/**
 * Pushes the data from `AppState` into the DOM (HUD elements).
 * 
 * WHY: Isolating DOM manipulation into a single update function prevents UI bugs 
 * where the data changes but the visuals do not. 
 * HOW: Queries the DOM for the telemetry nodes. Updates textContent for numbers/ranks.
 * For the XP progress bar, it calculates the percentage towards the next level (mod 1000)
 * and strictly applies a GPU-accelerated CSS `transform: scaleX()` rather than modifying 
 * CSS width, ensuring smooth 60fps animations.
 */
function updateHUD() {
    // Target DOM Elements
    const tokenDisplay = document.querySelector('.token-balance') || document.querySelector('#token-count');
    const xpValueDisplay = document.querySelector('.xp-value');
    const rankDisplay = document.querySelector('#user-rank');
    const levelDisplay = document.querySelector('.level-indicator');
    const xpBarFill = document.querySelector('#xp-bar-fill');

    // Update Text Values
    if (tokenDisplay) tokenDisplay.textContent = AppState.tokens.toLocaleString();
    if (rankDisplay) rankDisplay.textContent = `Rank: ${AppState.rank}`;
    if (levelDisplay) levelDisplay.textContent = `Lvl.${AppState.level}`;
    
    if (xpValueDisplay) {
        // Assume 1000 XP per level for display formatting
        const currentLevelXp = AppState.xp % 1000;
        xpValueDisplay.textContent = `${currentLevelXp.toLocaleString()} / 1,000 XP`;
    }

    // GPU-Accelerated Progress Bar Update
    if (xpBarFill) {
        const xpProgressPercentage = (AppState.xp % 1000) / 1000;
        // Clamp value between 0.0 and 1.0 just in case
        const safeScaleX = Math.max(0, Math.min(1, xpProgressPercentage));
        xpBarFill.style.transform = `scaleX(${safeScaleX})`;
    }
}

/**
 * ============================================================================
 * ARCHITECTURAL INSTRUCTION: SPA NAVIGATION CONTROLLER
 * ============================================================================
 */

/**
 * Attaches event listeners to the bottom navigation bar to handle view switching.
 * 
 * WHY: As a Single Page Application (SPA), we don't load new HTML files. We just 
 * toggle visibility of <section> elements. We must also manage background tasks 
 * (like stopping the game loop if the user switches away from the Arena) to save 
 * battery life.
 * HOW: Selects all buttons with '.nav-btn'. On click, identifies the target view 
 * from the 'data-target' attribute. Iterates over all view sections and nav buttons 
 * to remove active classes, then adds the active classes to the requested target.
 */
function initNavigationController() {
    const navButtons = document.querySelectorAll('.nav-btn');
    const viewSections = document.querySelectorAll('#viewport > section');

    navButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            // Find the closest button in case the click event fired on the inner SVG icon
            const targetBtn = e.target.closest('.nav-btn');
            if (!targetBtn) return;

            const targetViewId = targetBtn.getAttribute('data-target');
            if (!targetViewId) return;

            // Determine what view we are currently leaving
            let leavingArena = false;
            viewSections.forEach(section => {
                if (section.classList.contains('active-view')) {
                    if (section.id === 'view-arena' && targetViewId !== 'view-arena') {
                        leavingArena = true;
                    }
                }
            });

            // If navigating away from the Arena, halt the game engine to prevent CPU drain
            if (leavingArena) {
                if (typeof stopArenaGame === 'function') {
                    stopArenaGame();
                } else {
                    console.warn("stopArenaGame function is not defined yet.");
                }
            }

            // Remove active classes from all sections
            viewSections.forEach(section => {
                section.classList.remove('active-view');
            });

            // Add active class to the selected section
            const targetSection = document.getElementById(targetViewId);
            if (targetSection) {
                targetSection.classList.add('active-view');
            }

            // Update navigation button visuals
            navButtons.forEach(btn => {
                btn.classList.remove('active-tab', 'active-nav');
            });
            targetBtn.classList.add('active-tab', 'active-nav');
        });
    });
}
/**
 * ============================================================================
 * ARCHITECTURAL INSTRUCTION: ZERO-BACKEND QR SCANNER
 * ============================================================================
 */

/**
 * Processes physical real-world check-ins using URL parameters.
 * 
 * WHY: In a purely client-side or offline-first application, we can use the 
 * browser's native URL structure to simulate QR code scanning. A physical QR 
 * code printed at the campus library would simply contain a deep-link URL: 
 * "https://your-app.edu/?verify=NODE_LIB_01&reward=20". When the student's 
 * phone camera scans it, it opens the app, and this function catches the parameters.
 * 
 * HOW: We utilize the URLSearchParams API to parse the query string.
 * ANTI-CHEAT LOGIC: 
 * 1. Replay Attack Prevention: We check if `AppState.completedQuests` already 
 *    contains the node ID. If yes, we block the transaction.
 * 2. Refresh-Farming Prevention: If a user successfully claims a node, the URL 
 *    still contains the reward parameters. If they hit F5 (refresh), the script 
 *    would run again. To prevent this, we immediately use `history.replaceState()` 
 *    to scrub the URL clean without triggering a page reload.
 */
function processPhysicalNode() {
    // 1. Parse URL parameters safely
    const urlParams = new URLSearchParams(window.location.search);
    const nodeId = urlParams.get('verify');
    const rewardStr = urlParams.get('reward');

    // If no verification parameters exist, exit function silently
    if (!nodeId || !rewardStr) return;

    // 2. Anti-Cheat Check: Has this node already been processed?
    if (AppState.completedQuests.includes(nodeId)) {
        alert(`SECURITY ALERT: Integrity check failed. Node [${nodeId}] has already been verified on this device.`);
        // Proceed to security wipe to clean the URL anyway
    } else {
        // 3. Process Transaction
        const reward = parseInt(rewardStr, 10);
        
        if (!isNaN(reward) && reward > 0) {
            // Apply rewards to state
            AppState.tokens += reward;
            AppState.completedQuests.push(nodeId);
            
            // Persist and update UI
            saveState();
            updateHUD();
            
            alert(`NODE SECURED: Physical location verified. +${reward} Tokens added to balance.`);
            
            // Haptic Feedback: Vibrate pattern (50ms on, 100ms off, 50ms on) for tactile confirmation
            if (navigator.vibrate) {
                navigator.vibrate([50, 100, 50]);
            }
        } else {
            console.error("Verification Error: Invalid reward payload.");
        }
    }

    // 4. Security Wipe: Scrub URL parameters to prevent F5 refresh farming
    // Parameters: state object, title (deprecated), new URL (pathname ignores the query string)
    window.history.replaceState({}, document.title, window.location.pathname);
}

/**
 * ============================================================================
 * ARCHITECTURAL INSTRUCTION: SYNC SHOP PURCHASING LOGIC
 * ============================================================================
 */

/**
 * Initializes the Token Economy logic for all shop items.
 * 
 * WHY: We need a centralized loop to handle all point-of-sale transactions. 
 * This keeps our HTML clean and delegates state logic to JS.
 * 
 * HOW: Iterates through all `.btn-buy` nodes. Reads the `data-item-id` and 
 * resolves the cost. It then checks the user's wallet (AppState.tokens) against 
 * the price. It handles two flows: Purchasing (deducting funds and granting item) 
 * and Equipping (applying an already-owned cosmetic to the active loadout).
 */
function initShopEconomy() {
    const buyButtons = document.querySelectorAll('.btn-buy');

    buyButtons.forEach(button => {
        // Evaluate initial UI state on load (if previously purchased)
        const itemId = button.getAttribute('data-item-id');
        const isCosmetic = itemId.includes('SKIN') || itemId.includes('VFX');

        if (AppState.ownedItems.includes(itemId)) {
            button.textContent = isCosmetic ? "EQUIP" : "REDEEMED";
            if (isCosmetic && AppState.equippedSkin === itemId) {
                button.textContent = "EQUIPPED";
                button.disabled = true; // Prevent re-equipping the active skin
            }
        }

        // Attach transaction listener
        button.addEventListener('click', (e) => {
            const currentItemId = button.getAttribute('data-item-id');
            const isItemCosmetic = currentItemId.includes('SKIN') || currentItemId.includes('VFX');
            
            // Fallback cost extraction: Check data-cost first, otherwise crawl DOM to find the adjacent price pill
            let costAttr = button.getAttribute('data-cost');
            let cost = 0;
            if (costAttr) {
                cost = parseInt(costAttr, 10);
            } else {
                // DOM Traversal fallback assuming: <div class="price-pill"><span class="price-val">120</span></div>
                const priceNode = button.previousElementSibling.querySelector('.price-val');
                if (priceNode) cost = parseInt(priceNode.textContent.replace(/,/g, ''), 10);
            }

            const isOwned = AppState.ownedItems.includes(currentItemId);

            // FLOW A: EQUIP CHECK (Item already owned)
            if (isOwned) {
                if (isItemCosmetic) {
                    // Update active skin in state
                    AppState.equippedSkin = currentItemId;
                    saveState();
                    
                    alert(`SYSTEM: Skin [${currentItemId}] successfully injected into loadout.`);
                    
                    // Reset all other cosmetic buttons visually
                    buyButtons.forEach(btn => {
                        const iterId = btn.getAttribute('data-item-id');
                        if (AppState.ownedItems.includes(iterId) && (iterId.includes('SKIN') || iterId.includes('VFX'))) {
                            btn.textContent = "EQUIP";
                            btn.disabled = false;
                        }
                    });
                    
                    // Lock this specific button
                    button.textContent = "EQUIPPED";
                    button.disabled = true;
                } else {
                    alert("This real-world yield has already been claimed. View your vouchers in the dashboard.");
                }
                return; // Exit listener early
            }

            // FLOW B: PURCHASE CHECK (Item not owned)
            if (AppState.tokens >= cost) {
                // Deduct tokens
                AppState.tokens -= cost;
                
                // Add to inventory
                AppState.ownedItems.push(currentItemId);
                
                // Update Button Visuals based on item type
                button.textContent = isItemCosmetic ? "EQUIP" : "REDEEMED";
                
                // Commit to persistence and UI
                saveState();
                updateHUD();
                
                // Provide haptic feedback for purchase
                if (navigator.vibrate) navigator.vibrate(50);
            } else {
                // Deny transaction
                alert(`INSUFFICIENT FUNDS. You need ${cost - AppState.tokens} more Sync Tokens. Complete Nodes to earn currency.`);
                // Visual rejection: shake the button via CSS class toggle
                button.classList.add('error-shake');
                setTimeout(() => button.classList.remove('error-shake'), 400);
            }
        });
    });
}
/**
 * ============================================================================
 * ARCHITECTURAL INSTRUCTION: CYBER-TRIALS ANTI-CHEAT ENGINE
 * ============================================================================
 */

// Global Test State Variables
let activeTestTimer = null;
let isTestActive = false;
let currentActiveTrialElement = null; // Keeps track of the DOM node for UI resets

/**
 * Initializes the high-stakes examination environment.
 * 
 * WHY: Academic and operational integrity requires strict controls. If a user 
 * is taking a timed test, they cannot be allowed to Google the answers.
 * 
 * HOW: We implement the Page Visibility API. By listening to the 'visibilitychange' 
 * event on the document, we can instantly detect if the user switches tabs, minimizes 
 * the mobile browser, or locks their phone screen. 
 */
function initCyberTrials() {
    
    // 1. Attach the Visibility API Listener
    document.addEventListener('visibilitychange', () => {
        // document.hidden returns true if the page is not in the foreground
        if (document.hidden && isTestActive) {
            // Immediate Forfeiture Protocol
            clearInterval(activeTestTimer);
            isTestActive = false;
            
            // Deduct Integrity Penalty
            AppState.tokens -= 10;
            saveState();
            updateHUD();
            
            // Trigger the anti-cheat modal UI
            const antiCheatModal = document.getElementById('anti-cheat-modal');
            if (antiCheatModal) {
                antiCheatModal.classList.remove('modal-hidden');
            } else {
                alert("PROTOCOL BREACH DETECTED: You switched tabs during an active trial. The trial is failed and 10 Tokens have been deducted.");
            }
            
            // Reset the trial UI
            resetTrialUI(currentActiveTrialElement);
        }
    });

    // 2. Setup Trial Interaction Listeners
    const trialCards = document.querySelectorAll('.trial-card');
    
    trialCards.forEach(trial => {
        // Fallback selectors to match the HTML structure
        const startBtn = trial.querySelector('.lock-btn') || trial.querySelector('.btn-start-trial');
        const submitBtn = trial.querySelector('.submit-btn') || trial.querySelector('.btn-submit-trial');
        const timerFill = trial.querySelector('.timer-fill');
        const radioInputs = trial.querySelectorAll('input[type="radio"]');
        
        // Extract parameters from HTML attributes
        const duration = parseInt(trial.getAttribute('data-duration') || '30', 10);
        // Cost is inside the lock-btn text or extracted here (assume 10 for safety if parsing fails)
        const costMatch = startBtn.textContent.match(/\d+/);
        const entryCost = costMatch ? parseInt(costMatch[0], 10) : 10;
        // Reward from pill
        const rewardNode = trial.querySelector('.pill-reward');
        const rewardMatch = rewardNode ? rewardNode.textContent.match(/\d+/) : [50];
        const reward = parseInt(rewardMatch[0], 10);

        // START TEST LOGIC
        startBtn.addEventListener('click', () => {
            if (isTestActive) {
                alert("A trial is already in progress. Complete or abort it first.");
                return;
            }

            if (AppState.tokens < entryCost) {
                alert(`INSUFFICIENT CLEARANCE: You need ${entryCost} Tokens to initiate this trial.`);
                return;
            }

            // Deduct entry fee
            AppState.tokens -= entryCost;
            updateHUD();
            saveState();

            // Setup state
            isTestActive = true;
            currentActiveTrialElement = trial;
            
            // UI State Flip: Hide start button, show submit button, enable inputs
            startBtn.classList.add('hidden');
            submitBtn.classList.remove('hidden');
            radioInputs.forEach(input => input.disabled = false);

            // Timer Engine
            let timeRemaining = duration;
            // Ensure timer starts full
            if (timerFill) timerFill.style.transform = `scaleX(1)`;

            activeTestTimer = setInterval(() => {
                timeRemaining -= 1;
                
                // Calculate scaleX value (0.0 to 1.0)
                const scaleValue = Math.max(0, timeRemaining / duration);
                
                // STRICT GPU MOTION
                if (timerFill) {
                    timerFill.style.transform = `scaleX(${scaleValue})`;
                }

                // Time Up Logic
                if (timeRemaining <= 0) {
                    clearInterval(activeTestTimer);
                    endTrial(trial, radioInputs, reward, false); // False = forced timeout
                }
            }, 1000);
        });

        // SUBMIT TEST LOGIC
        submitBtn.addEventListener('click', (e) => {
            e.preventDefault(); // Prevent form submission page reload
            if (!isTestActive) return;
            
            clearInterval(activeTestTimer);
            endTrial(trial, radioInputs, reward, true); // True = manual submission
        });
    });
}

/**
 * Helper function to evaluate the trial, apply rewards, and reset the DOM.
 */
function endTrial(trialElement, radioInputs, reward, isManualSubmit) {
    isTestActive = false;
    currentActiveTrialElement = null;
    
    // Evaluate answer: for the prototype, 'B' is assumed correct across modules
    let selectedAnswer = null;
    radioInputs.forEach(input => {
        if (input.checked) selectedAnswer = input.value;
    });

    if (!selectedAnswer && isManualSubmit) {
        alert("ANALYSIS FAILED: No vector identified. Trial failed.");
    } else if (!selectedAnswer && !isManualSubmit) {
        alert("TIME EXPIRED: Connection to target lost. Trial failed.");
    } else if (selectedAnswer === 'B') {
        // Success criteria met
        alert(`ANALYSIS VERIFIED: Target correctly identified. +${reward} Tokens awarded.`);
        AppState.tokens += reward;
        AppState.xp += 150; // Bonus XP for passing
        saveState();
        updateHUD();
    } else {
        alert("ANALYSIS INCORRECT: Your evaluation was flawed. Target evaded detection.");
    }

    resetTrialUI(trialElement);
}

/**
 * Resets a trial card back to its locked, initial state.
 */
function resetTrialUI(trialElement) {
    if (!trialElement) return;
    
    const startBtn = trialElement.querySelector('.lock-btn') || trialElement.querySelector('.btn-start-trial');
    const submitBtn = trialElement.querySelector('.submit-btn') || trialElement.querySelector('.btn-submit-trial');
    const timerFill = trialElement.querySelector('.timer-fill');
    const radioInputs = trialElement.querySelectorAll('input[type="radio"]');

    // Restore UI elements
    if (startBtn) startBtn.classList.remove('hidden');
    if (submitBtn) submitBtn.classList.add('hidden');
    if (timerFill) timerFill.style.transform = `scaleX(1)`;
    
    // Lock and uncheck inputs
    radioInputs.forEach(input => {
        input.disabled = true;
        input.checked = false;
    });
}

/**
 * ============================================================================
 * ARCHITECTURAL INSTRUCTION: NEURAL FEED INTERACTIVITY
 * ============================================================================
 */

/**
 * Initializes engagement mechanics for the vertical short-form feed.
 * 
 * WHY: Infinite scroll feeds require immediate visual feedback to remain engaging. 
 * Waiting for a server round-trip to highlight a "Like" button feels sluggish.
 * 
 * HOW: We attach listeners to the interaction dock buttons. When clicked, we 
 * toggle a CSS class (e.g., changing the SVG stroke to a filled color) and 
 * perform a local string parse to increment the display count instantly.
 */
function initNeuralFeed() {
    const likeButtons = document.querySelectorAll('.dock-btn.btn-like');
    const bookmarkButtons = document.querySelectorAll('.dock-btn.btn-bookmark');

    // Utility function to increment formatted strings (e.g., "45.2k" -> "45.3k", "1,204" -> "1,205")
    const incrementCountString = (currentString) => {
        if (currentString.includes('k')) {
            const num = parseFloat(currentString.replace('k', ''));
            // Increment by 0.1k for large numbers
            return (num + 0.1).toFixed(1) + 'k';
        } else {
            const num = parseInt(currentString.replace(/,/g, ''), 10);
            return (num + 1).toLocaleString();
        }
    };

    const decrementCountString = (currentString) => {
        if (currentString.includes('k')) {
            const num = parseFloat(currentString.replace('k', ''));
            return (num - 0.1).toFixed(1) + 'k';
        } else {
            const num = parseInt(currentString.replace(/,/g, ''), 10);
            return (num - 1).toLocaleString();
        }
    };

    // Attach Like Logic
    likeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const countSpan = btn.querySelector('.dock-count');
            const icon = btn.querySelector('.dock-icon');
            
            // Toggle active state
            const isActive = btn.classList.toggle('active-like');
            
            if (isActive) {
                // Apply inline styles for prototype visual feedback
                icon.style.fill = 'var(--neon-pink)';
                icon.style.stroke = 'var(--neon-pink)';
                if (countSpan) countSpan.textContent = incrementCountString(countSpan.textContent);
            } else {
                icon.style.fill = 'none';
                icon.style.stroke = 'currentColor';
                if (countSpan) countSpan.textContent = decrementCountString(countSpan.textContent);
            }
        });
    });

    // Attach Bookmark Logic
    bookmarkButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const countSpan = btn.querySelector('.dock-count');
            const icon = btn.querySelector('.dock-icon');
            
            const isActive = btn.classList.toggle('active-bookmark');
            
            if (isActive) {
                icon.style.fill = 'var(--accent-gold)';
                icon.style.stroke = 'var(--accent-gold)';
                if (countSpan) countSpan.textContent = incrementCountString(countSpan.textContent);
            } else {
                icon.style.fill = 'none';
                icon.style.stroke = 'currentColor';
                if (countSpan) countSpan.textContent = decrementCountString(countSpan.textContent);
            }
        });
    });
}

/**
 * ============================================================================
 * ARCHITECTURAL INSTRUCTION: PASSWORD ENTROPY SHIELD CALCULATOR
 * ============================================================================
 */

/**
 * Calculates mathematical entropy of a string to generate gameplay shielding.
 * 
 * WHY: Gamifying cybersecurity concepts teaches users practically. Password 
 * strength isn't arbitrary; it is based on Shannon Entropy: H = L * log2(N).
 * L is the length of the string, and N is the character pool size.
 * 
 * HOW: We evaluate the character pool (lowercase = 26, uppercase = 26, 
 * numbers = 10, symbols = 32). We multiply the string length by the base-2 
 * logarithm of the active pool. We then map the resulting bits (typically 
 * 0 to 128 for a good password) to a 10 to 100 percentage scale.
 * 
 * @param {string} password - The user's input string.
 * @returns {number} An integer between 10 (weak baseline) and 100 (maximum).
 */
function calculateShieldEntropy(password) {
    if (!password || password.length === 0) return 10;

    let poolSize = 0;
    
    // Evaluate character pool diversity
    if (/[a-z]/.test(password)) poolSize += 26;
    if (/[A-Z]/.test(password)) poolSize += 26;
    if (/[0-9]/.test(password)) poolSize += 10;
    if (/[^a-zA-Z0-9]/.test(password)) poolSize += 32;

    // If somehow pool is 0, default to baseline
    if (poolSize === 0) return 10;

    // Calculate actual cryptographic entropy in bits
    const entropyBits = password.length * Math.log2(poolSize);

    // Map 128 bits (military-grade) to our 100% cap.
    // Ensure we return an integer between 10 and 100.
    const rawPercentage = Math.floor((entropyBits / 128) * 100);
    const finalStrength = Math.max(10, Math.min(100, rawPercentage));

    return finalStrength;
}

/**
 * ============================================================================
 * ARCHITECTURAL INSTRUCTION: 2D GAME STATE & INPUT VARIABLES
 * ============================================================================
 * 
 * CANVAS DIMENSIONING & SCALING:
 * The `<canvas>` HTML element has intrinsic rendering dimensions set in the 
 * HTML attributes (width="360" height="460"). CSS `width: 100%` scales this 
 * box visually to fit the device. 
 * 
 * By keeping the intrinsic coordinates hardcoded (360x460), all of our 
 * game logic, collision math, and rendering can assume a fixed grid. 
 * A player at x: 180 is ALWAYS in the horizontal center, regardless of 
 * whether they are on an iPhone mini or a 4K desktop monitor.
 */

const canvas = document.getElementById('game-canvas');
const ctx = canvas ? canvas.getContext('2d') : null;

// Game Loop Flags
let animationFrameId = null;
let gameActive = false;
let score = 0;

// Input State Tracking
const keys = {
    up: false,
    down: false,
    left: false,
    right: false,
    shoot: false
};

// Entities
const player = {
    x: 180, // Start centered horizontally (360 / 2)
    y: 230, // Start centered vertically (460 / 2)
    width: 20,
    height: 20,
    speed: 4,
    hp: 100,
    shield: 0,
    color: '#00ffcc', // Will be overridden by AppState.equippedSkin
    vx: 0,
    vy: 0
};

const projectiles = [];
const threats = [];

/**
 * ============================================================================
 * ARCHITECTURAL INSTRUCTION: ARENA INITIALIZATION & PRE-FLIGHT
 * ============================================================================
 */

/**
 * Binds the pre-flight loadout modal to the game state.
 * 
 * WHY: The user must configure their defensive parameters before the game loop 
 * starts. This function bridges the DOM inputs to the Canvas variables.
 */
function initArena() {
    const pwdInput = document.getElementById('shield-password-input') || document.getElementById('field-shield-password');
    const startBtn = document.getElementById('btn-start-game');
    const modal = document.getElementById('arena-preflight-modal');
    const shieldOutput = document.getElementById('calculated-shield-hp');
    const bitsOutput = document.getElementById('calculated-bits');

    // 1. Real-Time Entropy Feedback
    if (pwdInput) {
        pwdInput.addEventListener('input', (e) => {
            const currentPassword = e.target.value;
            const entropyScore = calculateShieldEntropy(currentPassword);
            
            // Map the 10-100 score to the 1,280 max HP cap defined in the HTML
            const maxShieldCapacity = 1280;
            const generatedHp = Math.floor((entropyScore / 100) * maxShieldCapacity);
            
            // Update UI readouts
            if (shieldOutput) shieldOutput.textContent = generatedHp;
            if (bitsOutput) {
                // Approximate bits display for the UI
                const pool = (/[^a-zA-Z0-9]/.test(currentPassword) ? 94 : 62);
                bitsOutput.textContent = Math.floor(currentPassword.length * Math.log2(pool || 1));
            }
            
            // Enable deployment if input is provided
            if (startBtn) {
                startBtn.disabled = currentPassword.length === 0;
            }
        });
    }

    // 2. Launch Sequence
    if (startBtn) {
        startBtn.addEventListener('click', () => {
            const entryCost = parseInt(startBtn.getAttribute('data-cost') || '10', 10);
            
            if (AppState.tokens < entryCost) {
                alert(`INSUFFICIENT FUNDS: Deploying requires ${entryCost} Tokens.`);
                return;
            }

            // Deduct economy and update HUD
            AppState.tokens -= entryCost;
            saveState();
            updateHUD();

            // Configure Player Entity
            const finalPwd = pwdInput ? pwdInput.value : '';
            const entropyScore = calculateShieldEntropy(finalPwd);
            player.shield = Math.floor((entropyScore / 100) * 1280);
            
            // Load custom cosmetic from AppState (fallback to green)
            player.color = AppState.equippedSkin || '#00ffcc';
            
            // Reset base stats
            player.hp = 100;
            player.x = 180;
            player.y = 230;
            projectiles.length = 0;
            threats.length = 0;
            score = 0;

            // Hide the configuration modal
            if (modal) {
                modal.classList.add('modal-hidden');
            }

            // Haptic drop confirmation
            if (navigator.vibrate) navigator.vibrate([100, 50, 100]);

            // Hand off execution to the game engine
            if (typeof startArenaGame === 'function') {
                startArenaGame();
            }
        });
    }

    /**
     * ------------------------------------------------------------------------
     * INPUT HANDLING: KEYBOARD (Desktop Testing)
     * ------------------------------------------------------------------------
     */
    window.addEventListener('keydown', (e) => {
        // Prevent default scrolling for game keys
        if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
            e.preventDefault();
        }
        if (e.key === 'ArrowUp' || e.key === 'w') keys.up = true;
        if (e.key === 'ArrowDown' || e.key === 's') keys.down = true;
        if (e.key === 'ArrowLeft' || e.key === 'a') keys.left = true;
        if (e.key === 'ArrowRight' || e.key === 'd') keys.right = true;
        if (e.key === ' ') keys.shoot = true;
    });

    window.addEventListener('keyup', (e) => {
        if (e.key === 'ArrowUp' || e.key === 'w') keys.up = false;
        if (e.key === 'ArrowDown' || e.key === 's') keys.down = false;
        if (e.key === 'ArrowLeft' || e.key === 'a') keys.left = false;
        if (e.key === 'ArrowRight' || e.key === 'd') keys.right = false;
        if (e.key === ' ') keys.shoot = false;
    });

    /**
     * ------------------------------------------------------------------------
     * INPUT HANDLING: TOUCH TRACKING (Mobile Primary)
     * ------------------------------------------------------------------------
     * HOW SCALING WORKS: The browser fires touch events using screen coordinates 
     * (clientX, clientY). Because our Canvas is CSS-scaled, we must divide by 
     * the scale factor to map physical screen pixels back to our internal 360x460 grid.
     */
    if (canvas) {
        const handleTouch = (e) => {
            e.preventDefault(); // Stop page scrolling
            if (!gameActive) return;

            const rect = canvas.getBoundingClientRect();
            // Calculate scale ratio between internal bounds and visual CSS size
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;

            const touch = e.touches[0];
            const touchX = (touch.clientX - rect.left) * scaleX;
            const touchY = (touch.clientY - rect.top) * scaleY;

            // Direct mapping: Calculate vector from player to touch point
            const dx = touchX - player.x;
            const dy = touchY - player.y;
            const distance = Math.hypot(dx, dy);

            // Normalize vector and apply speed if distance is significant to avoid jitter
            if (distance > 5) {
                player.vx = (dx / distance) * player.speed;
                player.vy = (dy / distance) * player.speed;
            } else {
                player.vx = 0;
                player.vy = 0;
            }
        };

        canvas.addEventListener('touchstart', handleTouch, { passive: false });
        canvas.addEventListener('touchmove', handleTouch, { passive: false });
        
        // Halt velocity when finger lifts
        canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            player.vx = 0;
            player.vy = 0;
        }, { passive: false });
    }
}
/**
 * ============================================================================
 * ARCHITECTURAL INSTRUCTION: ENTITY MANAGEMENT & MECHANICS
 * ============================================================================
 */

let lastShootTime = 0;
let frameCounter = 0;
const SHOOT_COOLDOWN = 250; // Milliseconds between projectile shots

/**
 * Generates and drops entities from the top of the arena.
 * 
 * WHY: We need a steady stream of targets to simulate a high-stress environment.
 * HOW: Randomly decides between a 'Malicious' (Red) packet that must be destroyed,
 * or a 'Safe' (Cyan) packet that must be allowed to pass.
 */
function spawnThreat() {
    // Determine type: 70% chance Malicious, 30% chance Safe
    const isMalicious = Math.random() > 0.3;
    const threatSize = 20;
    
    threats.push({
        x: Math.random() * (canvas.width - threatSize), // Keep within horizontal bounds
        y: -threatSize, // Start slightly off-screen top
        width: threatSize,
        height: threatSize,
        speed: 2 + Math.random() * 2, // Varied falling speed (2 to 4 px per frame)
        type: isMalicious ? 'malicious' : 'safe',
        color: isMalicious ? '#ff3366' : '#00ccff'
    });
}

/**
 * Fires a data blast upward from the player's current coordinates.
 * 
 * WHY: The player needs an offensive mechanism to clear malicious threats.
 * HOW: Creates a projectile object matching the player's center X position 
 * and pushes it to the active projectiles array for engine iteration.
 */
function fireProjectile() {
    const now = Date.now();
    if (now - lastShootTime < SHOOT_COOLDOWN) return; // Prevent infinite laser spam
    
    lastShootTime = now;
    
    projectiles.push({
        x: player.x + (player.width / 2) - 2, // Center the 4px wide projectile
        y: player.y,
        width: 4,
        height: 12,
        speed: 8,
        color: '#ffaa00' // Accent gold color for lasers
    });
    
    // Haptic feedback for firing
    if (navigator.vibrate) navigator.vibrate(20);
}

/**
 * Calculates damage absorption logic, bleeding through shield into base HP.
 */
function applyDamage(amount) {
    if (player.shield > 0) {
        player.shield -= amount;
        // If shield breaks and goes negative, apply remaining damage to HP
        if (player.shield < 0) {
            player.hp += player.shield; 
            player.shield = 0;
        }
    } else {
        player.hp -= amount;
    }

    // Trigger visual hit distortion on canvas (optional effect, simplified here)
    if (navigator.vibrate) navigator.vibrate(100);

    // Check terminal state
    if (player.hp <= 0) {
        stopArenaGame();
    }
}

/**
 * ============================================================================
 * ARCHITECTURAL INSTRUCTION: THE 60FPS GAME LOOP
 * ============================================================================
 */

/**
 * Kicks off the internal game engine. Called by the Pre-Flight modal.
 */
function startArenaGame() {
    if (gameActive) return;
    gameActive = true;
    frameCounter = 0;
    
    // Ensure the Canvas Context is available
    if (!ctx) {
        console.error("Canvas context missing. Cannot start game.");
        return;
    }
    
    // Start recursive loop
    gameLoop();
}

/**
 * The core engine cycle.
 * 
 * WHY: requestAnimationFrame synchronizes our loop with the display's refresh 
 * rate (typically 60hz), providing buttery smooth motion without battery drain 
 * associated with setInterval.
 * 
 * AXIS-ALIGNED BOUNDING BOX (AABB) COLLISION EXPLANATION:
 * AABB is the most performant way to detect 2D rectangle overlap. 
 * Two rectangles (RectA and RectB) intersect IF AND ONLY IF all four of these 
 * boundary conditions are met simultaneously:
 * 1. RectA's Left edge is further left than RectB's Right edge  (rect1.x < rect2.x + rect2.width)
 * 2. RectA's Right edge is further right than RectB's Left edge (rect1.x + rect1.width > rect2.x)
 * 3. RectA's Top edge is higher than RectB's Bottom edge        (rect1.y < rect2.y + rect2.height)
 * 4. RectA's Bottom edge is lower than RectB's Top edge         (rect1.y + rect1.height > rect2.y)
 * If any condition fails, a gap exists between them.
 */
function gameLoop() {
    if (!gameActive) return;

    // Queue next frame immediately
    animationFrameId = requestAnimationFrame(gameLoop);
    frameCounter++;

    // 1. CLEAR CANVAS & DRAW BACKGROUND GRID
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Grid styling is handled by CSS, so we just let the transparent canvas sit on top

    // 2. PLAYER INPUT & MOVEMENT
    // If desktop keys are active, override touch velocity
    if (keys.left) player.vx = -player.speed;
    else if (keys.right) player.vx = player.speed;
    else if (!keys.left && !keys.right && player.vx !== 0) {
        // Simple friction for keyboard (touch resets vx to 0 on touchend)
        player.vx *= 0.8; 
    }

    if (keys.up) player.vy = -player.speed;
    else if (keys.down) player.vy = player.speed;
    else if (!keys.up && !keys.down && player.vy !== 0) {
        player.vy *= 0.8;
    }

    if (keys.shoot) fireProjectile();

    // Apply Velocity
    player.x += player.vx;
    player.y += player.vy;

    // Boundary Enforcement (Clamp player to canvas edges)
    if (player.x < 0) player.x = 0;
    if (player.x + player.width > canvas.width) player.x = canvas.width - player.width;
    if (player.y < 0) player.y = 0;
    if (player.y + player.height > canvas.height) player.y = canvas.height - player.height;

    // Draw Player
    ctx.fillStyle = player.color;
    ctx.fillRect(player.x, player.y, player.width, player.height);
    // Draw visual glow
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(player.x, player.y, player.width, player.height);

    // 3. SPAWN ENTITIES (Every 45 frames ~ 0.75 seconds)
    if (frameCounter % 45 === 0) {
        spawnThreat();
    }

    // 4. UPDATE & DRAW PROJECTILES
    for (let i = projectiles.length - 1; i >= 0; i--) {
        let p = projectiles[i];
        p.y -= p.speed; // Move up

        // Remove if off-screen
        if (p.y + p.height < 0) {
            projectiles.splice(i, 1);
            continue;
        }

        // Draw projectile
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.width, p.height);
    }

    // 5. UPDATE, DRAW THREATS & RESOLVE COLLISIONS
    for (let i = threats.length - 1; i >= 0; i--) {
        let t = threats[i];
        t.y += t.speed; // Fall down

        // Draw Threat
        ctx.fillStyle = t.color;
        ctx.fillRect(t.x, t.y, t.width, t.height);

        // GROUND COLLISION LOGIC
        if (t.y > canvas.height) {
            if (t.type === 'malicious') {
                // Punishment for letting a malicious packet breach the firewall
                applyDamage(25);
            }
            threats.splice(i, 1);
            continue;
        }

        // PROJECTILE VS THREAT COLLISION (AABB)
        let threatDestroyed = false;
        for (let j = projectiles.length - 1; j >= 0; j--) {
            let p = projectiles[j];

            // AABB Check
            if (p.x < t.x + t.width &&
                p.x + p.width > t.x &&
                p.y < t.y + t.height &&
                p.height + p.y > t.y) {
                
                // Collision Confirmed
                projectiles.splice(j, 1); // Destroy projectile
                threatDestroyed = true;

                if (t.type === 'malicious') {
                    score += 10; // Reward
                } else if (t.type === 'safe') {
                    applyDamage(20); // Punishment for intercepting safe traffic
                }
                break; // Stop checking projectiles for this threat
            }
        }

        if (threatDestroyed) {
            threats.splice(i, 1);
            continue;
        }

        // PLAYER VS THREAT COLLISION (AABB)
        if (player.x < t.x + t.width &&
            player.x + player.width > t.x &&
            player.y < t.y + t.height &&
            player.height + player.y > t.y) {
            
            threats.splice(i, 1);
            if (t.type === 'malicious') {
                applyDamage(30); // Heavy damage for body-slamming a virus
            } else {
                score += 5; // Small bonus for collecting safe traffic manually
            }
        }
    }

    // 6. UI TELEMETRY SYNC
    // Strict GPU UI Updates: Map dynamic values to a 0.0 - 1.0 float and apply via scaleX
    const hpTrack = document.getElementById('player-hp-fill');
    const shieldTrack = document.getElementById('player-shield-fill');
    
    if (hpTrack) {
        const hpScale = Math.max(0, player.hp / 100);
        hpTrack.style.transform = `scaleX(${hpScale})`;
    }
    
    if (shieldTrack) {
        // Max theoretical shield from modal calculations is 1280
        const maxShield = 1280; 
        const shieldScale = Math.max(0, player.shield / maxShield);
        shieldTrack.style.transform = `scaleX(${shieldScale})`;
    }
    
    // Draw Score internally on Canvas for immediate feedback
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px "JetBrains Mono", monospace';
    ctx.fillText(`SCORE: ${score}`, 10, 20);
}

/**
 * ============================================================================
 * ARCHITECTURAL INSTRUCTION: GAME OVER & TERMINATION
 * ============================================================================
 */

/**
 * Halts the game engine, evaluates the payload, and restores standard UI.
 * 
 * WHY: This must be called either when the player dies, or if they minimize/switch 
 * away from the Arena view (handled in the Navigation Controller) to prevent CPU 
 * drain and ghost processes.
 */
function stopArenaGame() {
    if (!gameActive) return;
    
    // Halt the requestAnimationFrame loop
    gameActive = false;
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }

    // Calculate Payload (e.g., 5 points = 1 token)
    const tokenYield = Math.floor(score / 5);
    
    // Update Global AppState
    AppState.tokens += tokenYield;
    if (score > AppState.highScore) {
        AppState.highScore = score;
    }
    
    // Commit to memory and DOM
    saveState();
    updateHUD();

    // Alert the user of the session results
    alert(`CRITICAL FAILURE: Firewall breached. \nSession Score: ${score}\nData Yield: +${tokenYield} Tokens.`);

    // Restore the Pre-Flight Modal to allow reconfiguration and restart
    const modal = document.getElementById('arena-preflight-modal');
    if (modal) {
        modal.classList.remove('modal-hidden');
    }
    
    // Reset visual CSS tracks manually for the next potential run
    const hpTrack = document.getElementById('player-hp-fill');
    const shieldTrack = document.getElementById('player-shield-fill');
    if (hpTrack) hpTrack.style.transform = `scaleX(1)`;
    if (shieldTrack) shieldTrack.style.transform = `scaleX(0)`;
}

/**
 * ============================================================================
 * ARCHITECTURAL INSTRUCTION: SYSTEM BOOTSTRAPPING
 * ============================================================================
 */

/**
 * Application Entry Point.
 * 
 * WHY: Using DOMContentLoaded ensures that the HTML tree is completely parsed 
 * and available before our JavaScript attempts to query elements. 
 * HOW: We sequentially execute initialization procedures. Order matters: 
 * State must be loaded before UI is updated. UI must be updated before shops 
 * read DOM elements.
 */
document.addEventListener('DOMContentLoaded', () => {
    try {
        // 1. Initialize Navigation Controller to wire up SPA routing
        if (typeof initNavigationController === 'function') initNavigationController();
        
        // 2. Retrieve persistent data
        loadState();
        
        // 3. Hydrate top-level UI
        updateHUD();
        
        // 4. Resolve pending QR scans (modifies state/HUD if valid)
        processPhysicalNode();
        
        // 5. Initialize specialized views
        initShopEconomy();
        initCyberTrials();
        initNeuralFeed();
        initArena();

        console.log("SYNC PROTOCOL OS // BOOT SEQUENCE COMPLETE.");
    } catch (err) {
        console.error("FATAL ERROR during bootstrap sequence:", err);
    }
});