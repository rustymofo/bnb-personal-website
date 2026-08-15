import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: 'AIzaSyD9Zd49nTCdHglh-rX7UfvkjmG7nsxsoBY',
  authDomain: 'bnb-personal-website.firebaseapp.com',
  projectId: 'bnb-personal-website',
  storageBucket: 'bnb-personal-website.firebasestorage.app',
  messagingSenderId: '791458718298',
  appId: '1:791458718298:web:2d7ecf95ad1e998e042e63',
  measurementId: 'G-D8YG2CMGTM',
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
