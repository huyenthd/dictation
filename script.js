// Arrow navigation buttons for mobile
const prevArrowBtn = document.getElementById('prevArrowBtn');
const nextArrowBtn = document.getElementById('nextArrowBtn');

if (prevArrowBtn && nextArrowBtn) {
    prevArrowBtn.addEventListener('click', () => {
        goToPreviousQuestion();
    });
    nextArrowBtn.addEventListener('click', () => {
        goToNextQuestion();
    });
    // Show on mobile only
    function updateArrowVisibility() {
        if (window.innerWidth <= 800) {
            prevArrowBtn.style.display = '';
            nextArrowBtn.style.display = '';
        } else {
            prevArrowBtn.style.display = 'none';
            nextArrowBtn.style.display = 'none';
        }
    }
    window.addEventListener('resize', updateArrowVisibility);
    updateArrowVisibility();
}
// Global variables
let lessons = [];
let currentQuestionIndex = 0;
let score = 0;
let userAnswers = {}; // Store user's answer for each version {versionId: [{word, buttonIndex}]}
let hasCheckedCurrentQuestion = false; // Track if current question has been checked
let activeVersionId = null; // Track which version is currently active
let typingBuffer = ''; // Buffer for typed characters
let typingTimer = null; // Timer for typing timeout
let isInTypingSession = false; // Track if currently in a typing session
let hasMatchedInSession = false; // Track if a match was found in current session
let visitedQuestions = new Set(); // Track which questions have been visited (completed or in progress)
let completedQuestions = {}; // Store completed questions state {questionIndex: {userAnswers, isCorrect, feedback}}

