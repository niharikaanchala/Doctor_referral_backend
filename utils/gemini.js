// utils/gemini.js
import dotenv from "dotenv";
import axios from "axios";
dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export const analyzeWithGemini = async ({ user, reports, healthIssues }) => {
const prompt = `
You are a senior **Interventional Radiology** AI assistant.

You will be provided with:
- A patient's demographic and medical background
- Their described health issues
- A set of medical report URLs (images or PDFs hosted on Cloudinary), grouped by report name

Your tasks:
1. For each **report group**, simulate the typical data inside (e.g., CBC, LFT, ECG, Chest X-ray, CT, MRI, Doppler, Angiography).
2. Provide a **detailed medical interpretation** of each report group with a special focus on **radiology and interventional radiology insights**, based on its name and list of URLs.
3. Include the URLs of the files in each group under a key called "reportUrls".
4. Identify and explain any abnormalities or concerning findings (especially imaging-related).
5. Mark critical findings using "⚠️ WARNING" at the beginning of the line.
6. After analyzing all individual reports, provide an **overall summary** of findings — this is mandatory.
7. Finally, provide **professional recommendations for the attending doctor**, emphasizing interventional radiology perspectives (e.g., whether image-guided biopsy, drainage, embolization, stenting, or further imaging is advisable).

Respond strictly using the following **JSON format**, and do not include any explanations or content outside the JSON:

{
  "patientInfo": {
    "name": "${user.name}",
    "age": ${user.age},
    "gender": "${user.gender}",
    "bloodPressure": "${user.bp?.value || "Not mentioned"}",
    "diabetic": "${user.diabetic?.value || "Not mentioned"}",
    "hyperthyroidism": "${user.hyperthyroidism?.value || "Not mentioned"}"
  },
  "reportAnalyses": [
    ${reports.map((r, i) => {
        return `{
        "groupName": "${r.name}",
        "reportUrls": [${r.files.map(f => `"${f}"`).join(", ")}],
        "analysis": "Interpret the files in this group with a radiology perspective:\\n${r.files.join('\\n')}",
        "warnings": []
      }`;
    }).join(",\n    ")}
  ],
  "overallSummary": "Provide a clinically sound summary of the patient's condition with emphasis on radiology findings and possible interventional implications.",
  "doctorRecommendations": [
    "Provide interventional radiology advice, possible procedures, further imaging, referrals, and follow-ups the doctor should consider."
  ]
}
`;  


    try {
        const response = await axios.post(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
            {
                contents: [
                    {
                        parts: [{ text: prompt }]
                    }
                ]
            },
            {
                headers: {
                    "Content-Type": "application/json",
                    "X-goog-api-key": GEMINI_API_KEY
                }
            }
        );

        const rawText = response.data.candidates?.[0]?.content?.parts?.[0]?.text;

        // Attempt to parse JSON from Gemini output
        const jsonStart = rawText.indexOf('{');
        const jsonEnd = rawText.lastIndexOf('}');
        const jsonText = rawText.slice(jsonStart, jsonEnd + 1);
        const parsed = JSON.parse(jsonText);
        console.log("parsed Data : \n")
        console.log(parsed)
        return parsed;
    } catch (error) {
        console.error("Gemini API error:", error?.response?.data || error.message);
        throw new Error("Failed to analyze patient with Gemini AI.");
    }
};
