console.log("✅ PII Detection Filter Content Script Loaded");

let latestUserInput = "";
let typingTimeout;
let uploadedFiles = new Map(); // Track uploaded files and their content

// PURE JAVASCRIPT: PDF text extraction without any external libraries
async function extractTextFromPDF(file) {
    console.log("🔄 Starting PDF text extraction...");
    
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const arrayBuffer = e.target.result;
                const uint8Array = new Uint8Array(arrayBuffer);
                
                console.log(`📄 PDF file size: ${uint8Array.length} bytes`);
                
                // Convert to string for pattern matching
                let pdfText = '';
                for (let i = 0; i < uint8Array.length; i++) {
                    pdfText += String.fromCharCode(uint8Array[i]);
                }
                
                console.log(`📄 PDF converted to string, length: ${pdfText.length}`);
                
                const extractedTexts = [];
                
                // Method 1: Extract text between parentheses (most common in PDFs)
                const parenthesesRegex = /\(([^)]*)\)/g;
                let match;
                while ((match = parenthesesRegex.exec(pdfText)) !== null) {
                    const text = match[1];
                    if (text && text.length > 0 && !/^[\s\x00-\x1F]*$/.test(text)) {
                        extractedTexts.push(text);
                    }
                }
                
                console.log(`📄 Method 1 - Parentheses extraction found ${extractedTexts.length} text segments`);
                
                // Method 2: Extract text between angle brackets
                const angleBracketRegex = /<([^>]+)>/g;
                while ((match = angleBracketRegex.exec(pdfText)) !== null) {
                    const text = match[1];
                    if (text && text.length > 0 && !/^[\s\x00-\x1F]*$/.test(text)) {
                        extractedTexts.push(text);
                    }
                }
                
                console.log(`📄 Method 2 - Angle brackets found additional segments`);
                
                // Method 3: Look for readable text patterns (letters/numbers/spaces)
                const readableTextRegex = /[a-zA-Z0-9\s]{3,}/g;
                const readableMatches = pdfText.match(readableTextRegex) || [];
                
                // Filter out very long strings (likely encoded data) and very short ones
                const filteredReadable = readableMatches.filter(text => 
                    text.length >= 3 && 
                    text.length <= 200 && 
                    !/^[\s\d]+$/.test(text) && // Not just spaces and numbers
                    /[a-zA-Z]/.test(text) // Contains at least one letter
                );
                
                extractedTexts.push(...filteredReadable);
                
                console.log(`📄 Method 3 - Readable text patterns found ${filteredReadable.length} segments`);
                
                // Method 4: Look for stream content (between 'stream' and 'endstream')
                const streamRegex = /stream\s*(.*?)\s*endstream/gs;
                while ((match = streamRegex.exec(pdfText)) !== null) {
                    const streamContent = match[1];
                    // Look for readable text in stream content
                    const streamText = streamContent.match(/[a-zA-Z0-9\s]{3,}/g) || [];
                    streamText.forEach(text => {
                        if (text.length >= 3 && text.length <= 200 && /[a-zA-Z]/.test(text)) {
                            extractedTexts.push(text);
                        }
                    });
                }
                
                console.log(`📄 Method 4 - Stream content extraction completed`);
                
                // Combine and clean up extracted text
                let finalText = extractedTexts
                    .map(text => text.trim())
                    .filter(text => text.length > 0)
                    .join(' ')
                    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
                    .trim();
                
                // Remove common PDF artifacts
                finalText = finalText
                    .replace(/\\[nrtf]/g, ' ') // Remove escape sequences
                    .replace(/[^\x20-\x7E]/g, ' ') // Remove non-printable characters
                    .replace(/\s+/g, ' ') // Clean up spaces again
                    .trim();
                
                console.log(`📄 Final extracted text length: ${finalText.length} characters`);
                console.log(`📄 ===== EXTRACTED PDF CONTENT START =====`);
                console.log(finalText);
                console.log(`📄 ===== EXTRACTED PDF CONTENT END =====`);
                
                if (finalText.length === 0) {
                    console.warn("⚠️ Warning: No readable text extracted from PDF!");
                    resolve("[PDF file - no readable text found. Blocking for safety - manual review required for PII]");
                } else {
                    console.log(`✅ Successfully extracted ${finalText.length} characters from PDF`);
                    resolve(finalText);
                }
                
            } catch (error) {
                console.error('❌ Error in PDF text extraction:', error);
                reject(error);
            }
        };
        
        reader.onerror = (error) => {
            console.error('❌ FileReader error:', error);
            reject(error);
        };
        
        reader.readAsArrayBuffer(file);
    });
}

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

function showDocumentPIIPopup(filename) {
    alert(`🚨 Personal Information detected in uploaded document: ${filename}!\nIt is against the corporate policy.\nMessage will not be sent`);
}

// Extract text from uploaded files (PDF and text only)
async function extractTextFromFile(file) {
    const fileName = file.name.toLowerCase();
    const fileType = file.type.toLowerCase();
    
    try {
        // Handle PDF files
        if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
            console.log(`📄 Processing PDF file: ${file.name}`);
            return await extractTextFromPDF(file);
        }
        
        // Handle text files
        if (fileType.startsWith('text/') || fileName.endsWith('.txt')) {
            console.log(`📄 Processing text file: ${file.name}`);
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = function(e) {
                    try {
                        const content = e.target.result;
                        console.log(`📄 Text file content length: ${content.length}`);
                        console.log(`📄 Text file content preview: ${content.substring(0, 200)}...`);
                        resolve(content);
                    } catch (error) {
                        reject(error);
                    }
                };
                reader.onerror = reject;
                reader.readAsText(file);
            });
        }
        
        // For other file types, return a placeholder message
        console.log(`❓ Unsupported file type: ${file.name} (${fileType})`);
        return `[${fileType || 'Unknown'} file: ${file.name}] - Manual review recommended for PII`;
        
    } catch (error) {
        console.error(`❌ Error processing file ${file.name}:`, error);
        throw error;
    }
}