// Load and display version number
fetch('version.json?t=' + Date.now())
    .then(response => response.text())
    .then(version => {
        const versionBadge = document.querySelector('.version-badge');
        if (versionBadge) {
            versionBadge.textContent = 'v' + version.replace(/['\"]+/g, '').trim();
        }
    })
    .catch(err => console.log('Could not load version:', err));

// DOM elements
const fileInput = document.getElementById('fileInput');
const gameArea = document.getElementById('game-area');
const results = document.getElementById('results');
const vietnameseText = document.getElementById('vietnameseText');
const userAnswer = document.getElementById('userAnswer');
const wordButtons = document.getElementById('wordButtons');
const skipBtn = document.getElementById('skipBtn');
const nextBtn = document.getElementById('nextBtn');
const feedback = document.getElementById('feedback');
const questionNumber = document.getElementById('questionNumber');
const scoreDisplay = document.getElementById('score');
const finalScore = document.getElementById('finalScore');
const restartBtn = document.getElementById('restartBtn');
const typingIndicator = document.getElementById('typingIndicator');
const typingText = document.getElementById('typingText');
const helpBtn = document.getElementById('helpBtn');
const helpModal = document.getElementById('helpModal');
const closeModal = document.getElementById('closeModal');
const voiceSelect = document.getElementById('voiceSelect');
const speedSelect = document.getElementById('speedSelect');

// Voice settings
let voices = [];
let selectedVoice = null;
let speechRate = 1; // Default speed

// Load available voices
function loadVoices() {
    voices = window.speechSynthesis.getVoices();
    console.log('Available voices:', voices.map(v => v.name + ' (' + v.lang + ')'));

    // Try to find Samantha/Aaron first
    let filteredVoices = voices.filter(
        v => v.name && (v.name.toLowerCase().includes('samantha') || v.name.toLowerCase().includes('aaron'))
    );

    // If none found, fall back to any English voice
    if (filteredVoices.length === 0) {
        filteredVoices = voices.filter(v => v.lang && v.lang.toLowerCase().startsWith('en'));
    }

    // Remove all old options
    voiceSelect.innerHTML = '';

    if (filteredVoices.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No voices available';
        voiceSelect.appendChild(option);
        voiceSelect.disabled = true;
        return;
    }

    voiceSelect.disabled = false;
    filteredVoices.forEach((voice) => {
        const option = document.createElement('option');
        option.value = voices.indexOf(voice);
        option.textContent = voice.name + ' — ' + voice.lang;
        voiceSelect.appendChild(option);
    });
}

// Load voices when they become available
if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = loadVoices;
}
loadVoices();

// Update selected voice when user changes selection
voiceSelect.addEventListener('change', (e) => {
    const index = e.target.value;
    if (index === 'default') {
        selectedVoice = null;
    } else {
        selectedVoice = voices[parseInt(index)];
    }
    console.log('Selected voice changed:', selectedVoice && selectedVoice.name);
});

// Some mobile browsers don't populate voices until after a user gesture.
// Retry loading voices on first touch/click anywhere.
let voicesRetryBound = false;
function ensureVoicesOnGesture() {
    if (voices.length === 0) {
        loadVoices();
    }
    if (!voicesRetryBound) {
        document.body.removeEventListener('touchstart', ensureVoicesOnGesture);
        document.body.removeEventListener('click', ensureVoicesOnGesture);
        voicesRetryBound = true;
    }
}

document.body.addEventListener('touchstart', ensureVoicesOnGesture, { once: true });
document.body.addEventListener('click', ensureVoicesOnGesture, { once: true });

// Update speech rate when user changes speed
speedSelect.addEventListener('change', (e) => {
    speechRate = parseFloat(e.target.value);
});

// Help modal handlers
helpBtn.addEventListener('click', () => {
    helpModal.classList.remove('hidden');
});

closeModal.addEventListener('click', () => {
    helpModal.classList.add('hidden');
});

// Close modal when clicking outside
helpModal.addEventListener('click', (e) => {
    if (e.target === helpModal) {
        helpModal.classList.add('hidden');
    }
});

// Secret feature: Click graduation cap 5 times to load lessons.txt
const graduationCap = document.getElementById('graduationCap');
let capClickCount = 0;
let capClickTimer = null;

graduationCap.addEventListener('click', () => {
    capClickCount++;
    console.log('Graduation cap clicked:', capClickCount);

    // Reset counter after 2 seconds of inactivity
    clearTimeout(capClickTimer);
    capClickTimer = setTimeout(() => {
        capClickCount = 0;
    }, 2000);

    // Load lessons.txt after 5 clicks
    if (capClickCount === 5) {
        capClickCount = 0;
        console.log('Loading lessons.txt...');
        loadLessonsFile();
    }
});

// Load lessons.txt file
function loadLessonsFile() {
    console.log('Attempting to load lessons: check embedded data first');

    // Try to read embedded lessons data from index.html
    const lessonsElem = document.getElementById('lessonsData');
    if (lessonsElem) {
        const content = lessonsElem.textContent || lessonsElem.innerText;
        if (content && content.trim().length > 0) {
            console.log('Loaded lessons from embedded data');
            parseFileContent(content);
            startGame();
            return;
        }
    }

    // Fallback to XHR if embedded data is not available
    console.log('Embedded lessons not found or empty, falling back to XHR');
    const xhr = new XMLHttpRequest();
    xhr.open('GET', 'lessons.txt', true);

    xhr.onload = function () {
        if (xhr.status === 200) {
            console.log('lessons.txt loaded successfully via XHR');
            parseFileContent(xhr.responseText);
            startGame();
        } else {
            console.error('Error loading lessons.txt:', xhr.status, xhr.statusText);
            alert('Could not load lessons.txt file (Status: ' + xhr.status + ')');
        }
    };

    xhr.onerror = function () {
        console.error('Network error loading lessons.txt');
        alert('Network error: Make sure you are accessing via http://localhost:8000 or http://localhost:8001');
    };

    xhr.send();
}

// Handle file upload
fileInput.addEventListener('change', handleFileUpload);

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        const content = e.target.result;
        parseFileContent(content);
        startGame();
    };
    reader.readAsText(file);
}

// Parse file content
function parseFileContent(content) {
    lessons = [];
    const lines = content.split('\n').map(line => line.trim()).filter(line => line);

    let i = 0;
    while (i < lines.length) {
        const line = lines[i];

        // Check if it's a Vietnamese sentence line (starts with number and dot, e.g.: 1., 2., 3.)
        if (/^\d+\.\s+/.test(line)) {
            const vietnamese = line.replace(/^\d+\.\s+/, '');
            const versions = [];
            let versionCounter = 1;

            i++;
            // Read English versions (lines starting with "-")
            while (i < lines.length && lines[i].startsWith('-')) {
                const versionLine = lines[i];
                const version = parseEnglishVersion(versionLine);
                if (version.length > 0) {
                    versions.push({
                        words: version,
                        versionNumber: versionCounter.toString()
                    });
                    versionCounter++;
                }
                i++;
            }

            if (versions.length > 0) {
                lessons.push({
                    vietnamese: vietnamese,
                    versions: versions
                });
            }
        } else {
            i++;
        }
    }
}

