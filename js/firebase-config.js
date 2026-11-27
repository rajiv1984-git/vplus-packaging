// ===================================================================
//  V-Plus website – Firebase settings
//  1. Paste your Firebase web app config below (Firebase console →
//     Project settings → General → Your apps → Web app → "Config").
//  2. List the staff email addresses that may open the Staff dashboard.
//     Keep this list the same as the one in firestore.rules.
// ===================================================================

export const firebaseConfig = {
  apiKey: "AIzaSyAFCSdt6Y1FJOFtieNJ6dpO5IFhGoqtReM",
  authDomain: "vplus-website.firebaseapp.com",
  projectId: "vplus-website",
  storageBucket: "vplus-website.firebasestorage.app",
  messagingSenderId: "1028284718827",
  appId: "1:1028284718827:web:2282ecd223a713b8fc68ae",
};

export const STAFF_EMAILS = [
  "rajiv@vpluspackagingrwanda.com",
  "info@vpluspackagingrwanda.com",
  "sales@vpluspackagingrwanda.com",
];
