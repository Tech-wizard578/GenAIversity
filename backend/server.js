import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';
// Import the Vertex AI SDK classes
import { VertexAI } from '@google-cloud/vertexai';

// Initialize environment variables from .env file
dotenv.config();

// Create the Express application
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
    origin: 'http://localhost:3000', // Your frontend URL
    credentials: true
}));
app.use(express.json({ limit: '10mb' })); // Increased limit for base64 images

// --- Load API Keys ---
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// --- Initialize Vertex AI SDK ---
const PROJECT_ID = 'genaiversity'; // Your Google Cloud Project ID
const LOCATION = 'us-central1';   // Region with likely model availability
const model = 'gemini-2.5-flash-image'; // Specific stable vision model

let generativeVisionModel;
try {
    const vertex_ai = new VertexAI({ project: PROJECT_ID, location: LOCATION });
    generativeVisionModel = vertex_ai.preview.getGenerativeModel({
        model: model,
    });
    console.log(`✅ Vertex AI SDK initialized. Project: ${PROJECT_ID}, Location: ${LOCATION}, Model: ${model}`);
} catch (error) {
    console.error(`⛔️ Failed to initialize Vertex AI SDK: ${error.message}`);
    process.exit(1); // Exit if SDK initialization fails
}

// --- Routes ---

/**
 * Route for analyzing symptoms with OpenRouter
 */
app.post('/api/analyze-symptoms', async (req, res) => {
    const { symptoms } = req.body;
    // Basic validation
    if (!symptoms) {
        return res.status(400).json({ result: 'No symptoms provided.' });
    }
    if (!OPENROUTER_API_KEY) {
         console.error('⛔️ OpenRouter API Key is missing!');
         return res.status(500).json({ result: 'Server configuration error.' });
    }

    try {
        const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
            model: 'mistralai/mistral-7b-instruct:free',
            messages: [
                {
                    role: 'system',
                    content: 'You are a helpful medical assistant. Analyze the user\'s symptoms and provide general guidance and potential next steps. Do NOT provide a diagnosis. Advise the user to consult a healthcare professional.'
                },
                {
                    role: 'user',
                    content: `Analyze these symptoms: ${symptoms}`
                }
            ]
        }, {
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'http://localhost:3000',
                'X-Title': 'MediMind AI'
            }
        });
        res.json({ result: response.data.choices[0].message.content });
    } catch (error) {
        console.error('OpenRouter API (backend) Error:', error?.response?.data || error.message);
        res.status(500).json({ result: 'Sorry, unable to analyze symptoms at the moment. Please try again later.' });
    }
});

/**
 * Route for analyzing images with Gemini using Vertex AI SDK, incorporating symptoms
 */
app.post('/api/analyze-image', async (req, res) => {
    try {
        const { image, symptoms } = req.body; // Expecting Base64 image string AND symptoms text

        // Basic validation
        if (!image) {
            return res.status(400).json({ result: 'No image data provided.' });
        }
        // Symptoms are optional but helpful for the prompt
        const reportedSymptoms = symptoms || "No specific symptom reported, analyze the image visually.";

        // --- Refined Prompt ---
        const promptText = `User reports symptom: "${reportedSymptoms}". Describe the key visual features in the attached image (like color, texture, shape, pattern) without making a diagnosis. Based on these visual features AND the reported symptom, provide general information about what kinds of conditions *might* look similar visually or be associated with such symptoms. Crucially, emphasize that this is not a diagnosis and the user MUST consult a qualified healthcare professional for any medical advice or diagnosis. Do NOT suggest specific treatments.`;

        const textPart = { text: promptText };

        // Prepare the image part for Vertex AI SDK
        const imagePart = {
            inlineData: {
                mimeType: 'image/jpeg', // Adjust if frontend might send PNG, etc.
                data: image // Assumes pure Base64 data (no prefix, handled by frontend)
            }
        };

        // Construct the request for the model
        const request = {
            contents: [{ role: 'user', parts: [textPart, imagePart] }],
        };

        console.log("⏳ Calling Vertex AI Gemini API for image analysis...");
        const streamingResp = await generativeVisionModel.generateContentStream(request);
        const aggregatedResponse = await streamingResp.response;

        // Error handling for blocked responses (safety, etc.)
        if (!aggregatedResponse.candidates || aggregatedResponse.candidates.length === 0 || !aggregatedResponse.candidates[0].content?.parts) {
            console.warn('Gemini response blocked or empty:', JSON.stringify(aggregatedResponse));
             // Check finishReason if available
             const finishReason = aggregatedResponse?.candidates?.[0]?.finishReason;
             const safetyRatings = aggregatedResponse?.promptFeedback?.safetyRatings;
             let blockMessage = 'Analysis generated no content.';
             if (finishReason === 'SAFETY') {
                 blockMessage = 'Analysis blocked due to safety settings.';
                 // Optionally log safetyRatings here if needed
                 console.warn('Safety Ratings:', safetyRatings);
             } else if (finishReason) {
                 blockMessage = `Analysis stopped unexpectedly (Reason: ${finishReason}).`;
             }
            return res.status(500).json({ result: `${blockMessage} Please try again or rephrase.` });
        }

        const text = aggregatedResponse.candidates[0].content.parts[0].text;
        console.log("✅ Vertex AI Gemini API response received.");

        res.json({ result: text });

    } catch (error) {
        console.error('Vertex AI SDK (backend) Error:', error);
        let errorMessage = 'Error analyzing image via Vertex AI.';
         if (error.message.includes('permission denied') || error.message.includes('PERMISSION_DENIED')){
             errorMessage = 'Permission Denied. Check API enablement and ADC credentials/roles (e.g., Vertex AI User).';
         } else if (error.message.includes('quota') || error.details?.includes('quota')) {
             errorMessage = 'Quota exceeded. Check Google Cloud project quotas for Vertex AI.';
         } else if (error.message.includes('Invalid argument') || error.message.includes('400')) {
             errorMessage = 'Invalid request (check image data/format, model name, location).';
         } else if (error.message.includes('404 Not Found') || error.status === 'NOT_FOUND'){
              errorMessage = `Model '${model}' not found in location '${LOCATION}'. Check model name/availability.`;
         } else if (error.message.includes('authenticate') || error.message.includes('Could not load the default credentials')) {
             errorMessage = 'Authentication failed. Ensure ADC is set up correctly (run `gcloud auth application-default login`) and the GOOGLE_APPLICATION_CREDENTIALS env var might be needed.';
         } else if (error.message.includes('billing') || error.message.includes('BILLING_DISABLED')) {
             errorMessage = 'Billing is not enabled for this project. Please enable billing in the Google Cloud Console.';
         }
        res.status(500).json({ result: errorMessage });
    }
});