// Parse an English version
function parseEnglishVersion(line) {
    const words = [];
    const matches = line.matchAll(/\[([^\]]+)\]/g);
    for (const match of matches) {
        words.push(match[1]);
    }
    return words;
}

// Start game
function startGame() {
    currentQuestionIndex = 0;
    score = 0;
    visitedQuestions = new Set([0]); // Mark first question as visited
    completedQuestions = {}; // Reset completed questions
    gameArea.classList.remove('hidden');
    results.classList.add('hidden');
    showQuestion();
}

// Show question
function showQuestion() {
    if (currentQuestionIndex >= lessons.length) {
        showResults();
        return;
    }

    const lesson = lessons[currentQuestionIndex];

    // Check if this question was completed before
    const isCompleted = completedQuestions[currentQuestionIndex];

    if (isCompleted) {
        // Restore completed state
        userAnswers = JSON.parse(JSON.stringify(isCompleted.userAnswers)); // Deep copy
        hasCheckedCurrentQuestion = true;

        // Update UI
        vietnameseText.textContent = lesson.vietnamese;
        questionNumber.textContent = `Question ${currentQuestionIndex + 1}/${lessons.length}`;
        scoreDisplay.textContent = `Score: ${score}`;

        // Render all versions with saved answers
        renderAllVersions(lesson);

        // Show completed state
        feedback.textContent = isCompleted.feedback;
        feedback.className = isCompleted.isCorrect ? 'correct' : 'incorrect';
        feedback.classList.remove('hidden');

        // Apply correct/incorrect classes to versions based on saved state
        if (isCompleted.isCorrect) {
            // If completed successfully, all versions are correct
            lesson.versions.forEach((version, index) => {
                const versionId = `${currentQuestionIndex}-${index}`;
                const versionContainer = document.querySelector(`[data-version-id="${versionId}"]`);
                versionContainer.classList.add('correct');
                versionContainer.classList.remove('incorrect');

                // Display full correct sentence
                const successDiv = document.createElement('div');
                successDiv.className = 'success-display';
                successDiv.innerHTML = `✓ <strong>${version.words.join(' ')}</strong>`;
                versionContainer.appendChild(successDiv);
            });
        } else {
            // If not completed successfully (shouldn't happen, but handle it)
            lesson.versions.forEach((version, index) => {
                const versionId = `${currentQuestionIndex}-${index}`;
                const versionContainer = document.querySelector(`[data-version-id="${versionId}"]`);
                const userAnswer = userAnswers[versionId].map(obj => obj.word);
                const isCorrect = checkVersionAnswer(userAnswer, version.words);

                if (isCorrect) {
                    versionContainer.classList.add('correct');
                } else {
                    versionContainer.classList.add('incorrect');
                }
            });
        }

        // Disable all word buttons
        document.querySelectorAll('.word-btn').forEach(btn => {
            btn.disabled = true;
        });

        nextBtn.classList.remove('hidden');

        // Hide skip button for completed questions
        skipBtn.style.display = 'none';
        document.querySelectorAll('.btn-clear-version').forEach(btn => {
            btn.style.display = 'none';
        });
    } else {
        // New or in-progress question
        userAnswers = {}; // Reset answers
        hasCheckedCurrentQuestion = false; // Reset check status for new question

        // Update UI
        vietnameseText.textContent = lesson.vietnamese;
        questionNumber.textContent = `Question ${currentQuestionIndex + 1}/${lessons.length}`;
        scoreDisplay.textContent = `Score: ${score}`;

        // Render all versions
        renderAllVersions(lesson);

        // Reset feedback and buttons
        feedback.classList.add('hidden');
        nextBtn.classList.add('hidden');

        // Show skip button
        skipBtn.style.display = '';
        document.querySelectorAll('.btn-clear-version').forEach(btn => {
            btn.style.display = '';
        });
    }
}

