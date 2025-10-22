import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';

// Initialize environment variables from .env file
dotenv.config();

// Create the Express application
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '10mb' })); // For images

// --- Load API Keys ---
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

/**
 * Route for analyzing symptoms with OpenRouter
 * Listens on: /api/analyze-symptoms
 */
app.post('/api/analyze-symptoms', async (req, res) => {
  const { symptoms } = req.body;
  try {
    const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
      model: 'tngtech/deepseek-r1t2-chimera:free', 
      messages: [
        {
          role: 'user',
          content: `As a medical assistant, analyze these symptoms and provide guidance: ${symptoms}`
        }
      ]
    }, {
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'MediMind AI'
      }
    });
    res.json({ result: response.data.choices[0].message.content });
  } catch (error) {
    console.error('OpenRouter API (backend) Error:', error?.response?.data || error.message);
    res.status(500).json({ result: 'Unable to analyze symptoms. Please try again.' });
  }
});

/**
 * Route for analyzing images with Gemini
 * Listens on: /api/analyze-image
 */
app.post('/api/analyze-image', async (req, res) => {
  try {
    const { image } = req.body;
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [
          {
            parts: [
              { text: 'Analyze this medical image and describe any visible symptoms or conditions. Provide a preliminary assessment.' },
              { inline_data: { mime_type: 'image/jpeg', data: image } }
            ]
          }
        ]
      }
    );
    res.json({ result: response.data.candidates[0].content.parts[0].text });
  } catch (error) {
    console.error('Gemini API (backend) Error:', error.response ? error.response.data : error.message);
    res.status(500).json({ result: 'Error analyzing image' });
  }
});

/**
 * NEW: Route for dynamic doctor search using OpenRouter AI
 * Listens on: /api/find-doctors
 * Expects: { query, location } in POST body
 */
app.post('/api/find-doctors', async (req, res) => {
  const { query, location } = req.body;
  try {
    // Construct an AI prompt with user location and search query
    const aiPrompt = `
      You are a healthcare assistant helping users find nearby doctors.
      Given the user's location (${location || 'unknown'}) and their request: "${query}",
      provide a list of 3-5 recommended doctors, including:
      - Name
      - Specialty
      - Approximate distance (if possible)
      - Ratings (if possible)
      - Next available appointment

      Structure your reply in strict JSON format as an array of objects:
      [
        {
          "name": "Dr. Example",
          "specialty": "Specialty",
          "distance": "3.2 km",
          "rating": "4.8",
          "available": "Tomorrow 9:00 AM"
        }
      ]
      If you cannot access real doctor data, provide plausible sample data.
    `;

    const gptResponse = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
      model: 'tngtech/deepseek-r1t2-chimera:free',
      messages: [
        { role: 'user', content: aiPrompt }
      ]
    }, {
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'MediMind AI'
      }
    });

    // Try to parse the AI's reply as JSON—do some cleanup if necessary
    let doctorsList = [];
    const aiText = gptResponse.data.choices[0].message.content;
    try {
      // Some models include markdown—strip if needed
      const jsonRegex = /``````|(\[.*?\])/;
      const match = jsonRegex.exec(aiText);
      const jsonStr = match ? (match[1] || match[2]) : aiText;
      doctorsList = JSON.parse(jsonStr);
    } catch (jsonErr) {
      // Fallback: send raw text response, frontend can handle formatting
      doctorsList = aiText;
    }

    res.json({ doctors: doctorsList });
  } catch (error) {
    console.error('Find Doctors (backend) Error:', error?.response?.data || error.message);
    res.status(500).json({ doctors: [], error: 'Unable to process doctor search.' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`✅ Backend server running on http://localhost:${PORT}`);
});
