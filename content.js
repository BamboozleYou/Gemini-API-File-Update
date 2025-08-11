console.log("✅ PII Detection Filter Content Script Loaded");

let latestUserInput = "";
let typingTimeout;
let uploadedFiles = new Map(); // Track uploaded files and their content

// Existing functions (unchanged)
function findActiveInputField() {
    let inputField = document.querySelector("textarea:not([style*='display: none'])") 
                     || document.querySelector("div[contenteditable='true']");
    if (!inputField || inputField.offsetParent === null || inputField.offsetHeight === 0) {
        return null;
    }
    return inputField;
}

function findSendButton() {
    return document.querySelector("button[data-testid='send-button']");
}

function disableSendButton() {
    let sendButton = findSendButton();
    if (sendButton) {
        sendButton.disabled = true;
    }
}

function enableSendButton() {
    let sendButton = findSendButton();
    if (sendButton) {
        sendButton.disabled = false;
    }
}

function showDetectionPopup() {
    alert("🚨 Personal Information detected in your message!\n It is against the corporate policy.\n Message will not be sent");
}

// NEW: Show PII detection popup for documents
function showDocumentPIIPopup(filename) {
    alert(`🚨 Personal Information detected in uploaded document: ${filename}!\nIt is against the corporate policy.\nMessage will not be sent`);
}

// NEW: Extract text from uploaded files
async function extractTextFromFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const content = e.target.result;
                // For now, handle text files. PDF support can be added later
                if (file.type.startsWith('text/') || file.name.toLowerCase().endsWith('.txt')) {
                    resolve(content);
                } else {
                    // For non-text files, return a placeholder message
                    resolve(`[${file.type || 'Unknown'} file: ${file.name}] - Manual review recommended for PII`);
                }
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

// NEW: Monitor file uploads
function monitorFileUploads() {
    // Monitor file input changes
    document.addEventListener('change', async (e) => {
        if (e.target.type === 'file' && e.target.files.length > 0) {
            console.log("📁 File upload detected via input change");
            await handleFileUpload(e.target.files);
        }
    }, true);

    // Monitor drag and drop
    document.addEventListener('drop', async (e) => {
        if (e.dataTransfer && e.dataTransfer.files.length > 0) {
            console.log("📁 File upload detected via drag & drop");
            await handleFileUpload(e.dataTransfer.files);
        }
    }, true);
}

// NEW: Handle file uploads and extract content
async function handleFileUpload(files) {
    // Clear previous files when new files are uploaded
    console.log("🗑️ Clearing previous uploaded files from memory");
    uploadedFiles.clear();
    
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        console.log(`📄 Processing uploaded file: ${file.name}`);
        
        try {
            const content = await extractTextFromFile(file);
            uploadedFiles.set(file.name, {
                content: content,
                type: file.type,
                size: file.size,
                checked: false
            });
            console.log(`✅ File content extracted for: ${file.name}`);
        } catch (error) {
            console.error(`❌ Error extracting content from ${file.name}:`, error);
            uploadedFiles.set(file.name, {
                content: `Error reading file: ${file.name}`,
                type: file.type,
                size: file.size,
                checked: false
            });
        }
    }
}

// NEW: Check all uploaded documents for PII
async function checkUploadedDocumentsForPII() {
    const piiResults = [];
    
    for (const [filename, fileData] of uploadedFiles) {
        if (!fileData.checked && fileData.content) {
            console.log(`🔍 Checking document for PII: ${filename}`);
            
            try {
                const response = await new Promise((resolve, reject) => {
                    chrome.runtime.sendMessage(
                        { 
                            action: "checkDocumentPII", 
                            content: fileData.content,
                            filename: filename
                        },
                        (response) => {
                            if (chrome.runtime.lastError) {
                                reject(chrome.runtime.lastError);
                            } else {
                                resolve(response);
                            }
                        }
                    );
                });

                if (response?.action === "block") {
                    // DON'T mark as checked if PII found - allow re-checking on next attempt
                    piiResults.push({
                        filename: filename,
                        hasPII: true
                    });
                    console.log(`🚨 PII found in ${filename} - will re-check on next send attempt`);
                } else {
                    // Only mark as checked if no PII found
                    fileData.checked = true;
                    console.log(`✅ No PII in ${filename} - marked as checked`);
                }
            } catch (error) {
                console.error(`❌ Error checking PII in ${filename}:`, error);
                // Don't mark as checked on error - allow retry
            }
        }
    }
    
    return piiResults;
}

// MODIFIED: Updated checkPIIonSend to include document checking
async function checkPIIonSend(inputField) {
    let userInput = inputField.innerText;
    if (userInput === "") return;
    
    disableSendButton(); // Temporarily disable send button while checking
    
    // Check text prompt (existing functionality)
    chrome.runtime.sendMessage(
        { action: "filterPII", text: userInput },
        async (response) => {
            if (response?.action === "block") {
                console.log("🚨 PII detected by Gemini in text prompt.");
                showDetectionPopup();
                enableSendButton();
                return;
            }
            
            // NEW: Check uploaded documents for PII
            console.log("✅ No PII in text prompt, checking documents...");
            const documentPIIResults = await checkUploadedDocumentsForPII();
            
            if (documentPIIResults.length > 0) {
                console.log("🚨 PII detected in uploaded documents.");
                const blockedFiles = documentPIIResults.map(result => result.filename).join(", ");
                showDocumentPIIPopup(blockedFiles);
                enableSendButton();
                return;
            }
            
            console.log("✅ No PII detected in text or documents, sending message.");

            let sendButton = findSendButton();
            if (sendButton) {
                sendButton.removeEventListener("click", handleSendButtonClick, true);
                
                let event = new MouseEvent("click", {
                    bubbles: true,
                    cancelable: true,
                    view: window
                });
                sendButton.dispatchEvent(event);

                setTimeout(() => {
                    sendButton.addEventListener("click", handleSendButtonClick, true);
                    // Clear uploaded files after successful send
                    uploadedFiles.clear();
                }, 100);
            }
        }
    );
}

// Existing functions (unchanged)
function attachEnterKeyListener() {
    document.removeEventListener("keydown", handleEnterKeyPress, true);
    document.addEventListener("keydown", handleEnterKeyPress, true);
}

function handleEnterKeyPress(event) {
    if (event.key === "Enter" && !event.shiftKey) {
        const inputField = findActiveInputField();
        if (!inputField) return;

        event.preventDefault();
        event.stopPropagation();
        checkPIIonSend(inputField)
    }
}

function attachFilterToSendButton() {
    let sendButton = findSendButton();
    if (!sendButton) return;
    sendButton.removeEventListener("click", handleSendButtonClick);
    sendButton.addEventListener("click", handleSendButtonClick, true);
}

function handleSendButtonClick(event) {
    event.preventDefault();
    event.stopPropagation();
    
    const inputField = findActiveInputField();
    if (!inputField) return;
    
    checkPIIonSend(inputField);
}

function observeUIChanges() {
    const observer = new MutationObserver(() => {
        attachFilterToSendButton();
        attachEnterKeyListener();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    attachFilterToSendButton();
    attachEnterKeyListener();
}

// Initialize everything
observeUIChanges();
monitorFileUploads(); // NEW: Start monitoring file uploads