// Render all versions at once
function renderAllVersions(lesson) {
    // Clear old content
    userAnswer.innerHTML = '';
    wordButtons.innerHTML = '';

    lesson.versions.forEach((version, index) => {
        const versionId = `${currentQuestionIndex}-${index}`;
        userAnswers[versionId] = [];

        // Create container for each version
        const versionContainer = document.createElement('div');
        versionContainer.className = 'version-container';
        versionContainer.dataset.versionId = versionId;
        versionContainer.addEventListener('click', () => setActiveVersion(versionId));

        // Version header with clear button
        const versionHeaderRow = document.createElement('div');
        versionHeaderRow.className = 'version-header-row';

        const versionHeader = document.createElement('div');
        versionHeader.className = 'version-header';
        versionHeader.textContent = `Version ${version.versionNumber}`;

        const buttonGroup = document.createElement('div');
        buttonGroup.className = 'version-button-group';

        const audioBtn = document.createElement('button');
        audioBtn.className = 'btn-audio-version';
        audioBtn.innerHTML = '🔊';
        audioBtn.title = 'Listen to correct sentence';
        audioBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            speakSentence(version.words.join(' '));
        });

        const clearVersionBtn = document.createElement('button');
        clearVersionBtn.className = 'btn-clear-version';
        clearVersionBtn.innerHTML = '×';
        clearVersionBtn.title = 'Clear this version';
        clearVersionBtn.addEventListener('click', () => clearVersion(versionId));

        buttonGroup.appendChild(audioBtn);
        buttonGroup.appendChild(clearVersionBtn);

        versionHeaderRow.appendChild(versionHeader);
        versionHeaderRow.appendChild(buttonGroup);
        versionContainer.appendChild(versionHeaderRow);

        // User answer area for this version
        const answerArea = document.createElement('div');
        answerArea.className = 'user-answer version-answer empty';
        answerArea.id = `answer-${versionId}`;
        answerArea.innerHTML = '<span style="color: #999;">Click words to create sentence...</span>';
        versionContainer.appendChild(answerArea);

        // Word buttons for this version
        const wordsArea = document.createElement('div');
        wordsArea.className = 'word-buttons version-words';
        wordsArea.id = `words-${versionId}`;

        const shuffledWords = shuffleArray([...version.words]);
        shuffledWords.forEach((word, wordIndex) => {
            const button = document.createElement('button');
            button.textContent = word;
            button.className = 'word-btn';
            button.dataset.versionId = versionId;
            button.dataset.word = word;
            button.dataset.wordIndex = wordIndex; // Add unique index for each button
            button.addEventListener('click', () => selectWord(word, button, versionId, wordIndex));
            wordsArea.appendChild(button);
        });

        versionContainer.appendChild(wordsArea);
        userAnswer.appendChild(versionContainer);
    });

    // Set first version as active by default
    if (lesson.versions.length > 0) {
        setActiveVersion(`${currentQuestionIndex}-0`);
    }
}

// Set active version
function setActiveVersion(versionId) {
    // Remove active class from all versions
    document.querySelectorAll('.version-container').forEach(container => {
        container.classList.remove('active-version');
    });

    // Add active class to selected version
    const answerArea = document.getElementById(`answer-${versionId}`);
    if (answerArea) {
        const versionContainer = answerArea.parentElement;
        versionContainer.classList.add('active-version');
        activeVersionId = versionId;

        // Scroll to the active version
        setTimeout(() => {
            versionContainer.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });
        }, 50);
    }
}

// Switch to next version (Tab/Enter/Arrow Down functionality)
function switchToNextVersion() {
    if (!activeVersionId) return;

    const lesson = lessons[currentQuestionIndex];
    if (!lesson) return;

    // Parse current version ID
    const [questionIndex, versionIndex] = activeVersionId.split('-').map(Number);

    // Calculate next version index (loop back to 0 if at end)
    const nextVersionIndex = (versionIndex + 1) % lesson.versions.length;
    const nextVersionId = `${questionIndex}-${nextVersionIndex}`;

    setActiveVersion(nextVersionId);
}

// Switch to previous version (Arrow Up functionality)
function switchToPreviousVersion() {
    if (!activeVersionId) return;

    const lesson = lessons[currentQuestionIndex];
    if (!lesson) return;

    // Parse current version ID
    const [questionIndex, versionIndex] = activeVersionId.split('-').map(Number);

    // Calculate previous version index (loop to last if at beginning)
    const prevVersionIndex = (versionIndex - 1 + lesson.versions.length) % lesson.versions.length;
    const prevVersionId = `${questionIndex}-${prevVersionIndex}`;

    setActiveVersion(prevVersionId);
}

// Text-to-speech function
function speakSentence(text) {
    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);

    // Use selected voice if available
    if (selectedVoice) {
        utterance.voice = selectedVoice;
        utterance.lang = selectedVoice.lang;
    } else {
        utterance.lang = 'en-US';
    }

    utterance.rate = speechRate; // Use user-selected speed
    utterance.pitch = 1;
    utterance.volume = 1;

    window.speechSynthesis.speak(utterance);
}

