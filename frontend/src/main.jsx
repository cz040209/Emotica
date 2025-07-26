// src/main.jsx
// This file is the entry point for React application.
// Save this content as 'main.jsx' inside your 'src' folder (e.g., my-chatbot-ui/src/main.jsx).

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx'; // Import the main App component
import './index.css'; // Import global CSS styles (if any, though Tailwind handles most styling here)

// Create a React root and render the App component into the 'root' div in index.html
ReactDOM.createRoot(document.getElementById('root')).render(
  // React.StrictMode is a tool for highlighting potential problems in an application.
  // It activates additional checks and warnings for its descendants.
  <React.StrictMode>
    <App /> {/* Render the main App component */}
  </React.StrictMode>,
);
