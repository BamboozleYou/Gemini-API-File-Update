let uploadedFiles = new Map();
let isCheckingPII = false;

const API_CONFIG = {
    baseUrl: 'http://127.0.0.1:8080',
    extractEndpoint: '/extract-text',
    timeout: 30000
};

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
        sendButton.style.opacity = "0.5";
    }
}

function enableSendButton() {
    let sendButton = findSendButton();
    if (sendButton) {
        sendButton.disabled = false;
        sendButton.style.opacity = "1";
    }
}

function showDetectionPopup(message) {
    alert("🚨 Personal Information Detected!\n\n" + message + "\n\nMessage blocked by corporate policy.");
}

async function extractTextFromFile(file) {
    console.log("\n📡 === CALLING FILE EXTRACTION API ===");
    console.log("📡 File name:", file.name);
    console.log("📡 File type:", file.type);
    console.log("📡 File size:", file.size, "bytes");
    console.log("📡 API endpoint:", API_CONFIG.baseUrl + API_CONFIG.extractEndpoint);

    try {
        const formData = new FormData();
        formData.append('file', file);
        
        console.log("📡 Sending file to extraction API...");
        
        const response = await fetch(API_CONFIG.baseUrl + API_CONFIG.extractEndpoint, {
            method: 'POST',
            body: formData,
            signal: AbortSignal.timeout(API_CONFIG.timeout)
        });
        
        console.log("📡 API Response status:", response.status);
        console.log("📡 API Response status text:", response.statusText);
        
        if (!response.ok) {
            throw new Error("HTTP " + response.status + ": " + response.statusText);
        }
        
        const result = await response.json();
        
        console.log("\n📄 === FILE EXTRACTION API RESULT ===");
        console.log("📄 Extraction success:", result.success);
        console.log("📄 Filename:", result.filename);
        console.log("📄 File size:", result.file_size);
        console.log("📄 Text length:", result.text_length);
        console.log("📄 Supported:", result.supported);
        
        if (result.success && result.extracted_text) {
            console.log("\n📄 === EXTRACTED TEXT FROM FILE ===");
            console.log("📄 FULL EXTRACTED CONTENT:");
            console.log("=" + "=".repeat(60));
            console.log(result.extracted_text);
            console.log("=" + "=".repeat(60));
            console.log("📄 Character count:", result.extracted_text.length);
            console.log("📄 Word count:", result.extracted_text.split(/\s+/).length);
            console.log("📄 Lines count:", result.extracted_text.split('\n').length);
            
            return result.extracted_text;
        } else {
            console.log("❌ File extraction failed:");
            console.log("   - Success:", result.success);
            console.log("   - Error:", result.error);
            console.log("   - Extracted text:", result.extracted_text);
            
            return "[Error: Could not extract text from " + file.name + "]";
        }
        
    } catch (error) {
        console.log("❌ === FILE EXTRACTION API ERROR ===");
        console.log("❌ Error type:", error.name);
        console.log("❌ Error message:", error.message);
        console.log("❌ Full error:", error);
        
        return "[Error: " + error.message + "]";
    }
}

async function handleFileUpload(files) {
    console.log("\n📁 === FILE UPLOAD DETECTED ===");
    console.log("📁 Number of files:", files.length);
    
    uploadedFiles.clear();
    
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        console.log("\n📁 Processing file " + (i + 1) + "/" + files.length + ":", file.name);
        
        try {
            const content = await extractTextFromFile(file);
            const hasError = !content || content.trim().length === 0 || content.startsWith("[Error:");
            
            uploadedFiles.set(file.name, {
                content: content,
                type: file.type,
                size: file.size,
                checked: false,
                hasError: hasError
            });
            
            console.log("📁 File stored in memory:", file.name, hasError ? "(HAS ERROR)" : "(SUCCESS)");
            
        } catch (error) {
            console.log("❌ Failed to process file:", file.name, error.message);
            uploadedFiles.set(file.name, {
                content: "Error: " + error.message,
                type: file.type,
                size: file.size,
                checked: false,
                hasError: true
            });
        }
    }
    
    console.log("📁 Total files in memory:", uploadedFiles.size);
}

