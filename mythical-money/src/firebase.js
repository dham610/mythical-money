import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyD-pNTwJ7xoTtYN2eDQb7V331Gcu5j4Ims",
  authDomain: "mythical-money-741b2.firebaseapp.com",
  databaseURL: "https://mythical-money-741b2-default-rtdb.firebaseio.com",
  projectId: "mythical-money-741b2",
  storageBucket: "mythical-money-741b2.firebasestorage.app",
  messagingSenderId: "668115595532",
  appId: "1:668115595532:web:48304b762124f78a199929"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
