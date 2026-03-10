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

// Initialize GCS
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

export async function GET() {
  try {
    // Fetch scriptures from Firestore
    const snapshot = await db.collection('scriptures').orderBy('createdAt', 'desc').get();
    const scriptures = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return NextResponse.json({ scriptures });
  } catch (error: unknown) {
    console.error("Error listing scriptures:", error);
    return NextResponse.json({ error: "Failed to fetch scripture list" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.split("Bearer ")[1];
    const decodedToken = await admin.auth().verifyIdToken(token);

    // Strict RBAC Check
    if (decodedToken.maintainer !== true) {
      return NextResponse.json({ error: "Forbidden: Maintainers only" }, { status: 403 });
    }

    const { files } = await request.json();
    
    if (!files || !Array.isArray(files)) {
        return NextResponse.json({ error: "Invalid payload, expected 'files' array" }, { status: 400 });
    }

    const signedUrls = await Promise.all(files.map(async (fileMeta: { fileName: string, fileType: string }) => {
        const { fileName, fileType } = fileMeta;
        // We store raw uploads in an "uploads" folder to process them later in the AI pipeline
        const storagePath = `uploads/${Date.now()}-${fileName}`;
        const file = bucket.file(storagePath);

        // Generate a Signed URL valid for 15 minutes
        const [signedUrl] = await file.getSignedUrl({
            version: "v4",
            action: "write",
            expires: Date.now() + 15 * 60 * 1000,
            contentType: fileType,
        });
        
        // Add to Firestore
        const title = fileName.replace(/\.[^/.]+$/, "");
        const url = `https://storage.googleapis.com/${bucketName}/${storagePath}`;

        await db.collection('scriptures').add({
            title,
            url,
            gcsPath: storagePath,
            categories: [],
            writer: '',
            description: '',
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        return { fileName, signedUrl, storagePath };
    }));

    return NextResponse.json({ signedUrls });
  } catch (error: unknown) {
    console.error("Error generating signed URLs:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}