// Go to previous question (Arrow Left functionality)
function goToPreviousQuestion() {
    // Can only go to previous if it's been visited
    if (currentQuestionIndex > 0 && visitedQuestions.has(currentQuestionIndex - 1)) {
        currentQuestionIndex--;
        showQuestion();
    }
}

// Go to next question (Arrow Right functionality)
function goToNextQuestion() {
    // Can only go to next if it's been visited (not beyond current progress)
    if (currentQuestionIndex < lessons.length - 1 && visitedQuestions.has(currentQuestionIndex + 1)) {
        currentQuestionIndex++;
        showQuestion();
    }
}

// Shuffle array
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// Select word
function selectWord(word, button, versionId, wordIndex) {
    if (button.disabled) return;

    userAnswers[versionId].push({ word: word, buttonIndex: wordIndex });
    button.disabled = true;
    renderVersionAnswer(versionId);

    // Don't end typing session immediately after selection
    // Let the timer naturally end the session after 300ms
    // This allows user to continue typing if they want

    // Check if all words in this version are selected
    const wordsArea = document.getElementById(`words-${versionId}`);
    if (wordsArea) {
        const availableButtons = wordsArea.querySelectorAll('.word-btn:not(:disabled)');

        // If no more words available, auto-check if this version is correct
        if (availableButtons.length === 0) {
            // Check if this version is correct
            const lesson = lessons[currentQuestionIndex];
            const [questionIndex, versionIndex] = versionId.split('-').map(Number);
            const version = lesson.versions[versionIndex];

            console.log('Version completed:', versionId);
            if (version) {
                const userAnswerWords = userAnswers[versionId].map(answer => answer.word);
                const correctAnswer = version.words;
                const isCorrect = checkVersionAnswer(userAnswerWords, correctAnswer);

                if (isCorrect) {
                    // Show success display for correct version
                    const versionContainer = document.querySelector(`[data-version-id="${versionId}"]`);

                    if (versionContainer) {
                        // Add correct class to make the container green
                        versionContainer.classList.add('correct');

                        // Remove old success display if exists
                        const oldSuccessDisplay = versionContainer.querySelector('.success-display');
                        if (oldSuccessDisplay) {
                            oldSuccessDisplay.remove();
                        }

                        // Add success display
                        const successDiv = document.createElement('div');
                        successDiv.className = 'success-display';
                        successDiv.innerHTML = `✓ <strong>${correctAnswer.join(' ')}</strong>`;
                        versionContainer.appendChild(successDiv);
                    }
                }
            }

            // Check if all versions are completed and correct
            checkAllVersionsSuccess();

            // Check if this is the last version for auto-switch logic
            const isLastVersion = versionIndex === lesson.versions.length - 1;

            // Only auto-switch if not the last version
            if (!isLastVersion) {
                setTimeout(() => {
                    switchToNextVersion();
                }, 200); // Small delay for smooth UX
            }
        }
    }
}

// Render answer for one version
function renderVersionAnswer(versionId) {
    const answerArea = document.getElementById(`answer-${versionId}`);
    const wordObjects = userAnswers[versionId];
    // Prevent click-to-remove if version is success (correct)
    const versionContainer = document.querySelector(`[data-version-id="${versionId}"]`);
    const isSuccess = versionContainer && versionContainer.classList.contains('correct');

    if (wordObjects.length === 0) {
        answerArea.innerHTML = '<span style="color: #999;">Click words to create sentence...</span>';
        answerArea.classList.add('empty');
    } else {
        answerArea.classList.remove('empty');
        answerArea.innerHTML = '';
        wordObjects.forEach((wordObj, index) => {
            const span = document.createElement('span');
            span.textContent = wordObj.word;
            span.className = 'selected-word';
            if (!isSuccess) {
                span.addEventListener('click', () => removeWord(index, versionId));
            }
            answerArea.appendChild(span);
        });
    }
}

