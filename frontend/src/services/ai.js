import axios from 'axios';

/**
 * Calls the Vite proxy for symptom analysis.
 * Vite forwards this to: http://localhost:5000/api/analyze-symptoms
 */
export const analyzeSymptoms = async (symptoms) => {
  try {
    const response = await axios.post(
      '/api/analyze-symptoms', 
      { symptoms }
    );
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
      { image: imageBase64.split(',')[1] }
    );
    return response.data.result;
  } catch (error) {
    console.error('API Proxy Error (Image):', error);
    return 'Unable to analyze image. (Check backend for errors)';
  }
};

/**
 * NEW: Calls the Vite proxy for dynamic doctor finding.
 * Vite forwards this to: http://localhost:5000/api/find-doctors
 * @param {string} query - Doctor specialty or search keyword, e.g. 'cardiologist'
 * @param {string} location - User's city, address, or coordinates
 * @returns {Array|String} - Array of doctor objects OR error message
 */
export const findDoctors = async (query, location) => {
  try {
    const response = await axios.post(
      '/api/find-doctors',
      { query, location }
    );
    return response.data.doctors; // Either array of doctors or raw string
  } catch (error) {
    console.error('API Proxy Error (Find Doctors):', error);
    return [];
  }
};
