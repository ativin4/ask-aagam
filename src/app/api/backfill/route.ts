import { NextResponse } from "next/server";
import * as admin from "firebase-admin";
import { Storage } from "@google-cloud/storage";
import { getFirestore } from "firebase-admin/firestore";

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.NEXT_FILE_UPLOAD_CLIENT_EMAIL,
      privateKey: process.env.NEXT_FILE_UPLOAD_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = getFirestore();
const storage = new Storage({
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  credentials: {
    client_email: process.env.NEXT_FILE_UPLOAD_CLIENT_EMAIL,
    private_key: process.env.NEXT_FILE_UPLOAD_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
});

const bucketName = process.env.NEXT_PUBLIC_BUCKET_NAME!;
const bucket = storage.bucket(bucketName);

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.split("Bearer ")[1];
    const decodedToken = await admin.auth().verifyIdToken(token);

    if (decodedToken.maintainer !== true) {
      return NextResponse.json({ error: "Forbidden: Maintainers only" }, { status: 403 });
    }

    // 1. Fetch all files from GCS uploads folder
    const [files] = await bucket.getFiles({ prefix: 'uploads/' });
    
    const results = [];

    for (const file of files) {
        if (file.name.endsWith('/')) continue; // Skip folder placeholder

        // 2. Check if this file is already in Firestore to avoid duplicates
        const existingDocs = await db.collection('scriptures')
            .where('gcsPath', '==', file.name)
            .get();

        if (!existingDocs.empty) {
            results.push({ file: file.name, status: 'skipped', reason: 'already exists' });
            continue;
        }

        // 3. Create metadata and add to Firestore
        const title = file.name
            .replace(/^uploads\//, '')
            .replace(/^\d+-/, '')
            .replace(/\.[^/.]+$/, "");
        const url = `https://storage.googleapis.com/${bucketName}/${file.name}`;

        const docRef = db.collection('scriptures').doc();
        await docRef.set({
            title,
            url,
            gcsPath: file.name,
            categories: [], 
            writer: '',     
            description: '',
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        results.push({ file: file.name, status: 'migrated', id: docRef.id });
    }

    return NextResponse.json({ message: "Backfill complete", results });
  } catch (error: any) {
    console.error("Backfill error:", error);
    if (error.code === 5) { // gRPC code for NOT_FOUND
      const detailedError = "Firestore query failed. This is likely due to a missing Single Field Index. Please check the 'Single Field Indexes' tab in the Firestore Console for the 'scriptures' collection.";
      return NextResponse.json({ error: "Firestore Query Error", message: detailedError, details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: "Internal Server Error", details: error.message }, { status: 500 });
  }
}