async function checkUploadedDocumentsForPII() {
    const piiResults = [];
    
    console.log("\n🎯 === PII DETECTION ACTIVATED FOR FILES ===");
    console.log("🎯 Number of files to check:", uploadedFiles.size);
    
    for (const [filename, fileData] of uploadedFiles) {
        console.log("\n🎯 Checking file:", filename);
        console.log("🎯 Has error:", fileData.hasError);
        console.log("🎯 Already checked:", fileData.checked);
        console.log("🎯 Content length:", fileData.content?.length || 0);
        
        if (fileData.hasError) {
            console.log("🚨 File has error - will block:", filename);
            piiResults.push({
                filename: filename,
                hasPII: true,
                reason: "File extraction failed"
            });
            continue;
        }
        
        if (!fileData.checked && fileData.content && fileData.content.length > 0) {
            console.log("🎯 Sending to background script for Gemini PII check...");
            
            try {
                const response = await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        reject(new Error("Background script timeout"));
                    }, 30000); // Increased timeout for debugging
                    
                    console.log("🎯 Calling chrome.runtime.sendMessage...");
                    
                    chrome.runtime.sendMessage(
                        { 
                            action: "checkDocumentPII", 
                            content: fileData.content,
                            filename: filename
                        },
                        (response) => {
                            clearTimeout(timeout);
                            console.log("🎯 Background script responded for", filename);
                            
                            if (chrome.runtime.lastError) {
                                console.error("❌ Chrome runtime error:", chrome.runtime.lastError);
                                reject(new Error("Chrome runtime error: " + chrome.runtime.lastError.message));
                            } else if (!response) {
                                console.error("❌ No response from background script");
                                reject(new Error("No response from background script"));
                            } else {
                                resolve(response);
                            }
                        }
                    );
                });

                console.log("\n🎯 === PII CHECK RESULT ===");
                console.log("🎯 File:", filename);
                console.log("🎯 Action:", response.action);
                console.log("🎯 Gemini said:", response.gemini_response);
                console.log("🎯 Reasoning:", response.reasoning);

                if (response.action === "block") {
                    console.log("🚨 PII DETECTED - WILL BLOCK MESSAGE");
                    piiResults.push({
                        filename: filename,
                        hasPII: true,
                        reason: "PII detected",
                        gemini_response: response.gemini_response
                    });
                } else {
                    console.log("✅ NO PII DETECTED - WILL ALLOW");
                    fileData.checked = true;
                }
                
            } catch (error) {
                console.log("❌ PII check failed for", filename + ":", error.message);
                piiResults.push({
                    filename: filename,
                    hasPII: true,
                    reason: "PII check failed: " + error.message
                });
            }
        } else {
            console.log("⏭️ Skipping file (no content or already checked):", filename);
        }
    }
    
    console.log("\n🎯 === PII CHECK SUMMARY ===");
    console.log("🎯 Total files checked:", uploadedFiles.size);
    console.log("🎯 Files with PII/errors:", piiResults.length);
    
    return piiResults;
}

