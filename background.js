const GEMINI_API_KEY = "AIzaSyA-ol7CCNDNpFBjkN-loeKu_ViX3drEnGU"; // ← replace this with your real key

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    
    if (request.action === "filterPII") {
        const userPrompt = `Does this text contain any personally identifiable information (PII) that's not dummy data? Reply with only YES or NO.

Text: "${request.text}"`;

        fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: userPrompt }] }]
            })
        })
        .then(response => response.json())
        .then(data => {
            const rawReply = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toUpperCase();
            const action = (rawReply === "YES") ? "block" : "allow";
            sendResponse({ action, gemini_response: rawReply });
        })
        .catch(error => {
            sendResponse({ action: "allow", error: error.message });
        });

        return true;
    }

    if (request.action === "checkDocumentPII") {
        console.log("\n🎯 === PII DETECTOR ACTIVATED ===");
        console.log("🎯 File being checked:", request.filename);

        // LOG TEXT READ FROM FILE
        console.log("\n📄 === TEXT READ FROM FILE ===");
        console.log("=" + "=".repeat(50));
        console.log(request.content);
        console.log("=" + "=".repeat(50));

        // Truncate if needed
        let contentToCheck = request.content || "";
        if (contentToCheck.length > 20000) {
            contentToCheck = contentToCheck.substring(0, 20000) + "\n... (truncated)";
        }

        // Simple, clean prompt
        const userPrompt = `Does this document contain any personally identifiable information (PII) that's not dummy data? Reply with only YES or NO.

Document: "${contentToCheck}"`;

        // LOG PROMPT SENT TO GEMINI
        console.log("\n🚀 === PROMPT SENT TO GEMINI ===");
        console.log("-" + "-".repeat(50));
        console.log(userPrompt);
        console.log("-" + "-".repeat(50));

        fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: userPrompt }] }]
            })
        })
        .then(response => response.json())
        .then(data => {
            // LOG GEMINI RESPONSE
            console.log("\n📥 === GEMINI RESPONSE ===");
            console.log("*" + "*".repeat(50));
            console.log(JSON.stringify(data, null, 2));
            console.log("*" + "*".repeat(50));
            
            const rawReply = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            console.log("📥 Gemini said: '" + rawReply + "'");
            
            const action = (rawReply?.toUpperCase() === "YES") ? "block" : "allow";
            
            console.log("\n📊 === FINAL DECISION ===");
            console.log("📊 Final action:", action.toUpperCase());
            
            sendResponse({ 
                action, 
                filename: request.filename,
                gemini_response: rawReply
            });
        })
        .catch(error => {
            console.log("\n❌ === API ERROR ===");
            console.log("❌ Error:", error.message);
            
            sendResponse({ 
                action: "block",
                filename: request.filename,
                error: error.message
            });
        });

        return true;
    }
});
