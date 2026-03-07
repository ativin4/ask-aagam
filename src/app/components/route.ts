import { NextResponse } from "next/server";
import * as admin from "firebase-admin";
import { Storage } from "@google-cloud/storage";

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

// Initialize GCS
const storage = new Storage({
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  credentials: {
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
});

const bucketName = process.env.NEXT_PUBLIC_BUCKET_NAME!;
const bucket = storage.bucket(bucketName);

export async function GET() {
  try {
    // Fetch all files in the "uploads/" directory
    const [files] = await bucket.getFiles({ prefix: 'uploads/' });
    
    const books = files
      // Filter out the folder placeholder itself (if GCS returns it)
     .filter(file => file.name !== 'uploads/')
     .map(file => ({
        id: file.name,
        // Remove the 'uploads/' prefix and the timestamp we added during upload to get a clean title
        title: file.name.replace('uploads/', '').replace(/^\d+-/, ''), 
        url: `https://storage.googleapis.com/${bucketName}/${file.name}`
      }));

    return NextResponse.json({ books });
  } catch (error: unknown) {
    console.error("Error listing books:", error);
    return NextResponse.json({ error: "Failed to fetch book list" }, { status: 500 });
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
        const file = bucket.file(`uploads/${Date.now()}-${fileName}`);

        // Generate a Signed URL valid for 15 minutes
        const [signedUrl] = await file.getSignedUrl({
            version: "v4",
            action: "write",
            expires: Date.now() + 15 * 60 * 1000,
            contentType: fileType,
        });
        
        return { fileName, signedUrl, storagePath: file.name };
    }));

    return NextResponse.json({ signedUrls });
  } catch (error: unknown) {
    console.error("Error generating signed URLs:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}