async function checkPIIonSend(inputField) {
    const userInput = inputField.innerText || inputField.value || "";
    
    if (isCheckingPII) {
        console.log("⏳ PII check already in progress - ignoring");
        return;
    }
    
    console.log("\n🚀 === STARTING COMPREHENSIVE PII CHECK ===");
    console.log("🚀 User input length:", userInput.length);
    console.log("🚀 Number of files to check:", uploadedFiles.size);
    
    isCheckingPII = true;
    disableSendButton();
    
    try {
        // Check text input
        if (userInput && userInput.trim().length > 0) {
            console.log("🎯 Activating PII detector for text input...");
            
            const textResponse = await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error("Text PII check timeout"));
                }, 15000);
                
                chrome.runtime.sendMessage(
                    { action: "filterPII", text: userInput },
                    (response) => {
                        clearTimeout(timeout);
                        
                        if (chrome.runtime.lastError) {
                            reject(new Error("Chrome runtime error: " + chrome.runtime.lastError.message));
                        } else if (!response) {
                            reject(new Error("No response from background script"));
                        } else {
                            resolve(response);
                        }
                    }
                );
            });
            
            console.log("🎯 Text PII check result:", textResponse.action);
            
            if (textResponse.action === "block") {
                console.log("🚨 PII DETECTED IN TEXT - BLOCKING MESSAGE");
                showDetectionPopup("PII detected in your message text");
                return;
            }
        }
        
        // Check files
        if (uploadedFiles.size > 0) {
            const documentPIIResults = await checkUploadedDocumentsForPII();
            
            if (documentPIIResults.length > 0) {
                console.log("🚨 PII DETECTED IN FILES - BLOCKING MESSAGE");
                const blockedFilesList = documentPIIResults.map(result => 
                    "• " + result.filename + ": " + result.reason
                ).join("\n");
                
                showDetectionPopup("PII detected in uploaded files:\n\n" + blockedFilesList);
                return;
            }
        }
        
        console.log("✅ ALL CHECKS PASSED - ALLOWING MESSAGE");
        
        // Allow send
        const sendButton = findSendButton();
        if (sendButton) {
            sendButton.removeEventListener("click", handleSendButtonClick, true);
            
            const clickEvent = new MouseEvent("click", {
                bubbles: true,
                cancelable: true,
                view: window
            });
            
            sendButton.dispatchEvent(clickEvent);
            
            setTimeout(() => {
                sendButton.addEventListener("click", handleSendButtonClick, true);
                uploadedFiles.clear();
                console.log("🧹 Files cleared after send");
            }, 500);
        }
        
    } catch (error) {
        console.log("❌ Error during PII check:", error.message);
        showDetectionPopup("Error checking for PII - message blocked for safety:\n" + error.message);
    } finally {
        isCheckingPII = false;
        enableSendButton();
    }
}

function handleSendButtonClick(event) {
    console.log("🔘 Send button clicked - intercepting for PII check");
    
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    
    const inputField = findActiveInputField();
    if (!inputField) {
        console.log("⚠️ No input field found");
        return;
    }
    
    checkPIIonSend(inputField);
}

function handleEnterKeyPress(event) {
    if (event.key === "Enter" && !event.shiftKey) {
        console.log("⌨️ Enter key pressed - intercepting for PII check");
        
        const inputField = findActiveInputField();
        if (!inputField) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        
        checkPIIonSend(inputField);
    }
}

function attachFilterToSendButton() {
    const sendButton = findSendButton();
    if (!sendButton) return;
    
    sendButton.removeEventListener("click", handleSendButtonClick, true);
    sendButton.addEventListener("click", handleSendButtonClick, true);
}

function attachEnterKeyListener() {
    document.removeEventListener("keydown", handleEnterKeyPress, true);
    document.addEventListener("keydown", handleEnterKeyPress, true);
}

function monitorFileUploads() {
    document.addEventListener('change', async (e) => {
        if (e.target.type === 'file' && e.target.files.length > 0) {
            console.log("🔎 File upload detected via input change");
            await handleFileUpload(e.target.files);
        }
    }, true);

    document.addEventListener('drop', async (e) => {
        if (e.dataTransfer && e.dataTransfer.files.length > 0) {
            console.log("🔎 File upload detected via drag & drop");
            await handleFileUpload(e.dataTransfer.files);
        }
    }, true);
}

function observeUIChanges() {
    const observer = new MutationObserver(() => {
        attachFilterToSendButton();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    attachFilterToSendButton();
}

// Test functions
window.testPII = function(text) {
    console.log("🧪 === MANUAL PII TEST ===");
    console.log("🧪 Test text:", text || "My name is John Smith, phone: 555-123-4567");
    
    chrome.runtime.sendMessage(
        { action: "filterPII", text: text || "My name is John Smith, phone: 555-123-4567" },
        (response) => {
            console.log("🧪 TEST RESULT:", response);
        }
    );
};

console.log("✅ Enhanced Debug PII Filter Loaded");
console.log("💡 Use testPII('text') to test PII detection manually");

// Initialize
observeUIChanges();
attachEnterKeyListener();
monitorFileUploads();
