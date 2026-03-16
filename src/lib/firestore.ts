import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Guard against multiple initializations during Next.js hot reload
if (getApps().length === 0) {
  initializeApp({
    projectId: process.env.GOOGLE_CLOUD_PROJECT || "smart-scheduler-f76af",
  });
}

export const db = getFirestore();
