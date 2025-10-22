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
    console.error('API Proxy Error (Symptoms):', error.response ? error.response.data : error.message);
    // More informative error for the user
    return `Could not connect to the AI service. Error: ${error.response ? error.response.status : 'Network Error'}. (Check backend logs)`;
  }
};

/**
 * Calls the Vite proxy for image analysis, including symptoms.
 * Vite forwards this to: http://localhost:5000/api/analyze-image
 * @param {string} imageBase64 - The base64 encoded image string (with prefix).
 * @param {string} symptoms - The symptom text entered by the user.
 * @returns {string} - The analysis result or an error message.
 */
export const analyzeImage = async (imageBase64, symptoms) => { // Added 'symptoms' parameter
  // Basic check for image data
  if (!imageBase64) {
    console.error('analyzeImage called without image data.');
    return 'No image provided for analysis.';
  }

  try {
    // Split prefix if it exists, otherwise use the whole string (handles potential direct base64)
    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

    const response = await axios.post(
      '/api/analyze-image',
      {
        image: base64Data, // Send only the base64 data
        symptoms: symptoms   // Send the symptoms text
      }
    );
    return response.data.result;
  } catch (error) {
    console.error('API Proxy Error (Image):', error.response ? error.response.data : error.message);
     // More informative error for the user
    const errorMsg = error.response?.data?.result || `HTTP ${error.response?.status || 'Network Error'}`;
    return `Unable to analyze image. ${errorMsg} (Check backend logs)`;
  }
};

/**
 * Calls the Vite proxy for dynamic doctor finding.
 * Vite forwards this to: http://localhost:5000/api/find-doctors
 * @param {string} query - Doctor specialty or search keyword, e.g. 'cardiologist'
 * @param {string} location - User's city, address, or coordinates
 * @returns {Array|String} - Array of doctor objects OR error message string (or empty array on error)
 */
export const findDoctors = async (query, location) => {
  try {
    const response = await axios.post(
      '/api/find-doctors',
      { query, location }
    );
    // Return doctors data if available, otherwise potentially an error string from backend
    return response.data.doctors || response.data.error || [];
  } catch (error) {
    console.error('API Proxy Error (Find Doctors):', error.response ? error.response.data : error.message);
    // Return an empty array or a user-friendly error message based on backend response
    return error.response?.data?.error || `Failed to find doctors (HTTP ${error.response?.status || 'Network Error'}).`;
  }
};