/**
 * Route for dynamic doctor search using OpenRouter AI
 */
app.post('/api/find-doctors', async (req, res) => {
    const { query, location } = req.body;
     // Basic validation
    if (!query) {
        return res.status(400).json({ doctors: [], error: 'Search query is required.' });
    }
     if (!OPENROUTER_API_KEY) {
         console.error('⛔️ OpenRouter API Key is missing!');
         return res.status(500).json({ doctors: [], error: 'Server configuration error.' });
    }

    try {
        const aiPrompt = `
            You are a helpful assistant designed to find doctors based on user queries.
            User's location: ${location || 'Not provided'}
            User's request: "${query}"

            Provide a list of 3-5 relevant doctors or clinics based *only* on the request and location. Include Name, Specialty, and optionally a brief note on relevance.
            **Do not invent details like distance, ratings, or availability unless specifically requested AND you have access to real-time data (which you likely don't). If you cannot provide real data, state that clearly.**

            Structure your reply in strict JSON format as an array of objects like this example:
            [
              {
                "name": "Example Clinic - General Practice",
                "specialty": "General Practice",
                "note": "General health checkups."
              },
              {
                "name": "Dr. Smith - Dermatologist",
                "specialty": "Dermatology",
                "note": "Specializes in skin conditions."
              }
            ]
            If no relevant doctors can be found or the request is unclear, return an empty array [].
        `;

        const openRouterResponse = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
            model: 'mistralai/mistral-7b-instruct:free',
            messages: [
                { role: 'user', content: aiPrompt }
            ]
        }, {
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'http://localhost:3000',
                'X-Title': 'MediMind AI'
            }
        });

        let doctorsList = [];
        const aiText = openRouterResponse.data.choices[0].message.content;
        console.log("Raw Find Doctors AI Text:", aiText);

        try {
             const jsonMatch = aiText.match(/```json\s*([\s\S]*?)\s*```|(\[[\s\S]*\])/);
             let jsonStr = null;
             if (jsonMatch) {
                jsonStr = jsonMatch[1] || jsonMatch[2];
             } else if (aiText.trim().startsWith('[')) {
                jsonStr = aiText.trim();
             }

             if (jsonStr) {
                doctorsList = JSON.parse(jsonStr);
             } else {
                 console.warn("Could not extract JSON from Find Doctors AI response.");
                 doctorsList = [{ name: "AI Response (Could not parse as JSON)", specialty: aiText.substring(0, 100) + '...' , note: "Check backend logs for full response." }];
             }
        } catch (jsonErr) {
            console.error('Find Doctors JSON Parsing Error:', jsonErr);
             doctorsList = [{ name: "AI Response (Parsing Error)", specialty: aiText.substring(0, 100) + '...' , note: "Check backend logs for details." }];
        }

        res.json({ doctors: doctorsList });
    } catch (error) {
        console.error('Find Doctors (backend) Error:', error?.response?.data || error.message);
        res.status(500).json({ doctors: [], error: 'Unable to process doctor search at this time.' });
    }
});

// --- Global Error Handler ---
app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err.stack);
  res.status(500).send('Something broke!');
});

// --- Start the server ---
app.listen(PORT, () => {
    console.log(`✅ Backend server running on http://localhost:${PORT}`);
});