// src/firebase.ts
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDBeqK7AApohbhUmO7apM6HZnpwUjD6FCo",
  authDomain: "mahjong-stats-8f6be.firebaseapp.com",
  projectId: "mahjong-stats-8f6be",
  storageBucket: "mahjong-stats-8f6be.firebasestorage.app",
  messagingSenderId: "598110873685",
  appId: "1:598110873685:web:d35986d8091ab3a7058cdc",
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);

// 匿名ログイン（ユーザー操作なし）
export async function ensureAnonAuth() {
  if (auth.currentUser) return;
  await signInAnonymously(auth);
}