// Remove word
function removeWord(index, versionId) {
    // Prevent removing word if version is success (correct)
    const versionContainer = document.querySelector(`[data-version-id="${versionId}"]`);
    if (versionContainer && versionContainer.classList.contains('correct')) {
        return;
    }

    const removedWordObj = userAnswers[versionId][index];
    userAnswers[versionId].splice(index, 1);

    // Re-enable the specific button using its unique index
    const wordsArea = document.getElementById(`words-${versionId}`);
    const buttons = wordsArea.querySelectorAll('.word-btn');
    buttons.forEach(button => {
        if (parseInt(button.dataset.wordIndex) === removedWordObj.buttonIndex && button.disabled) {
            button.disabled = false;
            return;
        }
    });

    renderVersionAnswer(versionId);

    // Reset success state when user removes a word
    resetSuccessState();

    // Remove correct class from version container if it was correct
    if (versionContainer) {
        versionContainer.classList.remove('correct');
        const successDisplay = versionContainer.querySelector('.success-display');
        if (successDisplay) {
            successDisplay.remove();
        }
    }
}

// Clear one version
function clearVersion(versionId) {
    userAnswers[versionId] = [];
    renderVersionAnswer(versionId);

    // Remove correct/incorrect classes and success display
    const versionContainer = document.querySelector(`[data-version-id="${versionId}"]`);
    if (versionContainer) {
        versionContainer.classList.remove('correct', 'incorrect');
        const successDisplay = versionContainer.querySelector('.success-display');
        if (successDisplay) {
            successDisplay.remove();
        }
    }

    // Re-enable all buttons for this version
    const wordsArea = document.getElementById(`words-${versionId}`);
    if (wordsArea) {
        const buttons = wordsArea.querySelectorAll('.word-btn');
        buttons.forEach(button => button.disabled = false);
    }

    // Reset success state if needed
    resetSuccessState();
}

// Skip question - mark as completed and move to success state
skipBtn.addEventListener('click', () => {
    // Mark question as skipped/completed
    hasCheckedCurrentQuestion = true;

    // Save skipped question state (no score added)
    completedQuestions[currentQuestionIndex] = {
        userAnswers: JSON.parse(JSON.stringify(userAnswers)), // Save current state
        isCorrect: false, // Skipped, so not correct
        feedback: "⏭️ Question skipped"
    };

    // Show skip feedback
    feedback.innerHTML = `
        <div class="feedback-header">
            <h3>⏭️ Question skipped - Showing correct answers!</h3>
        </div>
    `;
    feedback.className = 'feedback';
    feedback.classList.remove('hidden');

    // Hide skip button and show next button
    skipBtn.style.display = 'none';
    nextBtn.classList.remove('hidden');

    // Hide version clear buttons
    document.querySelectorAll('.btn-clear-version').forEach(btn => {
        btn.style.display = 'none';
    });

    // Show correct answers for all versions and mark them as correct
    const lesson = lessons[currentQuestionIndex];
    lesson.versions.forEach((version, index) => {
        const versionId = `${currentQuestionIndex}-${index}`;
        const versionContainer = document.querySelector(`[data-version-id="${versionId}"]`);

        if (versionContainer) {
            // Add correct class to make container green
            versionContainer.classList.add('correct');
            versionContainer.classList.remove('incorrect');

            // Remove old success display if exists
            const oldSuccessDisplay = versionContainer.querySelector('.success-display');
            if (oldSuccessDisplay) {
                oldSuccessDisplay.remove();
            }

            // Add success display with correct answer
            const successDiv = document.createElement('div');
            successDiv.className = 'success-display';
            successDiv.innerHTML = `✓ <strong>${version.words.join(' ')}</strong>`;
            versionContainer.appendChild(successDiv);
        }
    });

    // Disable all word buttons to prevent further editing
    for (const versionId in userAnswers) {
        const wordsArea = document.getElementById(`words-${versionId}`);
        if (wordsArea) {
            const buttons = wordsArea.querySelectorAll('.word-btn');
            buttons.forEach(button => button.disabled = true);
        }
    }
});

// Check one version
function checkVersionAnswer(userAnswer, correctAnswer) {
    if (userAnswer.length !== correctAnswer.length) return false;

    const userStr = userAnswer.join(' ').toLowerCase();
    const correctStr = correctAnswer.join(' ').toLowerCase();

    return userStr === correctStr;
}

// Reset success state (hide feedback, show Next button as hidden by default)
function resetSuccessState() {
    hasCheckedCurrentQuestion = false;
    feedback.classList.add('hidden');
    nextBtn.classList.add('hidden');
}

