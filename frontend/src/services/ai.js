import axios from 'axios';

/**
 * Calls the Vite proxy for symptom analysis.
 * Vite forwards this to: http://localhost:5000/api/analyze-symptoms
 */
export const analyzeSymptoms = async (symptoms) => {
  try {
    const response = await axios.post(
      '/api/analyze-symptoms', 
      {
        symptoms: symptoms 
      }
    );
    // Gets the result from the { result: ... } object
    return response.data.result; 
  } catch (error) {
    console.error('API Proxy Error (Symptoms):', error);
    return 'Could not connect to the AI service. (Check backend for errors)';
  }
};

/**
 * Calls the Vite proxy for image analysis.
 * Vite forwards this to: http://localhost:5000/api/analyze-image
 */
export const analyzeImage = async (imageBase64) => {
  try {
    const response = await axios.post(
      '/api/analyze-image',
      {
        // This is the corrected line with the typo fixed
        image: imageBase64.split(',')[1] 
      }
    );
    // Gets the result from the { result: ... } object
    return response.data.result;
  } catch (error) {
    console.error('API Proxy Error (Image):', error);
    return 'Unable to analyze image. (Check backend for errors)';
  }
};