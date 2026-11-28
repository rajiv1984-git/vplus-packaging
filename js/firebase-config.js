// ===================================================================
//  V-Plus website – Firebase settings
// ===================================================================

export const firebaseConfig = {
  apiKey: "AIzaSyAFCSdt6Y1FJOFtieNJ6dpO5IFhGoqtReM",
  authDomain: "vplus-website.firebaseapp.com",
  projectId: "vplus-website",
  storageBucket: "vplus-website.firebasestorage.app",
  messagingSenderId: "1028284718827",
  appId: "1:1028284718827:web:2282ecd223a713b8fc68ae",
};

// Staff, Admin and Super Admin accounts log in with a username (e.g. "admin.aarav").
// Behind the scenes Firebase stores it as  username@USERNAME_DOMAIN.
export const USERNAME_DOMAIN = "accounts.vplus-website.firebaseapp.com";

// The one and only Super Admin account (its Firebase user UID). Must match superUid() in firestore.rules.
export const SUPER_UID = "";
