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
      // Using a free model to fix the 402 billing error
      model: 'mistralai/mistral-7b-instruct:free', 
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
    
    // Send response back in { result: ... } format
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
    const { image } = req.body; // Get the base64 data

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
    
    // Send response back in { result: ... } format
    res.json({ result: response.data.candidates[0].content.parts[0].text });

  } catch (error) {
    console.error('Gemini API (backend) Error:', error.response ? error.response.data : error.message);
    res.status(500).json({ result: 'Error analyzing image' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`✅ Backend server running on http://localhost:${PORT}`);
});