// Check if all versions are completed and correct, then auto-switch to success state
function checkAllVersionsSuccess() {
    if (!lessons[currentQuestionIndex]) return;

    const lesson = lessons[currentQuestionIndex];
    let allVersionsCorrect = true;

    // Check each version
    for (let versionIndex = 0; versionIndex < lesson.versions.length; versionIndex++) {
        const versionId = `${currentQuestionIndex}-${versionIndex}`;
        const version = lesson.versions[versionIndex];

        // Check if this version is completed
        const userAnswer = userAnswers[versionId];
        if (!userAnswer || userAnswer.length !== version.words.length) {
            allVersionsCorrect = false;
            break;
        }

        // Check if this version is correct
        const userAnswerWords = userAnswer.map(answer => answer.word);
        const isCorrect = checkVersionAnswer(userAnswerWords, version.words);

        if (!isCorrect) {
            allVersionsCorrect = false;
            break;
        }
    }

    // If all versions are completed and correct, switch to success state
    if (allVersionsCorrect) {
        // Add score only on first auto-completion
        if (!hasCheckedCurrentQuestion) {
            score++;
            scoreDisplay.textContent = `Score: ${score}`;
        }

        // Mark as checked to prevent multiple checks
        hasCheckedCurrentQuestion = true;

        // Save completed question state
        completedQuestions[currentQuestionIndex] = {
            userAnswers: JSON.parse(JSON.stringify(userAnswers)), // Deep copy
            isCorrect: true,
            feedback: "🎉 Perfect! All versions are correct!"
        };

        // Show success feedback
        feedback.innerHTML = `
            <div class="feedback-header">
                <h3>🎉 Perfect! All versions are correct!</h3>
            </div>
        `;
        feedback.className = 'feedback correct';
        feedback.classList.remove('hidden');

        // Hide skip button
        skipBtn.style.display = 'none';
        document.querySelectorAll('.btn-clear-version').forEach(btn => {
            btn.style.display = 'none';
        });

        // Switch to next state (show Next button)
        nextBtn.classList.remove('hidden');
    }
}

// Next question
nextBtn.addEventListener('click', () => {
    currentQuestionIndex++;
    visitedQuestions.add(currentQuestionIndex); // Mark new question as visited
    showQuestion();
});

// Show results
function showResults() {
    gameArea.classList.add('hidden');
    results.classList.remove('hidden');
    finalScore.textContent = `${score}/${lessons.length}`;
}

// Restart
restartBtn.addEventListener('click', () => {
    startGame();
});

// Keyboard typing support
document.addEventListener('keydown', (e) => {
    // Ignore if modal is open
    if (!helpModal.classList.contains('hidden')) {
        return;
    }

    // Ignore if no active version or if typing in input field
    if (!activeVersionId || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
    }

    // Handle Escape - close modal if open, otherwise trigger Skip
    if (e.key === 'Escape') {
        e.preventDefault();

        // Check if modal is open
        if (!helpModal.classList.contains('hidden')) {
            helpModal.classList.add('hidden');
        } else {
            // Trigger skip button if it's visible and not disabled
            if (!skipBtn.classList.contains('hidden') && skipBtn.style.display !== 'none') {
                skipBtn.click();
            }
            endTypingSession();
        }
        return;
    }

    // Handle Shift - play audio of active version
    if (e.key === 'Shift') {
        e.preventDefault();

        // Get the correct sentence for active version
        const lesson = lessons[currentQuestionIndex];
        if (lesson) {
            const [questionIndex, versionIndex] = activeVersionId.split('-').map(Number);
            const version = lesson.versions[versionIndex];
            if (version) {
                speakSentence(version.words.join(' '));
            }
        }
        return;
    }

    // Handle Tab or Enter - switch to next version
    if (e.key === 'Tab') {
        e.preventDefault();
        switchToNextVersion();
        endTypingSession();
        return;
    }

    // Handle Enter - trigger Next button if visible
    if (e.key === 'Enter') {
        e.preventDefault();

        // If Next button is visible, trigger it
        if (!nextBtn.classList.contains('hidden')) {
            nextBtn.click();
        }
        // Note: No need for checkBtn since we have auto-check when all versions complete

        endTypingSession();
        return;
    }    // Handle Arrow Up - switch to previous version
    if (e.key === 'ArrowUp') {
        e.preventDefault();
        switchToPreviousVersion();
        endTypingSession();
        return;
    }

    // Handle Arrow Down - switch to next version
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        switchToNextVersion();
        endTypingSession();
        return;
    }

    // Handle Arrow Left - go to previous question (if visited)
    if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToPreviousQuestion();
        endTypingSession();
        return;
    }

    // Handle Arrow Right - go to next question (if visited)
    if (e.key === 'ArrowRight') {
        e.preventDefault();
        goToNextQuestion();
        endTypingSession();
        return;
    }

    // Ignore other special keys except Backspace
    if (e.key.length > 1 && e.key !== 'Backspace') {
        return;
    }

    // Handle backspace - remove last word
    if (e.key === 'Backspace') {
        e.preventDefault();
        const answers = userAnswers[activeVersionId];
        if (answers && answers.length > 0) {
            removeWord(answers.length - 1, activeVersionId);
        }

        // End typing session on backspace
        endTypingSession();
        return;
    }

    // Start new typing session if not already in one
    if (!isInTypingSession) {
        startTypingSession();
    }

    // Add character to buffer
    typingBuffer += e.key.toLowerCase();

    // Show typing indicator
    showTypingIndicator(typingBuffer);

    // Clear existing timer
    if (typingTimer) {
        clearTimeout(typingTimer);
    }

    // Only try to match if no match has been found in this session yet
    if (!hasMatchedInSession) {
        const matched = tryMatchWord();

        if (matched) {
            // Match found - mark that we found a match but continue session
            // Allow user to keep typing in this session
            hasMatchedInSession = true;
            // Don't end session here, let user continue typing
        }
    }

    // Set new timer - if no typing for 300ms, end typing session
    typingTimer = setTimeout(() => {
        endTypingSession();
    }, 300);
});