function monitorFileUploads() {
    document.addEventListener('change', async (e) => {
        if (e.target.type === 'file' && e.target.files.length > 0) {
            console.log("📎 File upload detected via input change");
            await handleFileUpload(e.target.files);
        }
    }, true);

    document.addEventListener('drop', async (e) => {
        if (e.dataTransfer && e.dataTransfer.files.length > 0) {
            console.log("📎 File upload detected via drag & drop");
            await handleFileUpload(e.dataTransfer.files);
        }
    }, true);
}

async function handleFileUpload(files) {
    console.log("🗑️ Clearing previous uploaded files from memory");
    uploadedFiles.clear();
    
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        console.log(`📄 Processing uploaded file: ${file.name} (${file.type})`);
        
        try {
            const content = await extractTextFromFile(file);
            
            if (!content || content.trim().length === 0) {
                console.error(`❌ No content extracted from ${file.name}`);
                uploadedFiles.set(file.name, {
                    content: `Error: No readable content found in ${file.name}`,
                    type: file.type,
                    size: file.size,
                    checked: false,
                    hasError: true
                });
            } else {
                uploadedFiles.set(file.name, {
                    content: content,
                    type: file.type,
                    size: file.size,
                    checked: false,
                    hasError: false
                });
                console.log(`✅ File content extracted for: ${file.name} (${content.length} characters)`);
            }
        } catch (error) {
            console.error(`❌ Error extracting content from ${file.name}:`, error);
            uploadedFiles.set(file.name, {
                content: `Error reading file: ${file.name} - ${error.message}`,
                type: file.type,
                size: file.size,
                checked: false,
                hasError: true
            });
        }
    }
}

async function checkUploadedDocumentsForPII() {
    const piiResults = [];
    
    console.log(`🔍 Checking ${uploadedFiles.size} uploaded files for PII...`);
    
    for (const [filename, fileData] of uploadedFiles) {
        console.log(`📋 File: ${filename}, Checked: ${fileData.checked}, HasError: ${fileData.hasError}, Content Length: ${fileData.content?.length || 0}`);
        
        if (fileData.hasError) {
            console.log(`🚨 File ${filename} had extraction errors - blocking for safety`);
            piiResults.push({
                filename: filename,
                hasPII: true,
                reason: "File extraction error"
            });
            continue;
        }
        
        if (!fileData.checked && fileData.content && fileData.content.length > 0) {
            console.log(`🔍 Checking document for PII: ${filename}`);
            console.log(`📄 Content to be checked: ${fileData.content.substring(0, 200)}...`);
            
            try {
                const response = await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        reject(new Error("PII check timeout"));
                    }, 15000);
                    
                    chrome.runtime.sendMessage(
                        { 
                            action: "checkDocumentPII", 
                            content: fileData.content,
                            filename: filename
                        },
                        (response) => {
                            clearTimeout(timeout);
                            if (chrome.runtime.lastError) {
                                reject(chrome.runtime.lastError);
                            } else {
                                resolve(response);
                            }
                        }
                    );
                });

                console.log(`📋 PII Check Response for ${filename}:`, response);

                if (response?.action === "block") {
                    piiResults.push({
                        filename: filename,
                        hasPII: true,
                        reason: "PII detected by API"
                    });
                    console.log(`🚨 PII found in ${filename} - will re-check on next send attempt`);
                } else {
                    fileData.checked = true;
                    console.log(`✅ No PII in ${filename} - marked as checked`);
                }
            } catch (error) {
                console.error(`❌ Error checking PII in ${filename}:`, error);
                piiResults.push({
                    filename: filename,
                    hasPII: true,
                    reason: `API error: ${error.message}`
                });
                console.log(`🚨 Blocking ${filename} due to PII check error`);
            }
        } else if (!fileData.content || fileData.content.length === 0) {
            console.log(`⚠️ File ${filename} has no content - blocking for safety`);
            piiResults.push({
                filename: filename,
                hasPII: true,
                reason: "No content extracted"
            });
        }
    }
    
    console.log(`🔍 PII Check Results:`, piiResults);
    return piiResults;
}

async function checkPIIonSend(inputField) {
    let userInput = inputField.innerText;
    if (userInput === "") return;
    
    console.log("🔄 Starting PII check process...");
    disableSendButton();
    
    chrome.runtime.sendMessage(
        { action: "filterPII", text: userInput },
        async (response) => {
            console.log("📝 Text PII check response:", response);
            
            if (response?.action === "block") {
                console.log("🚨 PII detected by Gemini in text prompt.");
                showDetectionPopup();
                enableSendButton();
                return;
            }
            
            console.log("✅ No PII in text prompt, checking documents...");
            console.log(`📁 Number of uploaded files to check: ${uploadedFiles.size}`);
            
            const documentPIIResults = await checkUploadedDocumentsForPII();
            
            console.log(`📊 Document PII Results: ${documentPIIResults.length} files with issues`);
            
            if (documentPIIResults.length > 0) {
                console.log("🚨 PII or errors detected in uploaded documents.");
                const blockedFiles = documentPIIResults.map(result => `${result.filename} (${result.reason || 'PII detected'})`).join(", ");
                showDocumentPIIPopup(blockedFiles);
                enableSendButton();
                return;
            }
            
            console.log("✅ No PII detected in text or documents, allowing message to send.");

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
                    uploadedFiles.clear();
                    console.log("🧹 Cleared uploaded files after successful send");
                }, 100);
            }
        }
    );
}

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
monitorFileUploads();
