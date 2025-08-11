const GEMINI_API_KEY = ""; // ← replace this with your real key

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "filterPII") {
        console.log("🔍 Gemini PII Filter Request:", request.text);

        const timeout = setTimeout(() => {
            console.warn("🚨 Gemini API Timed Out. Proceeding with unfiltered text.");
            sendResponse({ filtered_text: request.text }); // fallback
        }, 5000);

        const userPrompt = `Text: "${request.text}"\n\nDoes the text contain any PII such as phone number,name,or important personal information? Reply with only YES or NO.`;

        fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                contents: [
                    {
                        parts: [
                            { text: userPrompt }
                        ]
                    }
                ]
            })
        })
        .then(response => response.json())
        .then(data => {
            clearTimeout(timeout);
        
            const rawReply = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toUpperCase();
            const action = (rawReply === "YES") ? "block" : "allow";
        
            console.log(`✅ Gemini Reply: ${rawReply}, Action: ${action}`);
            sendResponse({ action });
        })
        
        .catch(error => {
            clearTimeout(timeout);
            console.error("❌ Gemini API Error:", error);
            sendResponse({ filtered_text: request.text });
        });

        return true; // Keep message channel open for async response
    }

    // NEW: Handle document content checking
    if (request.action === "checkDocumentPII") {
        console.log("📄 Checking document for PII:", request.filename);

        const timeout = setTimeout(() => {
            console.warn("🚨 Gemini API Timed Out for document check.");
            sendResponse({ action: "allow" }); // fallback to allow
        }, 10000); // Longer timeout for documents

        const userPrompt = `Document content: "${request.content}"\n\nDoes this document contain any PII such as phone numbers, names, addresses, or important personal information? Reply with only YES or NO.`;

        fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                contents: [
                    {
                        parts: [
                            { text: userPrompt }
                        ]
                    }
                ]
            })
        })
        .then(response => response.json())
        .then(data => {
            clearTimeout(timeout);
        
            const rawReply = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toUpperCase();
            const action = (rawReply === "YES") ? "block" : "allow";
        
            console.log(`📄 Document PII Check - File: ${request.filename}, Reply: ${rawReply}, Action: ${action}`);
            sendResponse({ action, filename: request.filename });
        })
        
        .catch(error => {
            clearTimeout(timeout);
            console.error("❌ Gemini API Error for document:", error);
            sendResponse({ action: "allow", filename: request.filename });
        });

        return true; // Keep message channel open for async response
    }
});