// Show typing indicator popup
function showTypingIndicator(text) {
    typingText.textContent = text;
    typingIndicator.classList.remove('hidden');
}

// Try to match typed buffer with available words
function tryMatchWord() {
    if (!typingBuffer || !activeVersionId) {
        return false;
    }

    const wordsArea = document.getElementById(`words-${activeVersionId}`);
    if (!wordsArea) {
        return false;
    }

    // Find all available (not disabled) buttons
    const buttons = wordsArea.querySelectorAll('.word-btn:not(:disabled)');

    // Try exact match first
    for (const button of buttons) {
        const word = button.textContent.toLowerCase();
        if (word === typingBuffer) {
            // Found exact match, click it
            const wordIndex = parseInt(button.dataset.wordIndex);
            selectWord(button.textContent, button, activeVersionId, wordIndex);
            return true;
        }
    }

    // Collect all matching words for prefix and substring
    const prefixMatches = [];
    const substringMatches = [];

    for (const button of buttons) {
        const word = button.textContent.toLowerCase();
        const wordIndex = parseInt(button.dataset.wordIndex);

        if (word.startsWith(typingBuffer) && typingBuffer.length >= 1) {
            prefixMatches.push({ button, word, wordIndex });
        } else if (word.includes(typingBuffer) && typingBuffer.length >= 3) {
            substringMatches.push({ button, word, wordIndex });
        }
    }

    // If only one prefix match exists, select it immediately (even with 1 character)
    if (prefixMatches.length === 1) {
        const match = prefixMatches[0];
        selectWord(match.button.textContent, match.button, activeVersionId, match.wordIndex);
        return true;
    }

    // If multiple prefix matches, wait for at least 2 characters
    if (prefixMatches.length > 1 && typingBuffer.length >= 2) {
        // Select the first match (shortest or first in order)
        const match = prefixMatches[0];
        selectWord(match.button.textContent, match.button, activeVersionId, match.wordIndex);
        return true;
    }

    // Try substring match (contains) - most flexible, only if no prefix matches
    if (prefixMatches.length === 0 && substringMatches.length > 0 && typingBuffer.length >= 3) {
        const match = substringMatches[0];
        selectWord(match.button.textContent, match.button, activeVersionId, match.wordIndex);
        return true;
    }

    // No match found
    return false;
}

// Hide typing indicator
function hideTypingIndicator() {
    typingIndicator.classList.add('hidden');
}

// Start a new typing session
function startTypingSession() {
    isInTypingSession = true;
    hasMatchedInSession = false;
    typingBuffer = '';
}

// End current typing session
function endTypingSession() {
    isInTypingSession = false;
    hasMatchedInSession = false;
    typingBuffer = '';
    hideTypingIndicator();

    // Clear any existing timer
    if (typingTimer) {
        clearTimeout(typingTimer);
        typingTimer = null;
    }
}
