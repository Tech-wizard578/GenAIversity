import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';
// Import the Vertex AI SDK classes
import { VertexAI } from '@google-cloud/vertexai'; // <--- Change this

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
// We don't need GEMINI_API_KEY for Vertex AI SDK with ADC
// const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// --- Initialize Vertex AI SDK --- // <--- Modified section
// *** Replace with your actual Project ID and Location ***
const PROJECT_ID = 'genaiversity';
const LOCATION = 'us-central1'; // Recommended for India

const vertex_ai = new VertexAI({ project: PROJECT_ID, location: LOCATION });
const model = 'gemini-2.5-flash-image'; // Or 'gemini-1.5-flash-latest' if preferred

const generativeVisionModel = vertex_ai.preview.getGenerativeModel({
    model: model,
    // generation_config: { ... optional },
    // safety_settings: { ... optional },
});
console.log(`✅ Vertex AI SDK initialized. Project: ${PROJECT_ID}, Location: ${LOCATION}, Model: ${model}`);

// --- Routes ---

/**
 * Route for analyzing symptoms with OpenRouter
 * (Keep your existing OpenRouter code here)
 */
app.post('/api/analyze-symptoms', async (req, res) => {
  // ... (Your existing OpenRouter symptom analysis code)
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
            model: 'mistralai/mistral-7b-instruct:free', // Using a potentially more common free model
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
 * Route for analyzing images with Gemini using Vertex AI SDK
 * Listens on: /api/analyze-image
 */
app.post('/api/analyze-image', async (req, res) => { // <--- Modified
    try {
        const { image } = req.body; // Expecting Base64 image string

        // Basic validation
        if (!image) {
            return res.status(400).json({ result: 'No image data provided.' });
        }

        // Prompt for the model
        const textPart = {
            text: 'Describe the visual features present in this image. If it appears to be a medical image (like a skin condition), describe what you see visually without making a diagnosis or suggesting treatment. Mention patterns, colors, or textures observed.'
        };

        // Prepare the image part for Vertex AI SDK
        const imagePart = {
            inlineData: {
                mimeType: 'image/jpeg', // Adjust if needed
                data: image // Assumes pure Base64 data (no prefix)
            }
        };

        const request = {
            contents: [{ role: 'user', parts: [textPart, imagePart] }],
        };

        console.log("⏳ Calling Vertex AI Gemini API for image analysis...");
        // Use generateContentStream for potentially faster responses or generateContent for single response
        const streamingResp = await generativeVisionModel.generateContentStream(request);
        // Aggregate stream response (alternative: process stream chunks)
        const aggregatedResponse = await streamingResp.response;
        const text = aggregatedResponse.candidates[0].content.parts[0].text;

        console.log("✅ Vertex AI Gemini API response received.");

        res.json({ result: text });

    } catch (error) {
        console.error('Vertex AI SDK (backend) Error:', error);
        // Provide more context in the error message
        let errorMessage = 'Error analyzing image via Vertex AI.';
         if (error.message.includes('permission denied') || error.message.includes('PERMISSION_DENIED')){
             errorMessage = 'Permission Denied. Check if the Vertex AI API is enabled and your ADC credentials have the correct roles (e.g., Vertex AI User).';
         } else if (error.message.includes('quota') || error.details?.includes('quota')) {
             errorMessage = 'Quota exceeded. Please check your Google Cloud project quotas for Vertex AI.';
         } else if (error.message.includes('Invalid argument') || error.message.includes('400')) {
             errorMessage = 'Invalid request (possibly bad image data/format or invalid model name/location).';
         } else if (error.message.includes('Service accounts')) {
             errorMessage = 'Authentication error related to service accounts. Ensure ADC is correctly configured.';
         }
        res.status(500).json({ result: errorMessage });
    }
});

/**
 * Route for dynamic doctor search using OpenRouter AI
 * (Keep your existing find-doctors code here)
 */
app.post('/api/find-doctors', async (req, res) => {
  // ... (Your existing find-doctors code)
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
            model: 'mistralai/mistral-7b-instruct:free', // Consistent free model
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
        console.log("Raw Find Doctors AI Text:", aiText); // Log raw response for debugging

        try {
            // Attempt to extract JSON, removing potential markdown fences
             const jsonMatch = aiText.match(/```json\s*([\s\S]*?)\s*```|(\[[\s\S]*\])/);
             let jsonStr = null;

             if (jsonMatch) {
                // Prioritize explicit JSON block, otherwise try finding array directly
                jsonStr = jsonMatch[1] || jsonMatch[2];
             } else if (aiText.trim().startsWith('[')) {
                // Fallback if no markdown fences but looks like JSON array
                jsonStr = aiText.trim();
             }

             if (jsonStr) {
                doctorsList = JSON.parse(jsonStr);
             } else {
                 console.warn("Could not extract JSON from Find Doctors AI response.");
                 // Attempt to provide a fallback text message if parsing fails badly
                 doctorsList = [{ name: "AI Response (Could not parse as JSON)", specialty: aiText.substring(0, 100) + '...' , note: "Check backend logs for full response." }];
             }

        } catch (jsonErr) {
            console.error('Find Doctors JSON Parsing Error:', jsonErr);
            // Fallback: Provide the raw text wrapped in a structure the frontend might handle
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