import React, { useState, useEffect } from 'react';
import { Camera, Mic, MessageSquare, Calendar, Pill, User, TrendingUp, Phone, Send, X, CheckCircle, AlertCircle, Sun, Moon } from 'lucide-react';
import { analyzeSymptoms, analyzeImage } from './services/ai';
import { 
  auth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  db,
  collection,
  addDoc,
  query,
  where,
  onSnapshot,
  orderBy,
  serverTimestamp,
  doc, // Import doc
  updateDoc, // Import updateDoc
  deleteDoc // Import deleteDoc (optional for later)
} from './firebase'; 

const MediMindAI = () => {
  const [activeTab, setActiveTab] = useState('symptom-checker');
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [uploadedImage, setUploadedImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [language, setLanguage] = useState('en');
  const [theme, setTheme] = useState('light');
  const [user, setUser] = useState(null);
  
  // Use Firestore for medications now, initial state is empty
  const [medications, setMedications] = useState([]); 

  // HealthTimeline still uses local state for now
  const [healthTimeline, setHealthTimeline] = useState([
    { month: 'Oct', risk: 20, status: 'good' },
    { month: 'Nov', risk: 25, status: 'good' },
    { month: 'Dec', risk: 30, status: 'moderate' },
    { month: 'Jan', risk: 35, status: 'moderate' },
    { month: 'Feb', risk: 28, status: 'good' },
    { month: 'Mar', risk: 22, status: 'good' }
  ]);

  // Listen for auth state changes & load data
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      let unsubMessages = () => {}; // Initialize unsub functions
      let unsubMeds = () => {};

      if (currentUser) {
        console.log("User logged in:", currentUser);

        // --- Load Messages ---
        const messagesQuery = query(
          collection(db, "messages"),
          where("uid", "==", currentUser.uid),
          orderBy("timestamp", "asc")
        );
        unsubMessages = onSnapshot(messagesQuery, (querySnapshot) => {
          const userMessages = [];
          querySnapshot.forEach((doc) => {
            userMessages.push({ ...doc.data(), id: doc.id });
          });
          setMessages(userMessages);
        });

        // --- Load Medications ---
        const medsQuery = query(
          collection(db, "medications"),
          where("uid", "==", currentUser.uid),
          orderBy("time", "asc") // Optional: order by time
        );
        unsubMeds = onSnapshot(medsQuery, (querySnapshot) => {
          const userMeds = [];
          querySnapshot.forEach((doc) => {
            userMeds.push({ ...doc.data(), id: doc.id }); 
          });
          setMedications(userMeds);
        });
        
        // TODO: Load health timeline data
        
      } else {
        // User logged out, clear data
        console.log("User logged out");
        setMessages([]);
        setMedications([]); // Clear medications on logout
        // setHealthTimeline([]); // etc.
      }
      
      // Return cleanup function for listeners
      return () => {
        unsubMessages();
        unsubMeds();
      };
    });
    // Cleanup auth subscription on unmount
    return () => unsubscribeAuth();
  }, []); // Empty dependency array means this runs once on mount

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
  };

  const handleSignIn = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Error signing in with Google:", error);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  const handleSendMessage = async () => {
    // ... (no changes needed in handleSendMessage) ...
    if (!inputText.trim() && !uploadedImage) return;
    if (!user) {
      alert("Please sign in to use the chat.");
      return;
    }

    const userMessage = {
      uid: user.uid,
      type: 'user',
      text: inputText,
      image: uploadedImage,
      timestamp: serverTimestamp() // Use server timestamp
    };
    
    // Save user message to Firestore
    try {
      await addDoc(collection(db, "messages"), userMessage);
    } catch (error) {
      console.error("Error saving message:", error);
      return;
    }

    setLoading(true);
    setInputText('');
    setUploadedImage(null);
    
    let responseText = '';
    try {
      if (uploadedImage) {
        const imageBase64 = uploadedImage;
        responseText = await analyzeImage(imageBase64);
      } else {
        responseText = await analyzeSymptoms(inputText);
      }
    } catch (error) {
      console.error("AI API Error:", error);
      responseText = "Sorry, I encountered an error connecting to the AI service. Please check your API keys and try again.";
    }
    
    setLoading(false);

    const aiMessage = {
      uid: user.uid,
      type: 'ai',
      text: responseText,
      timestamp: serverTimestamp() // Use server timestamp
    };

    // Save AI response to Firestore
    try {
      await addDoc(collection(db, "messages"), aiMessage);
    } catch (error) {
      console.error("Error saving AI response:", error);
    }
  };

  const handleVoiceInput = () => {
    // ... (no changes needed) ...
    setIsListening(!isListening);
    if (!isListening) {
      setTimeout(() => {
        setInputText("I have been experiencing fever and headache since yesterday");
        setIsListening(false);
      }, 2000);
    }
  };

  const handleImageUpload = (e) => {
    // ... (no changes needed) ...
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setUploadedImage(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  // --- Updated toggleMedication ---
  const toggleMedication = async (id, currentTakenStatus) => {
    if (!user) return; // Should not happen if UI is disabled, but good practice
    
    const medDocRef = doc(db, "medications", id);
    try {
      await updateDoc(medDocRef, {
        taken: !currentTakenStatus // Toggle the status
      });
      // No need to call setMedications, onSnapshot will update the UI
    } catch (error) {
      console.error("Error updating medication status:", error);
    }
  };
  // --------------------------------

  // --- Add New Medication Handler ---
  const handleAddMedication = async () => {
    if (!user) return;

    const medName = prompt("Enter medication name:");
    const medTime = prompt("Enter time (e.g., 09:00 AM):");

    if (medName && medTime) {
      try {
        await addDoc(collection(db, "medications"), {
          uid: user.uid,
          name: medName,
          time: medTime,
          taken: false // Default to not taken
        });
        // onSnapshot will update the UI
      } catch (error) {
        console.error("Error adding medication:", error);
      }
    }
  };
  // ---------------------------------

  const formatTimestamp = (fbTimestamp) => {
    if (!fbTimestamp) {
      return new Date().toLocaleTimeString();
    }
    // Check if it's already a Date object (might happen with local state before saving)
    if (fbTimestamp instanceof Date) {
        return fbTimestamp.toLocaleTimeString();
    }
    // Check if it has seconds and nanoseconds properties (Firestore Timestamp)
    if (fbTimestamp.seconds) {
        return new Date(fbTimestamp.seconds * 1000).toLocaleTimeString();
    }
    // Fallback if it's an unexpected format
    return 'Invalid Date';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 dark:from-gray-900 dark:via-black dark:to-gray-900">
      {/* Header */}
      {/* ... (no changes needed in header) ... */}
      <div className="bg-gradient-to-r from-blue-600 to-green-600 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-white/20 p-2 rounded-lg backdrop-blur">
                <MessageSquare className="w-8 h-8" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">MediMind AI</h1>
                <p className="text-sm text-blue-100">Your Healthcare Companion</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <select 
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="bg-white/20 backdrop-blur px-3 py-2 rounded-lg text-sm dark:bg-gray-700/50"
              >
                <option value="en">English</option>
                <option value="hi">हिंदी</option>
                <option value="te">తెలుగు</option>
              </select>
              <button onClick={toggleTheme} className="bg-white/20 backdrop-blur p-2 rounded-lg hover:bg-white/30 transition">
                {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
              </button>
              
              {user ? (
                <button 
                  onClick={handleSignOut} 
                  className="bg-white/20 backdrop-blur px-2 py-1 rounded-lg hover:bg-white/30 transition flex items-center gap-2"
                >
                  <img src={user.photoURL} alt={user.displayName} className="w-6 h-6 rounded-full" />
                  <span className="text-xs font-medium hidden md:block">Sign Out</span>
                </button>
              ) : (
                <button 
                  onClick={handleSignIn} 
                  className="bg-white/20 backdrop-blur p-2 rounded-lg hover:bg-white/30 transition flex items-center gap-2"
                >
                  <User className="w-5 h-5" />
                  <span className="text-xs font-medium hidden md:block">Sign In</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>


      {/* Navigation Tabs */}
      {/* ... (no changes needed in navigation) ... */}
            <div className="bg-white shadow-sm border-b sticky top-0 z-10 dark:bg-gray-800 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-1 overflow-x-auto">
            {[
              { id: 'symptom-checker', icon: MessageSquare, label: 'Symptom Checker' },
              { id: 'medication', icon: Pill, label: 'Medications' },
              { id: 'health-timeline', icon: TrendingUp, label: 'Health Timeline' },
              { id: 'find-doctor', icon: Phone, label: 'Find Doctor' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                disabled={!user && tab.id !== 'symptom-checker'}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 transition whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600 bg-blue-50 dark:border-blue-400 dark:text-blue-300 dark:bg-gray-700'
                    : 'border-transparent text-gray-600 hover:text-blue-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:text-blue-400 dark:hover:bg-gray-700/50'
                } ${!user && tab.id !== 'symptom-checker' ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <tab.icon className="w-4 h-4" />
                <span className="font-medium text-sm">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>


      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        
        {/* Sign in prompt */}
        {/* ... (no changes needed) ... */}
        {!user && activeTab !== 'symptom-checker' && (
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100 dark:bg-gray-800 dark:border-gray-700 text-center">
            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">Please Sign In</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">You need to be logged in to view this section.</p>
            <button 
              onClick={handleSignIn} 
              className="bg-gradient-to-r from-blue-600 to-green-600 text-white py-2 px-6 rounded-lg font-medium hover:from-blue-700 hover:to-green-700 transition"
            >
              Sign In with Google
            </button>
          </div>
        )}


        {/* Symptom Checker Tab */}
        {/* ... (Only change is using formatTimestamp for display) ... */}
         {activeTab === 'symptom-checker' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100 dark:bg-gray-800 dark:border-gray-700">
              {/* ... header ... */}
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-gradient-to-r from-blue-600 to-green-600 p-3 rounded-lg">
                  <MessageSquare className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">AI Symptom Checker</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Describe your symptoms in any language</p>
                </div>
              </div>

              {/* Chat Messages */}
              <div className="bg-gray-50 rounded-lg p-4 h-96 overflow-y-auto mb-4 space-y-3 dark:bg-gray-900">
                {/* ... sign in / welcome messages ... */}
                 {!user && messages.length === 0 && (
                  <div className="text-center py-12">
                    <User className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                    <p className="text-gray-500 dark:text-gray-400 mb-2">Welcome to MediMind AI</p>
                    <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">Please sign in to start your consultation.</p>
                    <button 
                      onClick={handleSignIn} 
                      className="bg-gradient-to-r from-blue-600 to-green-600 text-white py-2 px-6 rounded-lg font-medium hover:from-blue-700 hover:to-green-700 transition"
                    >
                      Sign In with Google
                    </button>
                  </div>
                )}
                {user && messages.length === 0 && !loading && ( // Added !loading check
                  <div className="text-center py-12">
                    <MessageSquare className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                    <p className="text-gray-500 dark:text-gray-400 mb-2">Hello, {user.displayName}! How can I help you today?</p>
                    <p className="text-sm text-gray-400 dark:text-gray-500">Type your symptoms, upload an image, or use voice input</p>
                  </div>
                )}
                
                {messages.map((msg) => ( // Use msg.id from firestore as key
                  <div key={msg.id} className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-md rounded-lg p-3 ${
                      msg.type === 'user'
                        ? 'bg-gradient-to-r from-blue-600 to-green-600 text-white'
                        : 'bg-white border border-gray-200 text-gray-800 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200'
                    }`}>
                      {msg.image && (
                        <img src={msg.image} alt="Uploaded" className="rounded-lg mb-2 max-w-xs" />
                      )}
                      <p className="text-sm whitespace-pre-line">{msg.text}</p>
                      <p className={`text-xs mt-1 ${msg.type === 'user' ? 'text-blue-100' : 'text-gray-400 dark:text-gray-500'}`}>
                        {formatTimestamp(msg.timestamp)} {/* Use formatter */}
                      </p>
                    </div>
                  </div>
                ))}
                {loading && (
                 // ... loading indicator ...
                  <div className="flex justify-start">
                    <div className="bg-white border border-gray-200 rounded-lg p-3 dark:bg-gray-700 dark:border-gray-600">
                      <div className="flex gap-2">
                        <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-green-600 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                        <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Image Preview */}
              {/* ... (no changes) ... */}
              {uploadedImage && (
                <div className="mb-3 relative inline-block">
                  <img src={uploadedImage} alt="Preview" className="h-20 rounded-lg border-2 border-blue-600" />
                  <button
                    onClick={() => setUploadedImage(null)}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}


              {/* Input Area */}
              {/* ... (no changes) ... */}
               <div className="flex gap-2">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder={user ? "Describe your symptoms..." : "Please sign in to chat"}
                  disabled={!user}
                  className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600 dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400 disabled:opacity-50"
                />
                <label className={`bg-gray-100 p-3 rounded-lg transition dark:bg-gray-700 ${user ? 'hover:bg-gray-200 dark:hover:bg-gray-600 cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}>
                  <Camera className="w-5 h-5 text-gray-700 dark:text-gray-300" />
                  <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" disabled={!user} />
                </label>
                <button
                  onClick={handleVoiceInput}
                  disabled={!user}
                  className={`p-3 rounded-lg transition ${
                    isListening
                      ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse'
                      : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                  } ${user ? 'hover:bg-gray-200 dark:hover:bg-gray-600' : 'opacity-50 cursor-not-allowed'}`}
                >
                  <Mic className="w-5 h-5" />
                </button>
                <button
                  onClick={handleSendMessage}
                  disabled={!user}
                  className="bg-gradient-to-r from-blue-600 to-green-600 text-white p-3 rounded-lg transition hover:from-blue-700 hover:to-green-700 disabled:opacity-50"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>

            </div>

            {/* Quick Actions */}
            {/* ... (no changes needed) ... */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button disabled={!user} className="bg-white rounded-xl shadow p-4 transition border border-gray-100 text-left dark:bg-gray-800 dark:border-gray-700 disabled:opacity-50 disabled:cursor-not-allowed enabled:hover:shadow-lg enabled:dark:hover:bg-gray-700/50">
                <AlertCircle className="w-8 h-8 text-red-500 mb-2" />
                <h3 className="font-semibold text-gray-800 dark:text-gray-100">Emergency</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">Call 108 or find nearest hospital</p>
              </button>
              <button onClick={() => setActiveTab('find-doctor')} disabled={!user} className="bg-white rounded-xl shadow p-4 transition border border-gray-100 text-left dark:bg-gray-800 dark:border-gray-700 disabled:opacity-50 disabled:cursor-not-allowed enabled:hover:shadow-lg enabled:dark:hover:bg-gray-700/50">
                <Phone className="w-8 h-8 text-blue-500 mb-2" />
                <h3 className="font-semibold text-gray-800 dark:text-gray-100">Find Doctor</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">Connect with nearby specialists</p>
              </button>
              <button disabled={!user} className="bg-white rounded-xl shadow p-4 transition border border-gray-100 text-left dark:bg-gray-800 dark:border-gray-700 disabled:opacity-50 disabled:cursor-not-allowed enabled:hover:shadow-lg enabled:dark:hover:bg-gray-700/50">
                <Calendar className="w-8 h-8 text-green-500 mb-2" />
                <h3 className="font-semibold text-gray-800 dark:text-gray-100">Book Appointment</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">Schedule a consultation</p>
              </button>
            </div>
          </div>
        )}

        {/* --- Updated Medication Tracker Tab --- */}
        {user && activeTab === 'medication' && (
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100 dark:bg-gray-800 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-gradient-to-r from-blue-600 to-green-600 p-3 rounded-lg">
                <Pill className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">Medication Tracker</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">Never miss a dose, {user.displayName}</p>
              </div>
            </div>

            <div className="space-y-3">
              {medications.length === 0 && (
                <p className="text-center text-gray-500 dark:text-gray-400">No medications added yet.</p>
              )}
              {medications.map(med => (
                <div key={med.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200 dark:bg-gray-700/50 dark:border-gray-600">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => toggleMedication(med.id, med.taken)} // Pass current status
                      className={`w-12 h-12 rounded-full flex items-center justify-center transition ${
                        med.taken
                          ? 'bg-green-500 hover:bg-green-600'
                          : 'bg-gray-300 hover:bg-gray-400 dark:bg-gray-600 dark:hover:bg-gray-500'
                      }`}
                    >
                      <CheckCircle className="w-6 h-6 text-white" />
                    </button>
                    <div>
                      <h3 className="font-semibold text-gray-800 dark:text-gray-200">{med.name}</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Take at {med.time}</p>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    med.taken
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
                      : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300'
                  }`}>
                    {med.taken ? 'Taken' : 'Pending'}
                  </span>
                  {/* Optional: Add a delete button here */}
                  {/* <button onClick={() => deleteMedication(med.id)}>Delete</button> */}
                </div>
              ))}
            </div>

            <button 
              onClick={handleAddMedication} 
              className="w-full mt-4 bg-gradient-to-r from-blue-600 to-green-600 text-white py-3 rounded-lg font-medium hover:from-blue-700 hover:to-green-700 transition"
            >
              + Add New Medication
            </button>
          </div>
        )}
        {/* ------------------------------------- */}


        {/* Health Timeline Tab */}
        {/* ... (no changes needed yet) ... */}
         {user && activeTab === 'health-timeline' && (
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100 dark:bg-gray-800 dark:border-gray-700">
            {/* ... (UI for health timeline) ... */}
             <div className="flex items-center gap-3 mb-6">
              <div className="bg-gradient-to-r from-blue-600 to-green-600 p-3 rounded-lg">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">Health Timeline</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">Your predictive health insights</p>
              </div>
            </div>
             <div className="space-y-4">
              <div className="bg-gradient-to-r from-green-50 to-blue-50 p-4 rounded-lg border border-green-200 dark:bg-gray-700/50 dark:border-gray-600">
                <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">Current Health Score: 85/100</h3>
                <div className="w-full bg-gray-200 rounded-full h-3 dark:bg-gray-600">
                  <div className="bg-gradient-to-r from-green-500 to-blue-500 h-3 rounded-full" style={{ width: '85%' }}></div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                {healthTimeline.map((month, idx) => (
                  <div key={idx} className="text-center">
                    <div className={`h-24 rounded-lg mb-2 flex items-end justify-center p-2 ${
                      month.status === 'good' ? 'bg-green-100 dark:bg-green-900/30' :
                      month.status === 'moderate' ? 'bg-yellow-100 dark:bg-yellow-900/30' : 'bg-red-100 dark:bg-red-900/30'
                    }`}>
                      <div
                        className={`w-8 rounded-t ${
                          month.status === 'good' ? 'bg-green-500' :
                          month.status === 'moderate' ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ height: `${month.risk * 2}%` }}
                      ></div>
                    </div>
                    <p className="text-xs font-medium text-gray-600 dark:text-gray-400">{month.month}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">{month.risk}% risk</p>
                  </div>
                ))}
              </div>

              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 dark:bg-blue-900/30 dark:border-blue-700">
                <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-2">🔮 AI Prediction</h3>
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  Based on your current trends, maintaining regular exercise and medication adherence will keep your health score above 80 for the next 6 months. Consider increasing water intake and getting 7-8 hours of sleep.
                </p>
              </div>
            </div>
          </div>
        )}


        {/* Find Doctor Tab */}
        {/* ... (no changes needed yet) ... */}
          {user && activeTab === 'find-doctor' && (
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100 dark:bg-gray-800 dark:border-gray-700">
            {/* ... (UI for find doctor) ... */}
             <div className="flex items-center gap-3 mb-6">
              <div className="bg-gradient-to-r from-blue-600 to-green-600 p-3 rounded-lg">
                <Phone className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">Find Specialists</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">Connect with the right doctor</p>
              </div>
            </div>
             <div className="space-y-4">
              {[
                { name: 'Dr. Priya Sharma', specialty: 'General Physician', distance: '2.3 km', rating: '4.8', available: 'Today 3:00 PM' },
                { name: 'Dr. Rajesh Kumar', specialty: 'Internal Medicine', distance: '3.1 km', rating: '4.9', available: 'Today 5:00 PM' },
                { name: 'Dr. Anjali Verma', specialty: 'Dermatologist', distance: '4.5 km', rating: '4.7', available: 'Tomorrow 10:00 AM' }
              ].map((doctor, idx) => (
                <div key={idx} className="p-4 bg-gray-50 rounded-lg border border-gray-200 hover:shadow-md transition dark:bg-gray-700/50 dark:border-gray-600 dark:hover:bg-gray-700">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-semibold text-gray-800 dark:text-gray-200">{doctor.name}</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{doctor.specialty}</p>
                    </div>
                    <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-medium dark:bg-green-900/50 dark:text-green-300">
                      ⭐ {doctor.rating}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-600 mb-3 dark:text-gray-400">
                    <span>📍 {doctor.distance} away</span>
                    <span>🕐 {doctor.available}</span>
                  </div>
                  <button className="w-full bg-gradient-to-r from-blue-600 to-green-600 text-white py-2 rounded-lg font-medium hover:from-blue-700 hover:to-green-700 transition">
                    Book Appointment
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      {/* ... (no changes needed) ... */}
      <div className="bg-gray-800 text-white py-6 mt-12 dark:bg-black/50">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-sm text-gray-300">
            <strong>Disclaimer:</strong> MediMind AI is an assistive tool and does not replace professional medical advice. Always consult a qualified healthcare provider for diagnosis and treatment.
          </p>
          <p className="text-xs text-gray-400 mt-2">
            Pulse coders | Built with ❤️ 
          </p>
        </div>
      </div>
    </div>
  );
};

export default MediMindAI;